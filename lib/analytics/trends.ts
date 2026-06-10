// Trend aggregations for the Insights views: time per bucket, rolling
// averages, and per-category series over buckets. Pure + side-effect-free;
// times are epoch ms with half-open [start, end) intervals throughout.
//
// Callers pass occurrences already filtered for insights (tracked + member +
// category via lib/insights/filters.ts) — nothing is dropped here.

import type { Occurrence } from "@/lib/types";
import type { Bucket } from "@/lib/insights/period";
import type { DayUsage } from "@/lib/analytics/usage";

/** Series key for categories folded beyond the top N. */
export const OTHER_SERIES = "__other__";
/** Series key for `categoryId: null` when it ranks inside the top N. */
export const UNCATEGORIZED_SERIES = "__uncategorized__";

export interface BucketUsage {
  start: number;
  end: number;
  /** tracked ms clipped to this bucket */
  ms: number;
}

export interface RollingPoint {
  dayMs: number;
  /** trailing average over up to `windowDays` days ending at this one */
  avgMs: number;
}

export interface CategoryBucketRow {
  start: number;
  end: number;
  /** ms per series key; every seriesKey is present (0 when empty) */
  byKey: Record<string, number>;
}

export interface CategoryBuckets {
  /** top-N category ids (null encoded as UNCATEGORIZED_SERIES) by total ms
   *  descending, with OTHER_SERIES appended when anything folded */
  seriesKeys: string[];
  rows: CategoryBucketRow[];
}

export interface Delta {
  delta: number;
  /** relative change, or null when previous is 0 (render as "new") */
  deltaPct: number | null;
}

/** Overlap (ms, ≥ 0) of half-open [aStart, aEnd) with [bStart, bEnd). */
function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/** Total ms per bucket, occurrence time clipped to each bucket. */
export function bucketUsage(occurrences: Occurrence[], buckets: Bucket[]): BucketUsage[] {
  return buckets.map((b) => {
    let ms = 0;
    for (const o of occurrences) ms += overlap(o.start, o.end, b.start, b.end);
    return { start: b.start, end: b.end, ms };
  });
}

/** Trailing average over up to `windowDays` days (shrinks at the range start). */
export function rollingAverage(perDay: DayUsage[], windowDays = 7): RollingPoint[] {
  const out: RollingPoint[] = [];
  let sum = 0;
  for (let i = 0; i < perDay.length; i++) {
    sum += perDay[i].ms;
    if (i >= windowDays) sum -= perDay[i - windowDays].ms;
    const count = Math.min(i + 1, windowDays);
    out.push({ dayMs: perDay[i].dayMs, avgMs: sum / count });
  }
  return out;
}

const seriesKeyOf = (categoryId: string | null): string =>
  categoryId ?? UNCATEGORIZED_SERIES;

/**
 * Per-category ms per bucket, keeping the top `topN` categories (by total ms
 * across all buckets) as their own series and folding the rest into
 * OTHER_SERIES. Rows carry every series key (zeros included) so stacked /
 * multi-line charts keep their series aligned across buckets.
 */
export function categoryTrends(
  occurrences: Occurrence[],
  buckets: Bucket[],
  topN = 5,
): CategoryBuckets {
  // Total per category (bucket-clipped) decides the top N.
  const totals = new Map<string, number>();
  const perBucket = buckets.map((b) => {
    const byCat = new Map<string, number>();
    for (const o of occurrences) {
      const ms = overlap(o.start, o.end, b.start, b.end);
      if (ms <= 0) continue;
      const key = seriesKeyOf(o.categoryId);
      byCat.set(key, (byCat.get(key) ?? 0) + ms);
      totals.set(key, (totals.get(key) ?? 0) + ms);
    }
    return byCat;
  });

  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, topN).map(([key]) => key);
  const folded = ranked.length > topN;
  const seriesKeys = folded ? [...top, OTHER_SERIES] : top;
  const topSet = new Set(top);

  const rows: CategoryBucketRow[] = buckets.map((b, i) => {
    const byKey: Record<string, number> = {};
    for (const key of seriesKeys) byKey[key] = 0;
    for (const [key, ms] of perBucket[i]) {
      byKey[topSet.has(key) ? key : OTHER_SERIES] += ms;
    }
    return { start: b.start, end: b.end, byKey };
  });

  return { seriesKeys, rows };
}

/** Absolute + relative change vs a previous value; pct is null when prev = 0. */
export function delta(current: number, previous: number): Delta {
  return {
    delta: current - previous,
    deltaPct: previous === 0 ? null : (current - previous) / previous,
  };
}
