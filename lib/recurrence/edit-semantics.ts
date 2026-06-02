// Recurring edit semantics — compute data changes for editing recurring events.
//
// Pure functions only: no I/O, no module-level current-time reads. All times are
// epoch milliseconds (UTC-based). These helpers return plain objects describing
// the mutations a data layer should persist; they never perform the mutations.

import { RRule } from "rrule";
import type { Options } from "rrule";
import type { EventRow, EventStatus } from "@/lib/types";

/** Fields that may be patched on a single occurrence (or, for editAll, the master). */
export interface OccurrencePatch {
  title?: string;
  description?: string | null;
  location?: string | null;
  categoryId?: string | null;
  start?: number;
  end?: number;
  allDay?: boolean;
  inactive?: boolean;
  status?: EventStatus;
}

/** Description of an override row to upsert for one occurrence of a recurring event. */
export interface OverrideInput {
  eventId: string;
  occurrenceDate: number;
  type: "cancel" | "modify";
  patch?: OccurrencePatch;
}

/**
 * Cancel ("delete this occurrence") a single occurrence of a recurring series.
 * The occurrenceDate is the ORIGINAL occurrence start (the stable override key).
 */
export function cancelOccurrence(
  eventId: string,
  occurrenceDate: number,
): OverrideInput {
  return { eventId, occurrenceDate, type: "cancel" };
}

/**
 * Modify ("edit only this occurrence") a single occurrence of a recurring series.
 * The occurrenceDate is the ORIGINAL occurrence start (the stable override key);
 * the patch carries the changed fields for this instance only.
 */
export function modifyOccurrence(
  eventId: string,
  occurrenceDate: number,
  patch: OccurrencePatch,
): OverrideInput {
  return { eventId, occurrenceDate, type: "modify", patch };
}

/**
 * Edit the entire series ("this and all events"). Returns the partial set of
 * fields to update on the master EventRow. When the patch moves `start` (and
 * does not explicitly set `end`), `end` is shifted by the same delta so the
 * occurrence duration is preserved.
 */
export function editAll(
  event: EventRow,
  patch: OccurrencePatch,
): Partial<EventRow> {
  const out: Partial<EventRow> = {};

  if (patch.title !== undefined) out.title = patch.title;
  if (patch.description !== undefined) out.description = patch.description;
  if (patch.location !== undefined) out.location = patch.location;
  if (patch.categoryId !== undefined) out.categoryId = patch.categoryId;
  if (patch.allDay !== undefined) out.allDay = patch.allDay;
  if (patch.inactive !== undefined) out.inactive = patch.inactive;
  if (patch.status !== undefined) out.status = patch.status;

  const hasStart = patch.start !== undefined;
  const hasEnd = patch.end !== undefined;

  if (hasStart) {
    const delta = (patch.start as number) - event.start;
    out.start = patch.start;
    // Preserve duration by shifting end by the same delta, unless end is given.
    out.end = hasEnd ? (patch.end as number) : event.end + delta;
  } else if (hasEnd) {
    out.end = patch.end;
  }

  return out;
}

/** Strip the leading "RRULE:" prefix that optionsToString emits, if present. */
function stripRrulePrefix(s: string): string {
  return s.replace(/^RRULE:/i, "");
}

/**
 * Split a series at a point ("this and all future events"). The original series
 * is ended just before the split (UNTIL = fromOccurrenceMs - 1000ms), and a new
 * series is created starting at the split point carrying the patch.
 *
 * The new series:
 *   - copies the event (minus id/createdAt/updatedAt),
 *   - starts at fromOccurrenceMs (or patch.start if given),
 *   - shifts end by the same delta to preserve duration (unless patch.end given),
 *   - keeps the recurrence FREQ/BYDAY (and other BY* rules), dropping any prior
 *     UNTIL/COUNT so the new series is open-ended,
 *   - inherits scope/visibility/owner/timeZone and the rest of the master fields,
 *   - applies the remaining patch fields (title/description/location/categoryId/allDay).
 */
export function splitThisAndFuture(
  event: EventRow,
  fromOccurrenceMs: number,
  patch: OccurrencePatch,
): {
  original: { id: string; rrule: string | null; recurrenceEndsAt: number | null };
  newSeries: Omit<EventRow, "id" | "createdAt" | "updatedAt">;
} {
  const untilMs = fromOccurrenceMs - 1000;

  // ---- original: set UNTIL just before the split point ----
  let originalRrule: string | null = null;
  if (event.rrule) {
    const opts: Partial<Options> = RRule.parseString(event.rrule);
    // Ending a series via UNTIL is mutually exclusive with COUNT in RFC5545.
    opts.count = null;
    opts.until = new Date(untilMs);
    originalRrule = stripRrulePrefix(RRule.optionsToString(opts));
  }

  const original = {
    id: event.id,
    rrule: originalRrule,
    recurrenceEndsAt: untilMs,
  };

  // ---- newSeries: starts at the split, open-ended, carries the patch ----
  const hasStart = patch.start !== undefined;
  const hasEnd = patch.end !== undefined;

  const newStart = hasStart ? (patch.start as number) : fromOccurrenceMs;
  const delta = newStart - event.start;
  const newEnd = hasEnd ? (patch.end as number) : event.end + delta;

  // Keep FREQ/BYDAY etc., drop any prior UNTIL/COUNT so the new series is fresh.
  let newRrule: string | null = null;
  if (event.rrule) {
    const opts: Partial<Options> = RRule.parseString(event.rrule);
    opts.until = null;
    opts.count = null;
    newRrule = stripRrulePrefix(RRule.optionsToString(opts));
  }

  const newSeries: Omit<EventRow, "id" | "createdAt" | "updatedAt"> = {
    workspaceId: event.workspaceId,
    ownerId: event.ownerId,
    categoryId:
      patch.categoryId !== undefined ? patch.categoryId : event.categoryId,
    title: patch.title !== undefined ? patch.title : event.title,
    description:
      patch.description !== undefined ? patch.description : event.description,
    location: patch.location !== undefined ? patch.location : event.location,
    isPrivate: event.isPrivate,
    isShared: event.isShared,
    color: event.color,
    kind: event.kind,
    allDay: patch.allDay !== undefined ? patch.allDay : event.allDay,
    inactive: patch.inactive !== undefined ? patch.inactive : event.inactive,
    status: patch.status !== undefined ? patch.status : event.status,
    start: newStart,
    end: newEnd,
    timeZone: event.timeZone,
    rrule: newRrule,
    // New series is open-ended (prior UNTIL/COUNT dropped).
    recurrenceEndsAt: null,
    taskId: event.taskId,
  };

  return { original, newSeries };
}
