"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/supabase/query-keys";
import * as m from "@/lib/supabase/mutations";
import type { DeletedSnapshot } from "@/lib/supabase/mutations";
import { isWindowData, type WindowData } from "@/lib/supabase/queries";
import type { EventInput } from "@/lib/supabase/mappers";
import type { EventRow, OverrideRow, OverrideType } from "@/lib/types";
import type { OccurrencePatch } from "@/lib/recurrence/edit-semantics";
import type { ItemAttributes } from "@/lib/attributes/schema";
import { editAll as computeEditAll } from "@/lib/recurrence/edit-semantics";
import { useHistoryStore } from "@/stores/history-store";
import { useNotify } from "@/lib/hooks/use-notify";
import { useTranslations } from "next-intl";

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
  // undoById reverses exactly the action this toast belongs to (Ctrl+Z, via
  // components/undo-hotkey.tsx, still uses runUndo to pop the newest entry).
  const undoById = useHistoryStore((s) => s.undoById);
  const notify = useNotify();
  const t = useTranslations("toasts");
  const tc = useTranslations("common");

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
      isWindowData(old)
        ? { ...old, events: old.events.map((e) => (e.id === eventId ? patch(e) : e)) }
        : old,
    );
    return () => prev.forEach(([key, data]) => qc.setQueryData(key, data));
  };
  const removeEventFromWindows = (eventId: string) => {
    if (!workspaceId) return () => {};
    const prev = qc.getQueriesData<WindowData>({ queryKey: qk.eventsAll(workspaceId) });
    qc.setQueriesData<WindowData>({ queryKey: qk.eventsAll(workspaceId) }, (old) =>
      isWindowData(old) ? { ...old, events: old.events.filter((e) => e.id !== eventId) } : old,
    );
    return () => prev.forEach(([key, data]) => qc.setQueryData(key, data));
  };

  // Upsert a provisional override into every cached window, keyed (like the
  // server's event_id,occurrence_date unique constraint) on eventId +
  // occurrenceDate, so a single-occurrence edit/cancel shows before the round
  // trip. `build` receives any existing override for that key so a "modify"
  // merges onto it (mirroring the server's column-wise upsert).
  const upsertOverrideInWindows = (
    eventId: string,
    occurrenceDate: number,
    build: (existing: OverrideRow | undefined) => OverrideRow,
  ) => {
    if (!workspaceId) return () => {};
    const prev = qc.getQueriesData<WindowData>({ queryKey: qk.eventsAll(workspaceId) });
    qc.setQueriesData<WindowData>({ queryKey: qk.eventsAll(workspaceId) }, (old) => {
      if (!isWindowData(old)) return old;
      const idx = old.overrides.findIndex(
        (o) => o.eventId === eventId && o.occurrenceDate === occurrenceDate,
      );
      const built = build(idx >= 0 ? old.overrides[idx] : undefined);
      const overrides =
        idx >= 0
          ? old.overrides.map((o, i) => (i === idx ? built : o))
          : [...old.overrides, built];
      return { ...old, overrides };
    });
    return () => prev.forEach(([key, data]) => qc.setQueryData(key, data));
  };

  /** Build a provisional override row, merging a modify patch onto any existing one. */
  const provisionalOverride = (
    existing: OverrideRow | undefined,
    eventId: string,
    occurrenceDate: number,
    type: OverrideType,
    patch?: OccurrencePatch,
  ): OverrideRow => {
    const base: OverrideRow = existing ?? {
      id: `optimistic:${eventId}:${occurrenceDate}`,
      workspaceId: workspaceId!,
      eventId,
      occurrenceDate,
      type,
      title: null,
      description: null,
      location: null,
      categoryId: null,
      start: null,
      end: null,
      allDay: null,
    };
    if (type === "cancel") return { ...base, type: "cancel" };
    // modify: only the override-backed columns (inactive/status are series-level
    // and the server's applyOverride leaves them alone, so we do too).
    const p = patch ?? {};
    return {
      ...base,
      type: "modify",
      ...(p.title !== undefined ? { title: p.title } : {}),
      ...(p.description !== undefined ? { description: p.description } : {}),
      ...(p.location !== undefined ? { location: p.location } : {}),
      ...(p.categoryId !== undefined ? { categoryId: p.categoryId } : {}),
      ...(p.start !== undefined ? { start: p.start } : {}),
      ...(p.end !== undefined ? { end: p.end } : {}),
      ...(p.allDay !== undefined ? { allDay: p.allDay } : {}),
    };
  };

  /** Master-row patch for a move/resize op (start/end/allDay are identically typed
   *  on EventInput and EventRow, so this stays type-safe). */
  const rowMovePatch = (p: Partial<EventInput>): Partial<EventRow> => ({
    ...(p.start !== undefined ? { start: p.start } : {}),
    ...(p.end !== undefined ? { end: p.end } : {}),
    ...(p.allDay !== undefined ? { allDay: p.allDay } : {}),
  });

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
          toast.error(e instanceof Error ? e.message : t("couldntUndo"));
          return false;
        }),
  });

  async function run<T>(
    p: Promise<T>,
    okMsg: string,
    undo?: (result: T) => UndoSpec | null,
    /** Apply an optimistic cache patch now; returns the rollback for the catch. */
    optimistic?: () => () => void,
    /** Toast options: a longer-lived destructive toast (offerUndo) + subtitle. */
    opts?: { description?: string; offerUndo?: boolean },
  ): Promise<boolean> {
    const rollback = optimistic?.();
    try {
      const result = await p;
      invalidate();
      const spec = undo?.(result) ?? null;
      const undoId = spec ? pushUndo(spec) : null;
      // Every undoable action gets a visible Undo on the toast (works on mobile,
      // where there's no Ctrl+Z); it reverses exactly THIS action via undoById.
      // Destructive actions (offerUndo) add a subtitle and hold the toast longer
      // so there's time to reach for it. Goes through notify so it respects the
      // member's showSuccessToasts pref; Ctrl+Z works regardless.
      notify.success(okMsg, {
        description: opts?.description,
        duration: opts?.offerUndo ? 8000 : undefined,
        action:
          undoId != null
            ? {
                label: tc("undo"),
                onClick: () =>
                  void undoById(undoId).then(
                    (label) => label && notify.success(t("undone", { label })),
                  ),
              }
            : undefined,
      });
      return true;
    } catch (e) {
      rollback?.(); // restore the pre-patch snapshot on failure
      toast.error(e instanceof Error ? e.message : tc("somethingWentWrong"));
      return false;
    }
  }

  return {
    create: (input: EventInput) =>
      run(m.createEvent(sb, input), t("eventCreated"), (row) =>
        inverse(t("undoLabel.create"), () => m.deleteEvent(sb, row.id)),
      ),
    /** Duplicate several items at once — one invalidate + one toast. */
    createMany: (inputs: EventInput[]) =>
      run(
        Promise.all(inputs.map((i) => m.createEvent(sb, i))),
        t("eventsCreated", { count: inputs.length }),
        (rows) =>
          rows.length === 0
            ? null
            : inverse(t("undoLabel.create"), () =>
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
        t("eventUpdated"),
        (row) =>
          prev ? inverse(t("undoLabel.edit"), () => m.updateEvent(sb, id, prev, row.updatedAt)) : null,
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
        t("eventsUpdated", { count: ops.length }),
        () => {
          const undoable = ops.filter(
            (o): o is Extract<RescheduleOp, { kind: "update" }> & {
              prev: Partial<EventInput>;
            } => o.kind === "update" && o.prev != null,
          );
          return undoable.length === 0
            ? null
            : inverse(t("undoLabel.move"), () =>
                Promise.all(undoable.map((o) => m.updateEvent(sb, o.id, o.prev))),
              );
        },
        () => {
          // Patch master rows (moves/resizes) and inject per-occurrence modify
          // overrides (single recurring instances) so a group drag shows at once.
          const rollbacks = ops.map((o) =>
            o.kind === "update"
              ? patchEventWindows(o.id, (e) => ({ ...e, ...rowMovePatch(o.patch) }))
              : upsertOverrideInWindows(o.event.id, o.occurrenceDate, (ex) =>
                  provisionalOverride(ex, o.event.id, o.occurrenceDate, "modify", o.patch),
                ),
          );
          return () => rollbacks.forEach((r) => r());
        },
      ),
    remove: (id: string, opts?: { description?: string }) =>
      run(
        m.deleteEventDeep(sb, id),
        t("eventDeleted"),
        (snap) => inverse(t("undoLabel.delete"), () => m.restoreDeleted(sb, snap)),
        () => removeEventFromWindows(id),
        { description: opts?.description, offerUndo: true },
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
        t("eventsDeleted", { count: ops.length }),
        (results) => {
          const snaps = results.filter((r): r is DeletedSnapshot => r != null);
          if (snaps.length === 0) return null; // only recurring cancels — not undoable in v1
          const merged: DeletedSnapshot = {
            tasks: snaps.flatMap((s) => s.tasks),
            events: snaps.flatMap((s) => s.events),
            overrides: snaps.flatMap((s) => s.overrides),
            checkpoints: snaps.flatMap((s) => s.checkpoints),
          };
          return inverse(t("undoLabel.delete"), () => m.restoreDeleted(sb, merged));
        },
        undefined,
        { offerUndo: true },
      ),

    /** Assign an event to a Context (category), or clear it (categoryId = null). */
    assignCategory: (
      eventId: string,
      categoryId: string | null,
      prevCategoryId?: string | null,
    ) =>
      run(
        m.updateEvent(sb, eventId, { categoryId }),
        categoryId ? t("assignedToContext") : t("removedFromContext"),
        (row) =>
          prevCategoryId !== undefined
            ? inverse(t("undoLabel.contextChange"), () =>
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
        t("thisEventUpdated"),
        ({ prior }) =>
          inverse(t("undoLabel.edit"), () => m.revertOverride(sb, event.id, occurrenceMs, prior)),
        () =>
          upsertOverrideInWindows(event.id, occurrenceMs, (ex) =>
            provisionalOverride(ex, event.id, occurrenceMs, "modify", patch),
          ),
      ),
    editFuture: (
      event: EventRow,
      occurrenceMs: number,
      patch: OccurrencePatch,
      color?: string | null,
      attributes?: ItemAttributes,
    ) =>
      run(
        m.splitSeries(sb, event, occurrenceMs, patch, color, attributes),
        t("thisAndFutureUpdated"),
        (newSeries) =>
          // Undo the split: drop the new future series, restore the original rrule.
          inverse(t("undoLabel.edit"), async () => {
            await m.deleteEvent(sb, newSeries.id);
            await m.updateEvent(sb, event.id, {
              rrule: event.rrule,
              recurrenceEndsAt: event.recurrenceEndsAt,
            });
          }),
      ),
    editAll: (event: EventRow, patch: OccurrencePatch) =>
      run(
        m.updateAll(sb, event, patch),
        t("allEventsUpdated"),
        undefined,
        () =>
          patchEventWindows(event.id, (e) => ({ ...e, ...computeEditAll(event, patch) })),
      ),

    deleteThis: (event: EventRow, occurrenceMs: number) =>
      run(
        m.applyOverride(sb, workspaceId!, {
          eventId: event.id,
          occurrenceDate: occurrenceMs,
          type: "cancel",
        }),
        t("eventDeleted"),
        ({ prior }) =>
          inverse(t("undoLabel.delete"), () => m.revertOverride(sb, event.id, occurrenceMs, prior)),
        () =>
          upsertOverrideInWindows(event.id, occurrenceMs, (ex) =>
            provisionalOverride(ex, event.id, occurrenceMs, "cancel"),
          ),
      ),
    deleteFuture: (event: EventRow, occurrenceMs: number) =>
      run(m.deleteThisAndFuture(sb, event, occurrenceMs), t("thisAndFutureDeleted"), () =>
        inverse(t("undoLabel.delete"), () =>
          m.updateEvent(sb, event.id, {
            rrule: event.rrule,
            recurrenceEndsAt: event.recurrenceEndsAt,
          }),
        ),
      ),
    deleteAll: (id: string) =>
      run(
        m.deleteEventDeep(sb, id),
        t("seriesDeleted"),
        (snap) => inverse(t("undoLabel.deleteSeries"), () => m.restoreDeleted(sb, snap)),
        undefined,
        { offerUndo: true },
      ),
  };
}
