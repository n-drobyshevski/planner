/**
 * Insights fixtures, area "momentum" (owner: A1): lib/analytics/momentum.ts,
 * the trend, streak, consistency and anomaly signals of the Trends tab.
 *
 * ```ts
 * type DayUsageJson = { dayMs: Ms; ms: number };
 * sections: {
 *   bucketTrend: {
 *     name; input: { buckets: { start: Ms; end: Ms; ms: number }[] };
 *     expected: { slopeMsPerBucket: number | null; direction: "up" | "down" | "flat" | null };
 *   }[];
 *   activeStreak: {
 *     name; input: { perDay: DayUsageJson[]; minMsPerDay: number };
 *     expected: { current: number; longest: number };
 *   }[];
 *   consistency: { name; input: { perDay: DayUsageJson[] }; expected: number | null }[];
 *   dayAnomalies: {
 *     name;
 *     input: { perDay: DayUsageJson[]; minSample: number | null; zThreshold: number | null };  // null = default
 *     expected: { dayMs: Ms; ms: number; z: number; direction: "high" | "low" }[];
 *   }[];
 * }
 * ```
 *
 * Seeds: every `it` of test/analytics/momentum.test.ts (one case per call).
 * Added: a this-week series with trailing future zeros, equal-|z| ties in both
 * input orders, and the per-day series (plus day and week bucket series) of a
 * 30-day and a 90-day scenario per zone. `elapsedStreak` has no TS export; it
 * is covered by ElapsedStreakTest.kt instead.
 */
import { activeStreak, bucketTrend, consistency, dayAnomalies } from "@/lib/analytics/momentum";
import { bucketUsage } from "@/lib/analytics/trends";
import { computeUsage } from "@/lib/analytics/usage";
import { filterForInsights } from "@/lib/insights/filters";
import { DAY, HOUR, ZONES, addDate, localDateOf, scenario, toOccurrence, type Case, type Ms } from "./shared";
import { resolveAt } from "./usage";

export const sections = ["bucketTrend", "activeStreak", "consistency", "dayAnomalies"] as const;

/** Monday 2026-06-01 00:00 UTC. */
const T0 = Date.UTC(2026, 5, 1);

type DayUsageJson = { dayMs: Ms; ms: number };
type BucketJson = { start: Ms; end: Ms; ms: number };

/** momentum.test.ts `buckets`: day-long buckets carrying the given ms values. */
const buckets = (values: number[]): BucketJson[] =>
  values.map((ms, i) => ({ start: T0 + i * DAY, end: T0 + (i + 1) * DAY, ms }));

/** momentum.test.ts `perDay`: rows from hour counts (0 = untracked day). */
const perDay = (hours: number[]): DayUsageJson[] => hours.map((h, i) => ({ dayMs: T0 + i * DAY, ms: h * HOUR }));

const trendCase = (name: string, b: BucketJson[]): Case => ({
  name,
  input: { buckets: b },
  expected: bucketTrend(b),
});

const streakCase = (name: string, days: DayUsageJson[], minMsPerDay = 1): Case => ({
  name,
  input: { perDay: days, minMsPerDay },
  expected: activeStreak(days, minMsPerDay),
});

const consistencyCase = (name: string, days: DayUsageJson[]): Case => ({
  name,
  input: { perDay: days },
  expected: consistency(days),
});

const anomalyCase = (
  name: string,
  days: DayUsageJson[],
  minSample: number | null = null,
  zThreshold: number | null = null,
): Case => ({
  name,
  input: { perDay: days, minSample, zThreshold },
  expected: dayAnomalies(days, {
    ...(minSample === null ? {} : { minSample }),
    ...(zThreshold === null ? {} : { zThreshold }),
  }),
});

function seeds(): Record<(typeof sections)[number], Case[]> {
  const bt = "bucketTrend";
  const as = "activeStreak";
  const co = "consistency";
  const da = "dayAnomalies";
  const base = Array.from({ length: 14 }, (_, i) => (i % 2 === 0 ? 9.5 : 10.5));
  const thresholdDays = perDay([0.5, 2, 0.5]);
  return {
    bucketTrend: [
      trendCase(`${bt} / returns nulls under 4 buckets`, buckets([1 * HOUR, 2 * HOUR, 3 * HOUR])),
      trendCase(`${bt} / returns nulls under 4 buckets (empty)`, []),
      trendCase(
        `${bt} / reports a rising series as up with the Theil–Sen slope`,
        buckets([10 * HOUR, 20 * HOUR, 30 * HOUR, 40 * HOUR]),
      ),
      trendCase(
        `${bt} / reports a falling series as down, even with one outlier bucket`,
        buckets([40 * HOUR, 35 * HOUR, 100 * HOUR, 25 * HOUR, 20 * HOUR]),
      ),
      trendCase(
        `${bt} / reads a projected change under 10% of the median bucket as flat`,
        buckets([10 * HOUR, 10 * HOUR, 10 * HOUR, 11 * HOUR]),
      ),
      trendCase(
        `${bt} / treats an all-zero series as flat (zero slope beats the zero threshold)`,
        buckets([0, 0, 0, 0]),
      ),
    ],
    activeStreak: [
      streakCase(`${as} / counts current back from the last day and tracks the longest run`, perDay([2, 0, 3, 4, 5, 0, 1, 2])),
      streakCase(`${as} / current is 0 when the last day is inactive; runs can coincide (last inactive)`, perDay([1, 1, 1, 0])),
      streakCase(`${as} / current is 0 when the last day is inactive; runs can coincide (coincide)`, perDay([0, 1, 1, 1])),
      streakCase(`${as} / applies the minMsPerDay threshold (default: any tracked ms)`, thresholdDays),
      streakCase(`${as} / applies the minMsPerDay threshold (one hour)`, thresholdDays, HOUR),
      streakCase(`${as} / is all zeros for an empty array`, []),
    ],
    consistency: [
      consistencyCase(`${co} / is null under 7 nonzero days`, perDay([4, 4, 4, 4, 4, 4])),
      consistencyCase(`${co} / is null under 7 nonzero days (zeros ignored)`, perDay([4, 0, 4, 0, 4, 0, 4, 4, 4])),
      consistencyCase(
        `${co} / is the share of nonzero days within ±50% of the median nonzero day`,
        perDay([4, 0, 1, 4, 5, 9, 3, 4, 0, 6]),
      ),
      consistencyCase(`${co} / is 1 for perfectly even days`, perDay([4, 4, 4, 4, 4, 4, 4])),
    ],
    dayAnomalies: [
      anomalyCase(`${da} / returns [] under the nonzero-day minimum sample (default 14)`, perDay([...base.slice(0, 12), 20])),
      anomalyCase(
        `${da} / returns [] under the nonzero-day minimum sample (zero days don't count)`,
        perDay([...base.slice(0, 12), 20, 0, 0]),
      ),
      anomalyCase(`${da} / flags high and low outliers with robust z, sorted by |z| desc`, perDay([...base, 7, 14])),
      anomalyCase(`${da} / respects a custom threshold and minSample (defaults)`, perDay([...base, 14])),
      anomalyCase(`${da} / respects a custom threshold and minSample (zThreshold 2)`, perDay([...base, 14]), null, 2),
      anomalyCase(`${da} / respects a custom threshold and minSample (MAD 0)`, perDay([4, 4, 4, 8]), 4, 3),
      anomalyCase(`${da} / returns [] when MAD is 0 and caps the list at 5 (MAD 0)`, perDay([...Array(14).fill(4), 40])),
      anomalyCase(`${da} / returns [] when MAD is 0 and caps the list at 5 (cap)`, perDay([...base, 14, 14, 14, 7, 7, 7])),
    ],
  };
}

function added(): Record<(typeof sections)[number], Case[]> {
  const base = Array.from({ length: 14 }, (_, i) => (i % 2 === 0 ? 9.5 : 10.5));
  // this-week on a Wednesday: Thu–Sun are still ahead and read as 0.
  const thisWeek = perDay([3, 5, 2, 0, 0, 0, 0]);
  return {
    bucketTrend: [
      trendCase("this-week with trailing future zeros", buckets(thisWeek.map((d) => d.ms))),
      trendCase("even count of slopes averages the middle pair", buckets([0, 7, 1, 9, 2, 3].map((h) => h * HOUR))),
      trendCase("odd ms values give a fractional slope", buckets([1_001, 2_003, 2_999, 4_007, 5_011])),
      trendCase("a projected change just under 10% of the median is flat", buckets([30, 30, 31, 31].map((m) => m * 60_000))),
      trendCase("a projected change at 10% of the median (the boundary)", buckets([10, 10, 10, 12].map((h) => h * HOUR))),
      trendCase("a falling series that ends at zero", buckets([5, 4, 3, 0].map((h) => h * HOUR))),
    ],
    activeStreak: [
      streakCase("this-week with trailing future zeros", thisWeek),
      streakCase("threshold equal to a day's ms counts it", perDay([1, 2, 1]), HOUR),
    ],
    consistency: [
      consistencyCase("this-week with trailing future zeros", thisWeek),
      consistencyCase("band edges are inclusive", perDay([2, 4, 6, 4, 4, 4, 1.999, 6.001])),
    ],
    dayAnomalies: [
      anomalyCase("equal |z| keeps input order (high first)", perDay([...base, 14, 6])),
      anomalyCase("equal |z| keeps input order (low first)", perDay([...base, 6, 14])),
      anomalyCase("this-week with trailing future zeros, minSample 3", thisWeek, 3, 0.5),
      anomalyCase("zThreshold 0 keeps every nonzero day but the cap", perDay([1, 2, 3, 4, 5, 6, 7]), 7, 0),
    ],
  };
}

/** A per-day series from a `days`-day scenario ending on `date` (viewer slice, inactive excluded). */
function scenarioSeries(zone: string, preset: "last-30d" | "last-90d", date: string, seed: number) {
  const p = resolveAt(zone, preset, date);
  if (!p) return null;
  const first = localDateOf(p.window.start, zone);
  const all = scenario({ zone, firstDay: addDate(first, -1), days: p.days.length + 1, seed });
  const spans = filterForInsights(all.map(toOccurrence), {
    viewerId: "me",
    hiddenCategoryIds: new Set(),
    includeInactive: false,
  });
  const usage = computeUsage(spans, p.days, p.window, { includeInactive: true });
  const week = resolveAt(zone, preset, date, "week");
  return {
    perDay: usage.perDay,
    dayBuckets: bucketUsage(spans, p.buckets.length === p.days.length ? p.buckets : []),
    weekBuckets: week ? bucketUsage(spans, week.buckets) : [],
  };
}

function matrix(): Record<(typeof sections)[number], Case[]> {
  const out: Record<(typeof sections)[number], Case[]> = {
    bucketTrend: [],
    activeStreak: [],
    consistency: [],
    dayAnomalies: [],
  };
  ZONES.forEach((zone, z) => {
    for (const [preset, date] of [
      ["last-30d", "2026-11-05"],
      ["last-90d", "2026-06-10"],
    ] as const) {
      const series = scenarioSeries(zone, preset, date, 3000 + 11 * z + (preset === "last-30d" ? 0 : 1));
      if (!series) continue;
      const name = `scenario ${zone} ${preset} at ${date}`;
      if (series.dayBuckets.length > 0) out.bucketTrend.push(trendCase(`${name}, day buckets`, series.dayBuckets));
      out.bucketTrend.push(trendCase(`${name}, week buckets`, series.weekBuckets));
      out.activeStreak.push(streakCase(name, series.perDay));
      out.activeStreak.push(streakCase(`${name}, at least 2 h`, series.perDay, 2 * HOUR));
      out.consistency.push(consistencyCase(name, series.perDay));
      out.dayAnomalies.push(anomalyCase(name, series.perDay));
      out.dayAnomalies.push(anomalyCase(`${name}, zThreshold 1.5`, series.perDay, null, 1.5));
    }
  });
  return out;
}

export function build(): Record<(typeof sections)[number], Case[]> {
  const parts = [seeds(), added(), matrix()];
  const out = {} as Record<(typeof sections)[number], Case[]>;
  for (const s of sections) out[s] = parts.flatMap((p) => p[s]);
  return out;
}
