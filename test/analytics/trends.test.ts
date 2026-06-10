import { describe, it, expect } from "vitest";
import {
  bucketUsage,
  rollingAverage,
  categoryTrends,
  delta,
  OTHER_SERIES,
  UNCATEGORIZED_SERIES,
} from "@/lib/analytics/trends";
import type { Bucket } from "@/lib/insights/period";
import type { DayUsage } from "@/lib/analytics/usage";
import type { Occurrence } from "@/lib/types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Zone-free arithmetic: buckets/occurrences are plain ms offsets from an
// arbitrary UTC anchor (these pure aggregations never touch a time zone).
const T0 = Date.UTC(2026, 5, 1); // Mon 1 Jun 2026 UTC

function occ(over: Partial<Occurrence>): Occurrence {
  return {
    key: "e:0",
    eventId: "e",
    occurrenceDate: 0,
    start: T0 + 9 * HOUR,
    end: T0 + 10 * HOUR,
    allDay: false,
    inactive: false,
    status: "confirmed",
    title: "t",
    description: null,
    location: null,
    categoryId: null,
    color: null,
    kind: "event",
    ownerId: "me",
    isPrivate: false,
    isShared: false,
    taskId: null,
    attributes: {},
    isRecurring: false,
    isException: false,
    ...over,
  };
}

/** n consecutive day buckets from T0. */
function dayBuckets(n: number): Bucket[] {
  return Array.from({ length: n }, (_, i) => ({
    start: T0 + i * DAY,
    end: T0 + (i + 1) * DAY,
  }));
}

describe("bucketUsage", () => {
  it("clips occurrence time into each bucket", () => {
    const buckets = dayBuckets(3);
    // 23:00 day 0 → 01:00 day 1 spans two buckets.
    const rows = bucketUsage(
      [occ({ start: T0 + 23 * HOUR, end: T0 + DAY + HOUR })],
      buckets,
    );
    expect(rows).toEqual([
      { start: buckets[0].start, end: buckets[0].end, ms: HOUR },
      { start: buckets[1].start, end: buckets[1].end, ms: HOUR },
      { start: buckets[2].start, end: buckets[2].end, ms: 0 },
    ]);
  });

  it("returns zero rows for empty input", () => {
    expect(bucketUsage([], dayBuckets(2)).map((r) => r.ms)).toEqual([0, 0]);
  });
});

describe("rollingAverage", () => {
  it("averages over the trailing window, shrinking at the start", () => {
    const perDay: DayUsage[] = [
      { dayMs: T0, ms: 2 * HOUR },
      { dayMs: T0 + DAY, ms: 4 * HOUR },
      { dayMs: T0 + 2 * DAY, ms: 0 },
      { dayMs: T0 + 3 * DAY, ms: 6 * HOUR },
    ];
    const rows = rollingAverage(perDay, 3);
    expect(rows[0]).toEqual({ dayMs: T0, avgMs: 2 * HOUR }); // 2/1
    expect(rows[1]).toEqual({ dayMs: T0 + DAY, avgMs: 3 * HOUR }); // (2+4)/2
    expect(rows[2]).toEqual({ dayMs: T0 + 2 * DAY, avgMs: 2 * HOUR }); // (2+4+0)/3
    expect(rows[3]).toEqual({ dayMs: T0 + 3 * DAY, avgMs: (10 / 3) * HOUR }); // (4+0+6)/3
  });

  it("defaults to a 7-day window", () => {
    const perDay: DayUsage[] = Array.from({ length: 8 }, (_, i) => ({
      dayMs: T0 + i * DAY,
      ms: HOUR,
    }));
    const rows = rollingAverage(perDay);
    expect(rows[7].avgMs).toBe(HOUR);
    expect(rows).toHaveLength(8);
  });
});

describe("categoryTrends", () => {
  it("keeps the top-N categories and folds the rest into other", () => {
    const buckets = dayBuckets(2);
    const make = (categoryId: string | null, hours: number, day = 0, key = "k") =>
      occ({
        key: `${key}:${categoryId}:${day}`,
        categoryId,
        start: T0 + day * DAY,
        end: T0 + day * DAY + hours * HOUR,
      });
    const t = categoryTrends(
      [
        make("a", 5),
        make("b", 4),
        make("c", 2),
        make("d", 1), // folded into other (topN=2)
        make(null, 3, 1), // uncategorized, second bucket
      ],
      buckets,
      2,
    );
    expect(t.seriesKeys).toEqual(["a", "b", OTHER_SERIES]);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0].byKey).toEqual({ a: 5 * HOUR, b: 4 * HOUR, [OTHER_SERIES]: 3 * HOUR });
    // Second bucket: only the uncategorized event, folded into other; the
    // top series are still present as zeros so stacked charts align.
    expect(t.rows[1].byKey).toEqual({ a: 0, b: 0, [OTHER_SERIES]: 3 * HOUR });
  });

  it("surfaces uncategorized as its own series when it makes the top N", () => {
    const buckets = dayBuckets(1);
    const t = categoryTrends(
      [
        occ({ key: "u", categoryId: null, start: T0, end: T0 + 5 * HOUR }),
        occ({ key: "a", categoryId: "a", start: T0 + 5 * HOUR, end: T0 + 7 * HOUR }),
      ],
      buckets,
      5,
    );
    expect(t.seriesKeys).toEqual([UNCATEGORIZED_SERIES, "a"]);
    expect(t.rows[0].byKey[UNCATEGORIZED_SERIES]).toBe(5 * HOUR);
  });

  it("omits the other series when nothing folds", () => {
    const t = categoryTrends(
      [occ({ key: "a", categoryId: "a" })],
      dayBuckets(1),
      5,
    );
    expect(t.seriesKeys).toEqual(["a"]);
  });

  it("returns empty series for no occurrences", () => {
    const t = categoryTrends([], dayBuckets(2), 5);
    expect(t.seriesKeys).toEqual([]);
    expect(t.rows.map((r) => r.byKey)).toEqual([{}, {}]);
  });
});

describe("delta", () => {
  it("computes absolute and percent change", () => {
    expect(delta(6 * HOUR, 4 * HOUR)).toEqual({ delta: 2 * HOUR, deltaPct: 0.5 });
    expect(delta(3 * HOUR, 4 * HOUR)).toEqual({ delta: -HOUR, deltaPct: -0.25 });
    expect(delta(4 * HOUR, 4 * HOUR)).toEqual({ delta: 0, deltaPct: 0 });
  });

  it("returns null percent when the previous value is 0 (render as new)", () => {
    expect(delta(2 * HOUR, 0)).toEqual({ delta: 2 * HOUR, deltaPct: null });
    expect(delta(0, 0)).toEqual({ delta: 0, deltaPct: null });
  });
});
