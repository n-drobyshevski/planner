import { RRule } from "rrule";
import { TZDate } from "@date-fns/tz";
import type { EventRow, OverrideRow, Occurrence, TimeWindow } from "@/lib/types";

/**
 * Expand events (single + recurring) into concrete Occurrences within a window.
 *
 * Recurrence is DST-correct: we expand in "floating" wall-clock space (rrule
 * with NO tzid, using a UTC dtstart that carries the event's local wall-clock
 * parts), then map each occurrence back to a real UTC instant in the event's
 * IANA time zone. This keeps "09:00 every day" at 09:00 local even across a
 * daylight-saving transition.
 *
 * Expansion is always bounded to the visible window (plus a small DST pad);
 * it never enumerates an unbounded series.
 */

const DAY_MS = 86_400_000;
const PAD_MS = 36 * 60 * 60 * 1000; // covers any single-jump DST skew at edges

/** Wall-clock parts of a real instant, read in the given IANA zone. */
function floatingFromRealMs(realMs: number, tz: string): number {
  const d = new TZDate(realMs, tz);
  return Date.UTC(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
  );
}

/** Inverse: a floating ms (UTC carrying wall-clock parts) -> real instant in tz. */
function realFromFloatingMs(floatMs: number, tz: string): number {
  const d = new Date(floatMs);
  return new TZDate(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    tz,
  ).getTime();
}

/** Half-open intersection: [aStart,aEnd) overlaps [wStart,wEnd). */
function intersects(start: number, end: number, win: TimeWindow): boolean {
  return start < win.end && end > win.start;
}

function keyFor(eventId: string, occurrenceDate: number): string {
  return `${eventId}:${occurrenceDate}`;
}

function baseOccurrence(
  event: EventRow,
  occurrenceDate: number,
  start: number,
  end: number,
  opts: { isRecurring: boolean; isException: boolean },
): Occurrence {
  return {
    // Single events key on the (immutable) event id alone — they have exactly
    // one occurrence, so the key must NOT move with `start` (else a reschedule
    // would change the key and orphan any selection keyed on it). Recurring
    // instances key on id + original occurrenceDate (stable across "this" edits).
    key: opts.isRecurring ? keyFor(event.id, occurrenceDate) : event.id,
    eventId: event.id,
    occurrenceDate,
    start,
    end,
    allDay: event.allDay,
    // Series-level, like color/kind: every occurrence inherits the master's
    // inactive flag; applyOverride leaves it alone (no override column).
    inactive: event.inactive,
    title: event.title,
    description: event.description,
    location: event.location,
    categoryId: event.categoryId,
    // Color is series-level: every occurrence (incl. modify-exceptions) inherits
    // the master's color. Per-occurrence color would need an overrides.color
    // column — out of scope, so applyOverride deliberately leaves color alone.
    color: event.color,
    // kind is series-level, like color: every occurrence inherits the master's,
    // and applyOverride leaves it alone (no override column).
    kind: event.kind,
    ownerId: event.ownerId,
    isPrivate: event.isPrivate,
    taskId: event.taskId,
    isRecurring: opts.isRecurring,
    isException: opts.isException,
  };
}

function applyOverride(occ: Occurrence, ov: OverrideRow): Occurrence {
  return {
    ...occ,
    title: ov.title ?? occ.title,
    description: ov.description ?? occ.description,
    location: ov.location ?? occ.location,
    categoryId: ov.categoryId ?? occ.categoryId,
    start: ov.start ?? occ.start,
    end: ov.end ?? occ.end,
    allDay: ov.allDay ?? occ.allDay,
    isException: true,
  };
}

export function expandEvent(
  event: EventRow,
  overrides: OverrideRow[],
  win: TimeWindow,
): Occurrence[] {
  const out: Occurrence[] = [];

  // --- Single event ---------------------------------------------------------
  if (!event.rrule) {
    if (intersects(event.start, event.end, win)) {
      out.push(
        baseOccurrence(event, event.start, event.start, event.end, {
          isRecurring: false,
          isException: false,
        }),
      );
    }
    return out;
  }

  // --- Recurring event ------------------------------------------------------
  // All-day events are floating dates anchored to UTC midnight (the same
  // calendar date for every viewer), so expand them in UTC: floating == real,
  // keeping each occurrence_date exactly on UTC midnight for stable override
  // matching. Timed events expand in their own IANA zone (DST-correct).
  const tz = event.allDay ? "UTC" : event.timeZone;
  const duration = event.end - event.start;

  const options = RRule.parseString(event.rrule);
  options.dtstart = new Date(floatingFromRealMs(event.start, tz));
  const rule = new RRule(options);

  // Bound expansion to the (padded) window, expressed in floating space.
  const floatAfter = new Date(floatingFromRealMs(win.start - PAD_MS, tz));
  const floatBefore = new Date(floatingFromRealMs(win.end + PAD_MS, tz));

  const byOcc = new Map<number, OverrideRow>();
  for (const ov of overrides) {
    if (ov.eventId === event.id) byOcc.set(ov.occurrenceDate, ov);
  }

  const emitted = new Set<number>();
  for (const floatDate of rule.between(floatAfter, floatBefore, true)) {
    const occurrenceDate = realFromFloatingMs(floatDate.getTime(), tz);

    // recurrenceEndsAt prunes the open-ended tail (real instant comparison).
    if (event.recurrenceEndsAt != null && occurrenceDate > event.recurrenceEndsAt) {
      continue;
    }

    const ov = byOcc.get(occurrenceDate);
    if (ov?.type === "cancel") {
      emitted.add(occurrenceDate);
      continue;
    }

    let occ = baseOccurrence(
      event,
      occurrenceDate,
      occurrenceDate,
      occurrenceDate + duration,
      { isRecurring: true, isException: false },
    );
    if (ov?.type === "modify") occ = applyOverride(occ, ov);

    emitted.add(occurrenceDate);
    if (intersects(occ.start, occ.end, win)) out.push(occ);
  }

  // Modify-overrides whose NEW time lands in the window but whose original
  // occurrence fell outside the expansion (e.g. dragged in from elsewhere).
  for (const ov of byOcc.values()) {
    if (ov.type !== "modify" || emitted.has(ov.occurrenceDate)) continue;
    const start = ov.start ?? ov.occurrenceDate;
    const end = ov.end ?? start + duration;
    if (!intersects(start, end, win)) continue;
    const occ = applyOverride(
      baseOccurrence(event, ov.occurrenceDate, ov.occurrenceDate, ov.occurrenceDate + duration, {
        isRecurring: true,
        isException: false,
      }),
      ov,
    );
    out.push(occ);
  }

  return out;
}

export function expandEvents(
  events: EventRow[],
  overrides: OverrideRow[],
  win: TimeWindow,
): Occurrence[] {
  const out: Occurrence[] = [];
  for (const event of events) out.push(...expandEvent(event, overrides, win));
  // Stable order: by start, then title, then key.
  out.sort(
    (a, b) =>
      a.start - b.start ||
      a.title.localeCompare(b.title) ||
      a.key.localeCompare(b.key),
  );
  return out;
}

export const __test = { floatingFromRealMs, realFromFloatingMs, intersects, DAY_MS };
