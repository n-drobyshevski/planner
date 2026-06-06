"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/supabase/query-keys";
import * as m from "@/lib/supabase/mutations";
import type { DeletedSnapshot } from "@/lib/supabase/mutations";
import type { WindowData } from "@/lib/supabase/queries";
import type { EventInput } from "@/lib/supabase/mappers";
import type { EventRow } from "@/lib/types";
import type { OccurrencePatch } from "@/lib/recurrence/edit-semantics";
import { useHistoryStore } from "@/stores/history-store";
import { useNotify } from "@/lib/hooks/use-notify";

/** One item of a batched move/resize: a master-row update or a single-occurrence modify. */
export type RescheduleOp =
  | {
      kind: "update";
      id: string;
      patch: Partial<EventInput>;
      /** Pre-move values for the patched fields, so the batch can be undone. */
      prev?: Partial<EventInput>;
    }
  | { kind: "override"; event: EventRow; occurrenceDate: number; patch: OccurrencePatch };

/** One item of a batched delete: a whole row or a single-occurrence cancel. */
export type DeleteOp =
  | { kind: "delete"; id: string }
  | { kind: "cancel"; event: EventRow; occurrenceDate: number };

/** A reversible action: a label for the toast + the inverse to run. */
type UndoSpec = { label: string; undo: () => Promise<boolean> };

/**
 * Event write operations wrapped with cache invalidation + toasts. Realtime
 * also invalidates, so the other member sees changes live. Successful writes
 * push an inverse onto the history store so Ctrl+Z can undo them.
 */
export function useEventMutations(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const sb = createClient();
  const pushUndo = useHistoryStore((s) => s.push);
  const runUndo = useHistoryStore((s) => s.runUndo);
  const notify = useNotify();

  const invalidate = () => {
    if (workspaceId) qc.invalidateQueries({ queryKey: qk.eventsAll(workspaceId) });
  };

  // --- Optimistic cache patches -------------------------------------------
  // Patch every cached window (the prev/current/next swipe panes + prefetched
  // neighbours all share the ["events", workspaceId, …] prefix) so the change
  // shows instantly, before the server round-trip. Each returns a rollback that
  // restores the pre-patch snapshots; `run` calls it if the write throws. The
  // success path's invalidate() — plus realtime — reconciles with server truth.
  // Generalizes calendar-shell's single-window `optimisticMove` to all windows.
  const patchEventWindows = (eventId: string, patch: (e: EventRow) => EventRow) => {
    if (!workspaceId) return () => {};
    const prev = qc.getQueriesData<WindowData>({ queryKey: qk.eventsAll(workspaceId) });
    qc.setQueriesData<WindowData>({ queryKey: qk.eventsAll(workspaceId) }, (old) =>
      old ? { ...old, events: old.events.map((e) => (e.id === eventId ? patch(e) : e)) } : old,
    );
    return () => prev.forEach(([key, data]) => qc.setQueryData(key, data));
  };
  const removeEventFromWindows = (eventId: string) => {
    if (!workspaceId) return () => {};
    const prev = qc.getQueriesData<WindowData>({ queryKey: qk.eventsAll(workspaceId) });
    qc.setQueriesData<WindowData>({ queryKey: qk.eventsAll(workspaceId) }, (old) =>
      old ? { ...old, events: old.events.filter((e) => e.id !== eventId) } : old,
    );
    return () => prev.forEach(([key, data]) => qc.setQueryData(key, data));
  };

  /** Wrap a raw inverse op: invalidate on success, toast + false on failure. */
  const inverse = (label: string, op: () => Promise<unknown>): UndoSpec => ({
    label,
    undo: () =>
      op()
        .then(() => {
          invalidate();
          return true;
        })
        .catch((e) => {
          toast.error(e instanceof Error ? e.message : "Couldn't undo");
          return false;
        }),
  });

  async function run<T>(
    p: Promise<T>,
    okMsg: string,
    undo?: (result: T) => UndoSpec | null,
    /** Apply an optimistic cache patch now; returns the rollback for the catch. */
    optimistic?: () => () => void,
  ): Promise<boolean> {
    const rollback = optimistic?.();
    try {
      const result = await p;
      invalidate();
      const spec = undo?.(result) ?? null;
      if (spec) pushUndo(spec);
      // Undoable actions get a visible Undo on the toast (works on mobile, where
      // there's no Ctrl+Z); it pops the same history entry Ctrl+Z would.
      notify.success(
        okMsg,
        spec ? { action: { label: "Undo", onClick: () => void runUndo() } } : undefined,
      );
      return true;
    } catch (e) {
      rollback?.(); // restore the pre-patch snapshot on failure
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      return false;
    }
  }

  return {
    create: (input: EventInput) =>
      run(m.createEvent(sb, input), "Event created", (row) =>
        inverse("create", () => m.deleteEvent(sb, row.id)),
      ),
    /** Duplicate several items at once — one invalidate + one toast. */
    createMany: (inputs: EventInput[]) =>
      run(
        Promise.all(inputs.map((i) => m.createEvent(sb, i))),
        `${inputs.length} events created`,
        (rows) =>
          rows.length === 0
            ? null
            : inverse("create", () =>
                Promise.all(rows.map((r) => m.deleteEvent(sb, r.id))),
              ),
      ),
    updateSingle: (
      id: string,
      patch: Partial<EventInput>,
      prev?: Partial<EventInput>,
      /** Row fields to apply optimistically (e.g. { color } from a recolor). Pass
       *  only when the caller doesn't already patch the cache itself — moves use
       *  calendar-shell's optimisticMove, so they leave this undefined. */
      optimisticRowPatch?: Partial<EventRow>,
    ) =>
      run(
        m.updateEvent(sb, id, patch),
        "Event updated",
        (row) =>
          prev ? inverse("edit", () => m.updateEvent(sb, id, prev, row.updatedAt)) : null,
        optimisticRowPatch
          ? () => patchEventWindows(id, (e) => ({ ...e, ...optimisticRowPatch }))
          : undefined,
      ),
    /**
     * Move/resize several items at once — one invalidate + one toast. Mixes
     * master-row updates (non-recurring, or a whole recurring series) with
     * per-occurrence "modify" overrides (a single recurring instance). Only the
     * master-row updates that carry `prev` are undoable (overrides are skipped).
     */
    rescheduleMany: (ops: RescheduleOp[]) =>
      run(
        Promise.all(
          ops.map((o) =>
            o.kind === "update"
              ? m.updateEvent(sb, o.id, o.patch)
              : m.applyOverride(sb, workspaceId!, {
                  eventId: o.event.id,
                  occurrenceDate: o.occurrenceDate,
                  type: "modify",
                  patch: o.patch,
                }),
          ),
        ),
        `${ops.length} events updated`,
        () => {
          const undoable = ops.filter(
            (o): o is Extract<RescheduleOp, { kind: "update" }> & {
              prev: Partial<EventInput>;
            } => o.kind === "update" && o.prev != null,
          );
          return undoable.length === 0
            ? null
            : inverse("move", () =>
                Promise.all(undoable.map((o) => m.updateEvent(sb, o.id, o.prev))),
              );
        },
      ),
    remove: (id: string) =>
      run(
        m.deleteEventDeep(sb, id),
        "Event deleted",
        (snap) => inverse("delete", () => m.restoreDeleted(sb, snap)),
        () => removeEventFromWindows(id),
      ),
    /** Delete several items — whole rows and/or single-occurrence cancels. */
    removeMany: (ops: DeleteOp[]) =>
      run(
        Promise.all(
          ops.map((o) =>
            o.kind === "delete"
              ? m.deleteEventDeep(sb, o.id)
              : m
                  .applyOverride(sb, workspaceId!, {
                    eventId: o.event.id,
                    occurrenceDate: o.occurrenceDate,
                    type: "cancel",
                  })
                  .then(() => null),
          ),
        ),
        `${ops.length} events deleted`,
        (results) => {
          const snaps = results.filter((r): r is DeletedSnapshot => r != null);
          if (snaps.length === 0) return null; // only recurring cancels — not undoable in v1
          const merged: DeletedSnapshot = {
            tasks: snaps.flatMap((s) => s.tasks),
            events: snaps.flatMap((s) => s.events),
            overrides: snaps.flatMap((s) => s.overrides),
          };
          return inverse("delete", () => m.restoreDeleted(sb, merged));
        },
      ),

    /** Assign an event to a Context (category), or clear it (categoryId = null). */
    assignCategory: (
      eventId: string,
      categoryId: string | null,
      prevCategoryId?: string | null,
    ) =>
      run(
        m.updateEvent(sb, eventId, { categoryId }),
        categoryId ? "Assigned to context" : "Removed from context",
        (row) =>
          prevCategoryId !== undefined
            ? inverse("context change", () =>
                m.updateEvent(sb, eventId, { categoryId: prevCategoryId }, row.updatedAt),
              )
            : null,
        () => patchEventWindows(eventId, (e) => ({ ...e, categoryId })),
      ),

    editThis: (event: EventRow, occurrenceMs: number, patch: OccurrencePatch) =>
      run(
        m.applyOverride(sb, workspaceId!, {
          eventId: event.id,
          occurrenceDate: occurrenceMs,
          type: "modify",
          patch,
        }),
        "This event updated",
        ({ prior }) =>
          inverse("edit", () => m.revertOverride(sb, event.id, occurrenceMs, prior)),
      ),
    editFuture: (
      event: EventRow,
      occurrenceMs: number,
      patch: OccurrencePatch,
      color?: string | null,
    ) =>
      run(
        m.splitSeries(sb, event, occurrenceMs, patch, color),
        "This and future updated",
        (newSeries) =>
          // Undo the split: drop the new future series, restore the original rrule.
          inverse("edit", async () => {
            await m.deleteEvent(sb, newSeries.id);
            await m.updateEvent(sb, event.id, {
              rrule: event.rrule,
              recurrenceEndsAt: event.recurrenceEndsAt,
            });
          }),
      ),
    editAll: (event: EventRow, patch: OccurrencePatch) =>
      run(m.updateAll(sb, event, patch), "All events updated"),

    deleteThis: (event: EventRow, occurrenceMs: number) =>
      run(
        m.applyOverride(sb, workspaceId!, {
          eventId: event.id,
          occurrenceDate: occurrenceMs,
          type: "cancel",
        }),
        "Event deleted",
        ({ prior }) =>
          inverse("delete", () => m.revertOverride(sb, event.id, occurrenceMs, prior)),
      ),
    deleteFuture: (event: EventRow, occurrenceMs: number) =>
      run(m.deleteThisAndFuture(sb, event, occurrenceMs), "This and future deleted", () =>
        inverse("delete", () =>
          m.updateEvent(sb, event.id, {
            rrule: event.rrule,
            recurrenceEndsAt: event.recurrenceEndsAt,
          }),
        ),
      ),
    deleteAll: (id: string) =>
      run(m.deleteEventDeep(sb, id), "Series deleted", (snap) =>
        inverse("delete series", () => m.restoreDeleted(sb, snap)),
      ),
  };
}
