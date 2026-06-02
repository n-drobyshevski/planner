"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/supabase/query-keys";
import * as m from "@/lib/supabase/mutations";
import type { EventInput } from "@/lib/supabase/mappers";
import type { EventRow } from "@/lib/types";
import type { OccurrencePatch } from "@/lib/recurrence/edit-semantics";

/** One item of a batched move/resize: a master-row update or a single-occurrence modify. */
export type RescheduleOp =
  | { kind: "update"; id: string; patch: Partial<EventInput> }
  | { kind: "override"; event: EventRow; occurrenceDate: number; patch: OccurrencePatch };

/** One item of a batched delete: a whole row or a single-occurrence cancel. */
export type DeleteOp =
  | { kind: "delete"; id: string }
  | { kind: "cancel"; event: EventRow; occurrenceDate: number };

/**
 * Event write operations wrapped with cache invalidation + toasts. Realtime
 * also invalidates, so the other member sees changes live.
 */
export function useEventMutations(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const sb = createClient();

  const invalidate = () => {
    if (workspaceId) qc.invalidateQueries({ queryKey: qk.eventsAll(workspaceId) });
  };

  async function run<T>(p: Promise<T>, okMsg: string): Promise<boolean> {
    try {
      await p;
      invalidate();
      toast.success(okMsg);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      return false;
    }
  }

  return {
    create: (input: EventInput) => run(m.createEvent(sb, input), "Event created"),
    updateSingle: (id: string, patch: Partial<EventInput>) =>
      run(m.updateEvent(sb, id, patch), "Event updated"),
    /**
     * Move/resize several items at once — one invalidate + one toast. Mixes
     * master-row updates (non-recurring, or a whole recurring series) with
     * per-occurrence "modify" overrides (a single recurring instance).
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
      ),
    remove: (id: string) => run(m.deleteEvent(sb, id), "Event deleted"),
    /** Delete several items — whole rows and/or single-occurrence cancels. */
    removeMany: (ops: DeleteOp[]) =>
      run(
        Promise.all(
          ops.map((o) =>
            o.kind === "delete"
              ? m.deleteEvent(sb, o.id)
              : m.applyOverride(sb, workspaceId!, {
                  eventId: o.event.id,
                  occurrenceDate: o.occurrenceDate,
                  type: "cancel",
                }),
          ),
        ),
        `${ops.length} events deleted`,
      ),

    assignContext: (eventId: string, contextId: string) =>
      run(m.assignToContext(sb, eventId, contextId), "Added to context"),
    removeContext: (eventId: string) =>
      run(m.removeFromContext(sb, eventId), "Removed from context"),

    editThis: (event: EventRow, occurrenceMs: number, patch: OccurrencePatch) =>
      run(
        m.applyOverride(sb, workspaceId!, {
          eventId: event.id,
          occurrenceDate: occurrenceMs,
          type: "modify",
          patch,
        }),
        "This event updated",
      ),
    editFuture: (
      event: EventRow,
      occurrenceMs: number,
      patch: OccurrencePatch,
      contextId?: string | null,
      color?: string | null,
    ) =>
      run(
        m.splitSeries(sb, event, occurrenceMs, patch, contextId, color),
        "This and future updated",
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
      ),
    deleteFuture: (event: EventRow, occurrenceMs: number) =>
      run(m.deleteThisAndFuture(sb, event, occurrenceMs), "This and future deleted"),
    deleteAll: (id: string) => run(m.deleteEvent(sb, id), "Series deleted"),
  };
}
