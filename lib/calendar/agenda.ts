import { startOfDay, getTime } from "date-fns";
import { tz } from "@date-fns/tz";
import { allDayDateKey, combineDateTime, localTimeZone } from "@/lib/datetime/local";
import type { Occurrence } from "@/lib/types";

export interface AgendaDay {
  /** local-midnight epoch ms key for the bucket (in the viewer's zone) */
  dayMs: number;
  items: Occurrence[];
}

/**
 * Bucket occurrences into ascending day groups (local-midnight keys in the
 * viewer's `timeZone`), for the Agenda / Schedule list. A multi-day occurrence
 * is filed under its start day only. Within a day: all-day first, then by start
 * time, then title.
 *
 * Timed occurrences bucket by their zone-local start day. All-day occurrences
 * are floating dates (UTC-anchored), so they bucket under the viewer-zone day
 * with the same calendar date — never drifting onto an adjacent day.
 *
 * Pure — depends only on its inputs — so it's unit-testable and safe to memoize.
 */
export function groupByDay(
  occurrences: Occurrence[],
  timeZone: string = localTimeZone(),
): AgendaDay[] {
  const ctx = tz(timeZone);
  const buckets = new Map<number, Occurrence[]>();
  for (const o of occurrences) {
    const key = o.allDay
      ? combineDateTime(allDayDateKey(o.start), "00:00", timeZone)
      : getTime(startOfDay(o.start, { in: ctx }));
    const arr = buckets.get(key);
    if (arr) arr.push(o);
    else buckets.set(key, [o]);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dayMs, items]) => ({
      dayMs,
      items: items.sort(
        (a, b) =>
          Number(b.allDay) - Number(a.allDay) ||
          a.start - b.start ||
          a.title.localeCompare(b.title),
      ),
    }));
}
