// One-pass occurrence filter for the Insights views (pure).
//
// Insights are strictly the viewer's own slice: an occurrence counts only when
// the viewer owns it or it's a joint item (Shared context / explicitly shared),
// which occupies both members' time. The partner's solo events — even visible,
// non-private ones — never enter the aggregation. RLS removes their private
// rows server-side; this drops their remaining visible ones client-side.

import { isTracked } from "@/lib/analytics/usage";
import type { Occurrence } from "@/lib/types";

export interface InsightsFilter {
  viewerId: string;
  /** category ids hidden from the aggregation (uncategorized can't be hidden) */
  hiddenCategoryIds: Set<string>;
  /** opt grayed-out blocks (e.g. sleep) into the totals */
  includeInactive: boolean;
}

/**
 * Tracked + viewer + category filtering in a single pass. Output feeds the
 * pure lib/analytics aggregations, which themselves drop nothing.
 */
export function filterForInsights(
  occurrences: Occurrence[],
  { viewerId, hiddenCategoryIds, includeInactive }: InsightsFilter,
): Occurrence[] {
  return occurrences.filter((o) => {
    if (!isTracked(o, includeInactive)) return false;
    if (!(o.ownerId === viewerId || o.isShared)) return false;
    if (o.categoryId !== null && hiddenCategoryIds.has(o.categoryId)) return false;
    return true;
  });
}
