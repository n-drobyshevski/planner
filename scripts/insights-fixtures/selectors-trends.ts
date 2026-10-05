/**
 * Insights fixtures, area "selectors-trends" (owner: T2): the Trends tab's view
 * logic (lib/insights/view-selectors.ts, Trends group), replayed by
 * TrendsSelectorsTest.kt.
 *
 * ```ts
 * type BucketJson = { start: Ms; end: Ms; ms: number };
 * type DayUsageJson = { dayMs: Ms; ms: number };
 * type CategoryBucketsJson = {
 *   seriesKeys: string[];
 *   rows: { start: Ms; end: Ms; byKey: Record<string, number> }[];   // keys == seriesKeys, in order
 * };
 * type TotalJson = { key: string; ms: number };                       // one Map entry, in Map order
 * sections: {
 *   busiestBucket: { name; input: { rows: BucketJson[] }; expected: BucketJson | null }[];   // null: TS undefined
 *   perDayFromBuckets: {
 *     name; input: { buckets: BucketJson[]; granularity: "day" | "week" | "month" };
 *     expected: DayUsageJson[] | null;
 *   }[];
 *   categoryTotals: { name; input: { cb: CategoryBucketsJson }; expected: TotalJson[] }[];
 *   topCategory: { name; input: { cb: CategoryBucketsJson; totals: TotalJson[] }; expected: string | null }[];
 *   showMomentum: {
 *     name;
 *     input: {
 *       perDay: DayUsageJson[] | null;
 *       streak: { current: number; longest: number } | null;
 *       steadiness: number | null;                                     // consistency
 *       anomalies: { dayMs: Ms; ms: number; z: number; direction: "high" | "low" }[];
 *       trend: { slopeMsPerBucket: number | null; direction: "up" | "down" | "flat" | null };
 *     };
 *     expected: boolean;
 *   }[];
 * }
 * ```
 *
 * Hand cases cover ties (the first wins), empty inputs, a total missing from
 * the Map (read as 0) and the full truth table of `showMomentum`, including an
 * empty day series (truthy in JS). The scenario cases feed real `bucketUsage`,
 * `categoryTrends` and momentum output from `resolvePeriod` periods in four
 * zones (day, week and month buckets, around DST where the zone has it).
 */
import { activeStreak, bucketTrend, consistency, dayAnomalies } from "@/lib/analytics/momentum";
import { bucketUsage, categoryTrends, type CategoryBuckets } from "@/lib/analytics/trends";
import type { Granularity, ResolvedPeriod } from "@/lib/insights/period";
import {
  busiestBucket,
  categoryTotals,
  perDayFromBuckets,
  showMomentum,
  topCategory,
} from "@/lib/insights/view-selectors";
import { DAY, HOUR, toOccurrence, type Case, type Ms, type Zone } from "./shared";
import { resolveAt, viewerSpans } from "./usage";

export const sections = [
  "busiestBucket",
  "perDayFromBuckets",
  "categoryTotals",
  "topCategory",
  "showMomentum",
] as const;

type Section = (typeof sections)[number];

/** Monday 2026-06-01 00:00 UTC. */
const T0 = Date.UTC(2026, 5, 1);

type BucketJson = { start: Ms; end: Ms; ms: number };
type DayUsageJson = { dayMs: Ms; ms: number };
type StreakJson = { current: number; longest: number };
type AnomalyJson = { dayMs: Ms; ms: number; z: number; direction: "high" | "low" };
type TrendJson = { slopeMsPerBucket: number | null; direction: "up" | "down" | "flat" | null };

/** Day-long buckets from T0 carrying the given hours. */
const dayBuckets = (hours: number[]): BucketJson[] =>
  hours.map((h, i) => ({ start: T0 + i * DAY, end: T0 + (i + 1) * DAY, ms: h * HOUR }));

/** A category-bucket series: one row per day from T0, keys in `seriesKeys` order. */
function cb(seriesKeys: string[], rows: number[][]): CategoryBuckets {
  return {
    seriesKeys,
    rows: rows.map((hours, i) => ({
      start: T0 + i * DAY,
      end: T0 + (i + 1) * DAY,
      byKey: Object.fromEntries(seriesKeys.map((k, j) => [k, (hours[j] ?? 0) * HOUR])),
    })),
  };
}

const totalsJson = (totals: Map<string, number>) => [...totals].map(([key, ms]) => ({ key, ms }));

const busiestCase = (name: string, rows: BucketJson[]): Case => ({
  name,
  input: { rows },
  expected: busiestBucket(rows) ?? null,
});

const perDayCase = (name: string, buckets: BucketJson[], granularity: Granularity): Case => ({
  name,
  input: { buckets, granularity },
  expected: perDayFromBuckets(buckets, granularity),
});

const totalsCase = (name: string, c: CategoryBuckets): Case => ({
  name,
  input: { cb: c },
  expected: totalsJson(categoryTotals(c)),
});

const topCase = (name: string, c: CategoryBuckets, totals: Map<string, number> = categoryTotals(c)): Case => ({
  name,
  input: { cb: c, totals: totalsJson(totals) },
  expected: topCategory(c, totals),
});

function momentumCase(
  name: string,
  perDay: DayUsageJson[] | null,
  streak: StreakJson | null,
  steadiness: number | null,
  anomalies: AnomalyJson[],
  trend: TrendJson,
): Case {
  return {
    name,
    input: { perDay, streak, steadiness, anomalies, trend },
    expected: showMomentum(perDay, streak, steadiness, anomalies, trend),
  };
}

function hand(): Record<Section, Case[]> {
  const ctx = cb(["c1", "c2", "__other__"], [
    [2, 1, 0],
    [0, 3, 1],
    [1, 0, 2],
  ]);
  const tie = cb(["c2", "c1", "__uncategorized__"], [
    [2, 1, 1],
    [1, 2, 2],
  ]);
  const empty = cb([], [[], []]);
  return {
    busiestBucket: [
      busiestCase("empty", []),
      busiestCase("single bucket", dayBuckets([3])),
      busiestCase("a tie keeps the first maximum", dayBuckets([2, 5, 5, 1])),
      busiestCase("all zero keeps the first", dayBuckets([0, 0, 0])),
      busiestCase("the maximum last", dayBuckets([1, 2, 3, 4])),
      busiestCase("the maximum first", dayBuckets([9, 2, 3, 9])),
    ],
    perDayFromBuckets: [
      perDayCase("day buckets map to days", dayBuckets([1, 0, 2.5]), "day"),
      perDayCase("no day buckets at all", [], "day"),
      perDayCase("week buckets have no day series", dayBuckets([1, 0, 2.5]), "week"),
      perDayCase("month buckets have no day series", dayBuckets([4]), "month"),
    ],
    categoryTotals: [
      totalsCase("rows then keys, Other included", ctx),
      totalsCase("series order is not total order", tie),
      totalsCase("no series", empty),
      totalsCase("no rows", cb(["c1"], [])),
    ],
    topCategory: [
      topCase("the largest total", ctx),
      topCase("a tie keeps the first series key", tie),
      topCase("no series", empty),
      topCase("all zero keeps the first", cb(["c1", "c2"], [[0, 0]])),
      topCase("a missing total reads as 0", cb(["c1", "c2"], [[1, 2]]), new Map([["c1", 3 * HOUR]])),
      topCase(
        "a missing first total loses to a positive one",
        cb(["c1", "c2"], [[1, 2]]),
        new Map([["c2", HOUR]]),
      ),
    ],
    showMomentum: truthTable(),
  };
}

/** Every combination of the inputs' truthiness (perDay: null, [] and non-empty). */
function truthTable(): Case[] {
  const perDays: [string, DayUsageJson[] | null][] = [
    ["no day series", null],
    ["empty day series", []],
    ["day series", [{ dayMs: T0, ms: HOUR }]],
  ];
  const streaks: [string, StreakJson | null][] = [
    ["no streak", null],
    ["zero streak", { current: 0, longest: 0 }],
  ];
  const steadinesses: [string, number | null][] = [
    ["no consistency", null],
    ["consistency 0", 0],
  ];
  const anomalyLists: [string, AnomalyJson[]][] = [
    ["no anomalies", []],
    ["an anomaly", [{ dayMs: T0, ms: HOUR, z: 3.5, direction: "high" }]],
  ];
  const trends: [string, TrendJson][] = [
    ["no direction", { slopeMsPerBucket: null, direction: null }],
    ["flat", { slopeMsPerBucket: 0, direction: "flat" }],
  ];
  const out: Case[] = [];
  for (const [pn, p] of perDays)
    for (const [sn, s] of streaks)
      for (const [cn, c] of steadinesses)
        for (const [an, a] of anomalyLists)
          for (const [tn, t] of trends) out.push(momentumCase(`${pn}, ${sn}, ${cn}, ${an}, ${tn}`, p, s, c, a, t));
  return out;
}

/** Scenario periods per zone: [label, preset, date]. */
const MATRIX: Record<Zone, [string, "last-30d" | "this-week" | "last-90d", string][]> = {
  "Europe/Berlin": [
    ["last-30d after spring-forward", "last-30d", "2026-04-05"],
    ["this-week over fall-back", "this-week", "2026-10-28"],
  ],
  "America/Los_Angeles": [["last-30d over fall-back", "last-30d", "2026-11-20"]],
  "Asia/Kolkata": [["last-90d", "last-90d", "2026-06-10"]],
  "America/Santiago": [["last-30d over the midnight gap", "last-30d", "2026-09-20"]],
};

const GRANULARITIES: Granularity[] = ["day", "week", "month"];

function matrix(): Record<Section, Case[]> {
  const out: Record<Section, Case[]> = {
    busiestBucket: [],
    perDayFromBuckets: [],
    categoryTotals: [],
    topCategory: [],
    showMomentum: [],
  };
  Object.entries(MATRIX).forEach(([zone, runs], z) => {
    runs.forEach(([label, preset, date], r) => {
      const periods = GRANULARITIES.map((g) => resolveAt(zone, preset, date, g));
      if (periods.some((p) => p === null)) throw new Error(`selectors-trends: ${zone} ${label} is unbuildable`);
      const spans = viewerSpans(zone, (periods[0] as ResolvedPeriod).window, 3000 + 17 * z + r).map(toOccurrence);
      const seen = new Set<Granularity>();
      for (const p of periods as ResolvedPeriod[]) {
        if (seen.has(p.granularity)) continue; // a sanitized request repeats another
        seen.add(p.granularity);
        const name = `scenario ${zone} ${label}, ${p.granularity} buckets`;
        const buckets = bucketUsage(spans, p.buckets);
        const byContext = categoryTrends(spans, p.buckets, 5);
        out.busiestBucket.push(busiestCase(name, buckets));
        out.perDayFromBuckets.push(perDayCase(name, buckets, p.granularity));
        out.categoryTotals.push(totalsCase(name, byContext));
        out.topCategory.push(topCase(name, byContext));
        const perDay = perDayFromBuckets(buckets, p.granularity);
        out.showMomentum.push(
          momentumCase(
            name,
            perDay,
            perDay ? activeStreak(perDay) : null,
            perDay ? consistency(perDay) : null,
            perDay ? dayAnomalies(perDay) : [],
            bucketTrend(buckets),
          ),
        );
      }
    });
  });
  return out;
}

export function build(): Record<Section, Case[]> {
  const parts = [hand(), matrix()];
  const out = {} as Record<Section, Case[]>;
  for (const s of sections) out[s] = parts.flatMap((p) => p[s]);
  return out;
}
