// Momentum aggregations for the Insights views: bucket-series trend
// direction, active-day streaks, day-to-day consistency, and robust day
// anomalies. Pure + side-effect-free; epoch ms; per-day rows follow the
// computeUsage perDay shape ({ dayMs, ms }) so callers can feed it straight
// through.

import { mad, median, robustZ, theilSenSlope } from "@/lib/analytics/stats";

const MIN_TREND_BUCKETS = 4;
/** Projected series changes under this share of the median bucket read flat. */
const FLAT_SHARE = 0.1;
const MIN_CONSISTENCY_DAYS = 7;
const CONSISTENCY_BAND = 0.5;
const DEFAULT_ANOMALY_MIN_SAMPLE = 14;
const DEFAULT_ANOMALY_Z = 3;
const ANOMALY_CAP = 5;

export interface TrendDirection {
  /** Theil–Sen slope in ms per bucket; null under MIN_TREND_BUCKETS buckets */
  slopeMsPerBucket: number | null;
  /** null when the slope is null (insufficient data) */
  direction: "up" | "down" | "flat" | null;
}

/**
 * Trend over a bucket series via Theil–Sen on (index, ms) — robust to a
 * single outlier bucket. Requires at least 4 buckets; under that both fields
 * are null. Flat rule, exactly: the projected change across the whole series,
 * |slope × (bucketCount − 1)|, is strictly under FLAT_SHARE (10%) of the
 * median bucket value; a zero slope is always flat (covers an all-zero
 * series, where the 10%-of-median threshold would itself be 0).
 */
export function bucketTrend(
  buckets: { start: number; end: number; ms: number }[],
): TrendDirection {
  if (buckets.length < MIN_TREND_BUCKETS) {
    return { slopeMsPerBucket: null, direction: null };
  }
  // Indices are distinct, so ≥ 4 points always yield a slope.
  const slope = theilSenSlope(buckets.map((b, i) => ({ x: i, y: b.ms })));
  if (slope === null) return { slopeMsPerBucket: null, direction: null };
  const projected = Math.abs(slope * (buckets.length - 1));
  const flat = slope === 0 || projected < FLAT_SHARE * median(buckets.map((b) => b.ms));
  return {
    slopeMsPerBucket: slope,
    direction: flat ? "flat" : slope > 0 ? "up" : "down",
  };
}

export interface Streak {
  /** consecutive active days counting back from the LAST day of the array */
  current: number;
  /** longest run of consecutive active days anywhere in the array */
  longest: number;
}

/**
 * Streaks of "active" days (ms ≥ minMsPerDay) over consecutive per-day rows.
 * `current` counts back from the last day of the array — callers wanting a
 * "today" semantic should end the array at today.
 */
export function activeStreak(
  perDay: { dayMs: number; ms: number }[],
  minMsPerDay = 1,
): Streak {
  let longest = 0;
  let run = 0;
  for (const d of perDay) {
    run = d.ms >= minMsPerDay ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  let current = 0;
  for (let i = perDay.length - 1; i >= 0 && perDay[i].ms >= minMsPerDay; i--) {
    current += 1;
  }
  return { current, longest };
}

/**
 * Day-to-day consistency: the share of nonzero days whose tracked time falls
 * within ±50% of the median nonzero day (inclusive bounds — [0.5×, 1.5×]).
 * Null under 7 nonzero days, where a share would be mostly noise.
 */
export function consistency(perDay: { dayMs: number; ms: number }[]): number | null {
  const nonzero = perDay.map((d) => d.ms).filter((ms) => ms > 0);
  if (nonzero.length < MIN_CONSISTENCY_DAYS) return null;
  const med = median(nonzero);
  const within = nonzero.filter(
    (ms) => ms >= (1 - CONSISTENCY_BAND) * med && ms <= (1 + CONSISTENCY_BAND) * med,
  ).length;
  return within / nonzero.length;
}

export interface Anomaly {
  dayMs: number;
  ms: number;
  /** robust z-score (0.6745·(ms − median)/MAD over nonzero days) */
  z: number;
  direction: "high" | "low";
}

/**
 * Unusually heavy/light days via robust z-scores (median/MAD over NONZERO
 * days — untracked days are absence of data, not zero load). Empty result
 * when there are fewer than `minSample` (default 14) nonzero days or MAD is
 * 0 (constant data — robustZ is null). Flags |z| ≥ `zThreshold` (default 3),
 * sorted by |z| descending, capped at 5.
 */
export function dayAnomalies(
  perDay: { dayMs: number; ms: number }[],
  opts?: { minSample?: number; zThreshold?: number },
): Anomaly[] {
  const minSample = opts?.minSample ?? DEFAULT_ANOMALY_MIN_SAMPLE;
  const zThreshold = opts?.zThreshold ?? DEFAULT_ANOMALY_Z;
  const nonzero = perDay.filter((d) => d.ms > 0);
  if (nonzero.length < minSample) return [];
  const values = nonzero.map((d) => d.ms);
  const med = median(values);
  const madValue = mad(values);
  const out: Anomaly[] = [];
  for (const d of nonzero) {
    const z = robustZ(d.ms, med, madValue);
    if (z === null || Math.abs(z) < zThreshold) continue;
    out.push({ dayMs: d.dayMs, ms: d.ms, z, direction: z > 0 ? "high" : "low" });
  }
  out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  return out.slice(0, ANOMALY_CAP);
}
