// The .ics import review's glue between parsed events (./parse) and Planr's
// writes: the inline editor's form values, the "Edited" check, and the
// EventInput a reviewed row becomes. Pure; the dialog
// (components/calendar/ics-import-dialog.tsx) owns the state.

import type { IcsEvent } from "./parse";
import type { EventInput } from "@/lib/supabase/mappers";
import type { EventStatus } from "@/lib/types";
import { computeEventTimes } from "@/lib/events/schemas";
import { allDayDateKey, DAY_IN_MS, msToDateInput, msToTimeInput } from "@/lib/datetime/local";
import { parseRRule, type RecurrenceForm } from "@/lib/recurrence/rrule-build";

/** How every imported row is filed: the bulk context + visibility choice. */
export interface ImportFiling {
  workspaceId: string;
  ownerId: string;
  categoryId: string | null;
  isPrivate: boolean;
  isShared: boolean;
}

/**
 * A reviewed event → the row to create. A STATUS:CANCELLED event the member
 * still chose to import keeps Planr's own cancelled status; the file's UID is
 * kept as attributes.icalUid so a re-import spots it.
 */
export function icsEventToInput(event: IcsEvent, filing: ImportFiling): EventInput {
  const status: EventStatus = event.cancelled ? "cancelled" : event.status;
  return {
    workspaceId: filing.workspaceId,
    ownerId: filing.ownerId,
    kind: "event",
    categoryId: filing.categoryId,
    isPrivate: filing.isPrivate,
    isShared: filing.isShared,
    title: event.title.trim(),
    description: event.description,
    location: event.location,
    allDay: event.allDay,
    status,
    start: event.start,
    end: event.end,
    timeZone: event.timeZone,
    rrule: event.rrule,
    recurrenceEndsAt: event.recurrenceEndsAt,
    ...(event.uid !== null ? { attributes: { icalUid: event.uid } } : {}),
  };
}

/**
 * The occurrence starts to cancel on an edited row. Moving a series' start
 * moves every occurrence by the same amount, so its EXDATEs follow; a series
 * switched between all-day and timed keeps them as parsed.
 */
export function draftExdates(original: IcsEvent, draft: IcsEvent): number[] {
  if (!draft.rrule || draft.allDay !== original.allDay) return draft.exdates;
  const delta = draft.start - original.start;
  return delta === 0 ? draft.exdates : draft.exdates.map((d) => d + delta);
}

/** True when the member changed the row's title or times in the review. */
export function isEdited(original: IcsEvent, draft: IcsEvent): boolean {
  return (
    original.title !== draft.title ||
    original.allDay !== draft.allDay ||
    original.start !== draft.start ||
    original.end !== draft.end
  );
}

/** The inline editor's fields; dates "yyyy-MM-dd", times "HH:mm", end date inclusive. */
export interface DraftTimes {
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}

/**
 * An event's times as editor fields, read in the viewer's [zone] (the zone
 * the review lists them in). All-day dates are floating; the exclusive end
 * shows as the last day.
 */
export function draftTimes(event: IcsEvent, zone: string): DraftTimes {
  if (event.allDay) {
    const startDate = allDayDateKey(event.start);
    const last = Math.max(event.start, event.end - DAY_IN_MS);
    return { allDay: true, startDate, startTime: "09:00", endDate: allDayDateKey(last), endTime: "10:00" };
  }
  return {
    allDay: false,
    startDate: msToDateInput(event.start, zone),
    startTime: msToTimeInput(event.start, zone),
    endDate: msToDateInput(event.end, zone),
    endTime: msToTimeInput(event.end, zone),
  };
}

/**
 * Editor fields → the event with new times, or why they can't apply. Timed
 * values are wall clock in the viewer's [zone] (the event keeps its own zone
 * for repeating); the end may equal the start but not precede it.
 */
export function applyDraftTimes(
  event: IcsEvent,
  times: DraftTimes,
  zone: string,
): { ok: true; event: IcsEvent } | { ok: false; error: "end-before-start" | "invalid" } {
  const date = /^\d{4}-\d{2}-\d{2}$/;
  const time = /^\d{2}:\d{2}$/;
  if (!date.test(times.startDate) || !date.test(times.endDate)) return { ok: false, error: "invalid" };
  if (!times.allDay && (!time.test(times.startTime) || !time.test(times.endTime))) {
    return { ok: false, error: "invalid" };
  }
  const { start, end } = computeEventTimes(times, zone);
  if (Number.isNaN(start) || Number.isNaN(end)) return { ok: false, error: "invalid" };
  if (end < start) return { ok: false, error: "end-before-start" };
  return { ok: true, event: { ...event, allDay: times.allDay, start, end } };
}

/**
 * The rule as the recurrence summary's form, when the summary can say it
 * faithfully: DAILY / WEEKLY / MONTHLY with only INTERVAL, plain BYDAY,
 * UNTIL, COUNT and WKST. Anything richer (YEARLY, BYMONTHDAY, BYSETPOS, …)
 * returns null and the review shows a plain "Repeats".
 */
export function summarizableRecurrence(rrule: string | null): RecurrenceForm | null {
  if (!rrule) return null;
  const parts = rrule.split(";").map((p) => p.split("="));
  const allowed = new Set(["FREQ", "INTERVAL", "BYDAY", "UNTIL", "COUNT", "WKST"]);
  for (const [key, value = ""] of parts) {
    const k = key.toUpperCase();
    if (!allowed.has(k)) return null;
    if (k === "FREQ" && !["DAILY", "WEEKLY", "MONTHLY"].includes(value.toUpperCase())) return null;
    if (k === "BYDAY" && !/^(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*$/i.test(value)) return null;
  }
  const freq = parts.find(([k]) => k.toUpperCase() === "FREQ")?.[1]?.toUpperCase();
  if (!freq) return null;
  // The summary only names weekdays for daily / weekly rules.
  if (freq === "MONTHLY" && parts.some(([k]) => k.toUpperCase() === "BYDAY")) return null;
  try {
    return parseRRule(rrule);
  } catch {
    return null;
  }
}
