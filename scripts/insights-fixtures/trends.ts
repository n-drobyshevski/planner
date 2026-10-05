/**
 * Insights fixtures, area "trends" (owner: A1): lib/analytics/trends.ts, the
 * bucket series behind the Trends tab.
 *
 * ```ts
 * type DayUsageJson = { dayMs: Ms; ms: number };
 * sections: {
 *   bucketUsage: {
 *     name; input: { spans: SpanJson[]; buckets: WindowJson[] };
 *     expected: { start: Ms; end: Ms; ms: number }[];
 *   }[];
 *   rollingAverage: {
 *     name; input: { perDay: DayUsageJson[]; windowDays: number };
 *     expected: { dayMs: Ms; avgMs: number }[];
 *   }[];
 *   categoryTrends: {
 *     name; input: { spans: SpanJson[]; buckets: WindowJson[]; topN: number };
 *     expected: {
 *       seriesKeys: string[];                    // top N by total desc (ties: first seen), + "__other__"
 *       rows: { start: Ms; end: Ms; byKey: Record<string, number> }[];   // every series key per row
 *     };
 *   }[];
 *   delta: {
 *     name; input: { current: number; previous: number };
 *     expected: { delta: number; deltaPct: number | null };
 *   }[];
 * }
 * ```
 *
 * Seeds: every `it` of test/analytics/trends.test.ts (one case per call).
 * Added: ties in category totals (insertion order wins, bucket-major), topN 1
 * and 5. Matrix: `scenario()` → the viewer's slice (usage.ts `viewerSpans`) ×
 * the day / week / month buckets `resolvePeriod` builds, in Europe/Berlin and
 * America/Los_Angeles, around both of their DST transitions; rollingAverage
 * runs over the matching `computeUsage` per-day series, delta over the
 * current vs previous totals.
 */
import { computeUsage } from "@/lib/analytics/usage";
import { bucketUsage, categoryTrends, delta, rollingAverage } from "@/lib/analytics/trends";
import type { Granularity, ResolvedPeriod } from "@/lib/insights/period";
import { DAY, HOUR, span, toOccurrence, type Case, type Ms, type SpanJson, type WindowJson } from "./shared";
import { resolveAt, viewerSpans } from "./usage";

export const sections = ["bucketUsage", "rollingAverage", "categoryTrends", "delta"] as const;

const T0 = Date.UTC(2026, 5, 1); // Mon 1 Jun 2026 UTC

/** trends.test.ts `occ()` defaults as a SpanJson. */
function occ(over: Partial<SpanJson> & { key?: string }): SpanJson {
  return span({ start: T0 + 9 * HOUR, end: T0 + 10 * HOUR, title: "t", eventId: "e", ...over, key: over.key ?? "e:0" });
}

function dayBuckets(n: number): WindowJson[] {
  return Array.from({ length: n }, (_, i) => ({ start: T0 + i * DAY, end: T0 + (i + 1) * DAY }));
}

type DayUsageJson = { dayMs: Ms; ms: number };

const bucketCase = (name: string, spans: SpanJson[], buckets: WindowJson[]): Case => ({
  name,
  input: { spans, buckets },
  expected: bucketUsage(spans.map(toOccurrence), buckets),
});

const rollingCase = (name: string, perDay: DayUsageJson[], windowDays: number): Case => ({
  name,
  input: { perDay, windowDays },
  expected: rollingAverage(perDay, windowDays),
});

const categoryCase = (name: string, spans: SpanJson[], buckets: WindowJson[], topN: number): Case => ({
  name,
  input: { spans, buckets, topN },
  expected: categoryTrends(spans.map(toOccurrence), buckets, topN),
});

const deltaCase = (name: string, current: number, previous: number): Case => ({
  name,
  input: { current, previous },
  expected: delta(current, previous),
});

function seeds(): Record<(typeof sections)[number], Case[]> {
  const make = (categoryId: string | null, hours: number, day = 0, key = "k") =>
    occ({
      key: `${key}:${categoryId}:${day}`,
      categoryId,
      start: T0 + day * DAY,
      end: T0 + day * DAY + hours * HOUR,
    });
  const fourDays: DayUsageJson[] = [
    { dayMs: T0, ms: 2 * HOUR },
    { dayMs: T0 + DAY, ms: 4 * HOUR },
    { dayMs: T0 + 2 * DAY, ms: 0 },
    { dayMs: T0 + 3 * DAY, ms: 6 * HOUR },
  ];
  const eightDays: DayUsageJson[] = Array.from({ length: 8 }, (_, i) => ({ dayMs: T0 + i * DAY, ms: HOUR }));
  return {
    bucketUsage: [
      bucketCase(
        "bucketUsage / clips occurrence time into each bucket",
        [occ({ start: T0 + 23 * HOUR, end: T0 + DAY + HOUR })],
        dayBuckets(3),
      ),
      bucketCase("bucketUsage / returns zero rows for empty input", [], dayBuckets(2)),
    ],
    rollingAverage: [
      rollingCase("rollingAverage / averages over the trailing window, shrinking at the start", fourDays, 3),
      rollingCase("rollingAverage / defaults to a 7-day window", eightDays, 7),
    ],
    categoryTrends: [
      categoryCase(
        "categoryTrends / keeps the top-N categories and folds the rest into other",
        [make("a", 5), make("b", 4), make("c", 2), make("d", 1), make(null, 3, 1)],
        dayBuckets(2),
        2,
      ),
      categoryCase(
        "categoryTrends / surfaces uncategorized as its own series when it makes the top N",
        [
          occ({ key: "u", categoryId: null, start: T0, end: T0 + 5 * HOUR }),
          occ({ key: "a", categoryId: "a", start: T0 + 5 * HOUR, end: T0 + 7 * HOUR }),
        ],
        dayBuckets(1),
        5,
      ),
      categoryCase(
        "categoryTrends / omits the other series when nothing folds",
        [occ({ key: "a", categoryId: "a" })],
        dayBuckets(1),
        5,
      ),
      categoryCase("categoryTrends / returns empty series for no occurrences", [], dayBuckets(2), 5),
    ],
    delta: [
      deltaCase("delta / computes absolute and percent change (up)", 6 * HOUR, 4 * HOUR),
      deltaCase("delta / computes absolute and percent change (down)", 3 * HOUR, 4 * HOUR),
      deltaCase("delta / computes absolute and percent change (level)", 4 * HOUR, 4 * HOUR),
      deltaCase("delta / returns null percent when the previous value is 0 (render as new)", 2 * HOUR, 0),
      deltaCase("delta / returns null percent when the previous value is 0 (both zero)", 0, 0),
    ],
  };
}

function added(): Record<(typeof sections)[number], Case[]> {
  const at = (key: string, categoryId: string | null, day: number, hours: number) =>
    occ({ key, categoryId, start: T0 + day * DAY + 8 * HOUR, end: T0 + day * DAY + (8 + hours) * HOUR });
  // Totals tie at 3h; "z" is first seen in bucket 0, then "y" and "x" in
  // bucket 1 (y's span is listed first), so the ranking is z, y, x.
  const ties = [at("y1", "y", 1, 2), at("x1", "x", 1, 3), at("z0", "z", 0, 3), at("y1b", "y", 1, 1)];
  const sixCategories = ["a", "b", "c", "d", "e", "f"].map((c, i) => at(`k${c}`, c, i % 3, 6 - i));
  return {
    bucketUsage: [
      bucketCase(
        "uneven buckets (a 23 h and a 25 h one) and spans across both",
        [occ({ key: "a", start: T0 - HOUR, end: T0 + 30 * HOUR }), occ({ key: "b", start: T0 + 46 * HOUR, end: T0 + 49 * HOUR })],
        [
          { start: T0, end: T0 + 23 * HOUR },
          { start: T0 + 23 * HOUR, end: T0 + 48 * HOUR },
        ],
      ),
      bucketCase("no buckets", [occ({})], []),
    ],
    rollingAverage: [
      rollingCase("window of 1 is the series itself", fourDays(), 1),
      rollingCase("window longer than the series", fourDays(), 10),
      rollingCase("empty series", [], 7),
      rollingCase(
        "odd ms values divide to fractions",
        [1, 2, 3, 5, 8, 13, 21, 34, 55].map((ms, i) => ({ dayMs: T0 + i * DAY, ms: ms * 1_001 })),
        4,
      ),
    ],
    categoryTrends: [
      categoryCase("ties in totals keep first-seen order (bucket-major), topN 2", ties, dayBuckets(2), 2),
      categoryCase("ties in totals keep first-seen order (bucket-major), topN 5", ties, dayBuckets(2), 5),
      categoryCase("topN 1 folds everything else", sixCategories, dayBuckets(3), 1),
      categoryCase("topN 5 of 6 categories", sixCategories, dayBuckets(3), 5),
      categoryCase("exactly topN categories: nothing folds", sixCategories.slice(0, 5), dayBuckets(3), 5),
      categoryCase(
        "a span outside every bucket ranks nowhere",
        [at("in", "a", 0, 1), occ({ key: "out", categoryId: "b", start: T0 + 10 * DAY, end: T0 + 11 * DAY })],
        dayBuckets(2),
        1,
      ),
    ],
    delta: [
      deltaCase("fractional averages", 7_500_000 / 7, 3_600_000 / 3),
      deltaCase("current 0 against a previous value", 0, 5 * HOUR),
      deltaCase("a third", HOUR, 3 * HOUR),
    ],
  };
}

function fourDays(): DayUsageJson[] {
  return [2, 4, 0, 6].map((h, i) => ({ dayMs: T0 + i * DAY, ms: h * HOUR }));
}

/** Periods per zone around both DST transitions: [label, preset, date, customDays]. */
const MATRIX: Record<string, [string, "last-30d" | "custom", string, number][]> = {
  "Europe/Berlin": [
    ["last-30d after spring-forward", "last-30d", "2026-04-05", 0],
    ["custom 70 days over fall-back", "custom", "2026-11-15", 70],
  ],
  "America/Los_Angeles": [
    ["last-30d after spring-forward", "last-30d", "2026-03-20", 0],
    ["custom 70 days over fall-back", "custom", "2026-11-20", 70],
  ],
};

const GRANULARITIES: Granularity[] = ["day", "week", "month"];

function matrix(): Record<(typeof sections)[number], Case[]> {
  const out: Record<(typeof sections)[number], Case[]> = {
    bucketUsage: [],
    rollingAverage: [],
    categoryTrends: [],
    delta: [],
  };
  Object.entries(MATRIX).forEach(([zone, runs], z) => {
    runs.forEach(([label, preset, date, customDays], r) => {
      const periods = GRANULARITIES.map((g) => resolveAt(zone, preset, date, g, customDays));
      const p = periods[0] as ResolvedPeriod;
      const seed = 2000 + 17 * z + r;
      const spans = viewerSpans(zone, p.window, seed);
      const prevSpans = viewerSpans(zone, p.prevWindow, seed + 100);
      const name = `scenario ${zone} ${label}`;
      const seen = new Set<Granularity>();
      for (const period of periods as ResolvedPeriod[]) {
        if (seen.has(period.granularity)) continue; // a sanitized request repeats another
        seen.add(period.granularity);
        out.bucketUsage.push(bucketCase(`${name}, ${period.granularity} buckets`, spans, period.buckets));
        for (const topN of period.granularity === "week" ? [5, 3] : [5]) {
          out.categoryTrends.push(
            categoryCase(`${name}, ${period.granularity} buckets, topN ${topN}`, spans, period.buckets, topN),
          );
        }
      }
      const perDay = computeUsage(spans.map(toOccurrence), p.days, p.window, { includeInactive: true }).perDay;
      out.rollingAverage.push(rollingCase(`${name}, 7-day`, perDay, 7));
      out.rollingAverage.push(rollingCase(`${name}, 3-day`, perDay, 3));
      const total = (xs: SpanJson[], w: WindowJson) =>
        bucketUsage(xs.map(toOccurrence), [w]).reduce((s, b) => s + b.ms, 0);
      const cur = total(spans, p.window);
      const prev = total(prevSpans, p.prevWindow);
      out.delta.push(deltaCase(`${name}, totals`, cur, prev));
      out.delta.push(deltaCase(`${name}, daily averages`, cur / p.days.length, prev / p.prevDays.length));
    });
  });
  return out;
}

export function build(): Record<(typeof sections)[number], Case[]> {
  const parts = [seeds(), added(), matrix()];
  const out = {} as Record<(typeof sections)[number], Case[]>;
  for (const s of sections) out[s] = parts.flatMap((p) => p[s]);
  return out;
}
