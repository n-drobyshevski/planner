// Scope/visibility + client overlay/category filtering (pure).
// Times are epoch milliseconds (UTC); intervals are half-open [start,end).
//
// Sharing model: every item belongs to one member's calendar (its owner) and is
// shared (visible to the workspace) by default. An item flagged `isPrivate` is
// visible only to its owner. Editing is owner-only; other members' calendars are
// overlaid read-only. RLS enforces the same rules server-side.

import type { Occurrence } from "@/lib/types";

/** Whether a viewer may SEE an item: the owner always can; others only if it's not private. */
export function canSee(
  e: { isPrivate: boolean; ownerId: string },
  viewerId: string,
): boolean {
  return e.ownerId === viewerId || !e.isPrivate;
}

/** Whether a viewer may EDIT an item: only its owner. */
export function canEdit(e: { ownerId: string }, viewerId: string): boolean {
  return e.ownerId === viewerId;
}

/** The display layer (calendar) an item belongs to: always its owner. */
export function layerOf(e: { ownerId: string }): string {
  return e.ownerId;
}

/**
 * Filter occurrences for the calendar view. Keep `o` iff it belongs to the
 * viewer's own calendar OR an explicitly-overlaid member's calendar, and its
 * category (when set) isn't hidden. The viewer's own calendar is always shown;
 * other members appear only when toggled on in the sidebar.
 */
export function filterVisible(
  occ: Occurrence[],
  args: {
    viewerId: string;
    overlayMemberIds: Set<string>;
    hiddenCategoryIds: Set<string>;
  },
): Occurrence[] {
  const { viewerId, overlayMemberIds, hiddenCategoryIds } = args;
  return occ.filter(
    (o) =>
      (o.ownerId === viewerId || overlayMemberIds.has(o.ownerId)) &&
      !(o.categoryId !== null && hiddenCategoryIds.has(o.categoryId)),
  );
}
