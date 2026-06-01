import { startOfDay, getTime } from "date-fns";
import type { Occurrence } from "@/lib/types";

export interface AgendaDay {
  /** local-midnight epoch ms key for the bucket */
  dayMs: number;
  items: Occurrence[];
}

/**
 * Bucket occurrences into ascending day groups (local-midnight keys), for the
 * Agenda / Schedule list. A multi-day occurrence is filed under its start day
 * only. Within a day: all-day first, then by start time, then title.
 *
 * Pure — depends only on its input — so it's unit-testable and safe to memoize.
 */
export function groupByDay(occurrences: Occurrence[]): AgendaDay[] {
  const buckets = new Map<number, Occurrence[]>();
  for (const o of occurrences) {
    const key = getTime(startOfDay(o.start));
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
