// Balance aggregations for the Insights views: category share shifts vs the
// previous period, stacked category-per-bucket rows, and the member split.
// Pure + side-effect-free; epoch ms, half-open [start, end) intervals.
//
// Callers pass occurrences already filtered for insights (tracked + member +
// category via lib/insights/filters.ts) — nothing is dropped here.

import type { Occurrence, TimeWindow } from "@/lib/types";
import type { Bucket } from "@/lib/insights/period";
import { categoryTrends, type CategoryBuckets } from "@/lib/analytics/trends";

export interface CategoryShare {
  /** null = uncategorized */
  categoryId: string | null;
  ms: number;
  /** share of the current window's total (0 when the total is 0) */
  share: number;
  prevMs: number;
  prevShare: number;
  /** share − prevShare, in share points (−1..1) */
  deltaShare: number;
}

export interface MemberBucketRow {
  start: number;
  end: number;
  /** ms per member id; every memberIds entry is present (0 when empty) */
  byMember: Record<string, number>;
}

export interface MemberBuckets {
  /** member ids by total ms descending */
  memberIds: string[];
  rows: MemberBucketRow[];
}

/** Overlap (ms, ≥ 0) of half-open [aStart, aEnd) with [bStart, bEnd). */
function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function totalsByCategory(
  occurrences: Occurrence[],
  window: TimeWindow,
): Map<string | null, number> {
  const totals = new Map<string | null, number>();
  for (const o of occurrences) {
    const ms = overlap(o.start, o.end, window.start, window.end);
    if (ms <= 0) continue;
    totals.set(o.categoryId, (totals.get(o.categoryId) ?? 0) + ms);
  }
  return totals;
}

/**
 * Per-category time as a share of each window's total, with the share shift
 * between them. Categories present in either window are included; sorted by
 * current ms descending, then previous ms (so vanished ones rank by what
 * they used to be).
 */
export function categoryShares(
  current: Occurrence[],
  previous: Occurrence[],
  curWindow: TimeWindow,
  prevWindow: TimeWindow,
): CategoryShare[] {
  const cur = totalsByCategory(current, curWindow);
  const prev = totalsByCategory(previous, prevWindow);
  const curTotal = [...cur.values()].reduce((s, v) => s + v, 0);
  const prevTotal = [...prev.values()].reduce((s, v) => s + v, 0);

  const ids = new Set<string | null>([...cur.keys(), ...prev.keys()]);
  return [...ids]
    .map((categoryId) => {
      const ms = cur.get(categoryId) ?? 0;
      const prevMs = prev.get(categoryId) ?? 0;
      const share = curTotal > 0 ? ms / curTotal : 0;
      const prevShare = prevTotal > 0 ? prevMs / prevTotal : 0;
      return { categoryId, ms, share, prevMs, prevShare, deltaShare: share - prevShare };
    })
    .sort((a, b) => b.ms - a.ms || b.prevMs - a.prevMs);
}

/**
 * Stacked-bar rows: per-category ms per bucket, top-N + other. Same series
 * encoding as the Trends tab (see categoryTrends) so legends/colors match.
 */
export function categoryByBucket(
  occurrences: Occurrence[],
  buckets: Bucket[],
  topN = 5,
): CategoryBuckets {
  return categoryTrends(occurrences, buckets, topN);
}

/** Per-member ms per bucket; rows carry every member id (zeros included). */
export function memberByBucket(
  occurrences: Occurrence[],
  buckets: Bucket[],
): MemberBuckets {
  const totals = new Map<string, number>();
  const perBucket = buckets.map((b) => {
    const byMember = new Map<string, number>();
    for (const o of occurrences) {
      const ms = overlap(o.start, o.end, b.start, b.end);
      if (ms <= 0) continue;
      byMember.set(o.ownerId, (byMember.get(o.ownerId) ?? 0) + ms);
      totals.set(o.ownerId, (totals.get(o.ownerId) ?? 0) + ms);
    }
    return byMember;
  });

  const memberIds = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const rows: MemberBucketRow[] = buckets.map((b, i) => {
    const byMember: Record<string, number> = {};
    for (const id of memberIds) byMember[id] = perBucket[i].get(id) ?? 0;
    return { start: b.start, end: b.end, byMember };
  });
  return { memberIds, rows };
}
