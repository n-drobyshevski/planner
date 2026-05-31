// Scope/visibility + client layer/category filtering (pure).
// Times are epoch milliseconds (UTC); intervals are half-open [start,end).

import type { Occurrence, Scope, Visibility } from "@/lib/types";

/**
 * Whether a viewer is allowed to SEE an event/occurrence.
 * Shared-scope items are visible to everyone; an owner always sees their own;
 * a personal item explicitly shared (visibility==='shared') is visible to all.
 */
export function canSee(
  e: { scope: Scope; visibility: Visibility; ownerId: string },
  viewerId: string,
): boolean {
  return (
    e.scope === "shared" ||
    e.ownerId === viewerId ||
    (e.scope === "personal" && e.visibility === "shared")
  );
}

/**
 * Whether a viewer is allowed to EDIT an event/occurrence.
 * Shared-scope items are editable by anyone; otherwise only the owner.
 */
export function canEdit(
  e: { scope: Scope; ownerId: string },
  viewerId: string,
): boolean {
  return e.scope === "shared" || e.ownerId === viewerId;
}

/**
 * The display layer an item belongs to: the literal 'shared' layer for
 * shared-scope items, otherwise the owner's id (a per-member layer).
 */
export function layerOf(e: { scope: Scope; ownerId: string }): string {
  return e.scope === "shared" ? "shared" : e.ownerId;
}

/**
 * Filter occurrences for a given viewer, applying client-side layer and
 * category hiding. Keep `o` iff the viewer can see it, its layer is not
 * hidden, and its category (when set) is not hidden.
 */
export function filterVisible(
  occ: Occurrence[],
  args: {
    viewerId: string;
    hiddenCategoryIds: Set<string>;
    hiddenLayers: Set<string>;
  },
): Occurrence[] {
  const { viewerId, hiddenCategoryIds, hiddenLayers } = args;
  return occ.filter(
    (o) =>
      canSee(o, viewerId) &&
      !hiddenLayers.has(layerOf(o)) &&
      !(o.categoryId !== null && hiddenCategoryIds.has(o.categoryId)),
  );
}
