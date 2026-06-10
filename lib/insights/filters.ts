// One-pass occurrence filter for the Insights views (pure).
//
// Member semantics differ from the calendar's overlay deliberately: insights
// always considers the partner's *visible* events (RLS has already removed
// private rows server-side), without requiring the calendar's overlay opt-in.
// The always-visible member filter in the toolbar is what surfaces this.
// Joint items (Shared contexts) occupy both members' time, so they pass the
// "me" and the "partner" filter alike.

import { isTracked } from "@/lib/analytics/usage";
import type { Occurrence } from "@/lib/types";

export type MemberFilter = "me" | "partner" | "both";

export interface InsightsFilter {
  viewerId: string;
  member: MemberFilter;
  /** category ids hidden from the aggregation (uncategorized can't be hidden) */
  hiddenCategoryIds: Set<string>;
  /** opt grayed-out blocks (e.g. sleep) into the totals */
  includeInactive: boolean;
}

/**
 * Tracked + member + category filtering in a single pass. Output feeds the
 * pure lib/analytics aggregations, which themselves drop nothing.
 */
export function filterForInsights(
  occurrences: Occurrence[],
  { viewerId, member, hiddenCategoryIds, includeInactive }: InsightsFilter,
): Occurrence[] {
  return occurrences.filter((o) => {
    if (!isTracked(o, includeInactive)) return false;
    if (member === "me" && !(o.ownerId === viewerId || o.isShared)) return false;
    if (member === "partner" && !(o.ownerId !== viewerId || o.isShared)) return false;
    if (o.categoryId !== null && hiddenCategoryIds.has(o.categoryId)) return false;
    return true;
  });
}
