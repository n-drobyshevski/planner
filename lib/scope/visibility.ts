// Scope/visibility + client overlay/category filtering (pure).
// Times are epoch milliseconds (UTC); intervals are half-open [start,end).
//
// Sharing model: every item belongs to one member's calendar (its owner) and is
// shared (visible to the workspace) by default. An item flagged `isPrivate` is
// visible only to its owner; other members' calendars are overlaid read-only.
// EXCEPTION — a JOINT item (`isShared`, i.e. filed under a Shared context): both
// members see it without overlaying the owner and both may edit it ("we both
// attend this"). RLS enforces the same rules server-side.

import type { Occurrence } from "@/lib/types";

/**
 * Whether a viewer may SEE an item: a joint item is visible to both members; the
 * owner always sees their own; others see it only if it isn't private.
 */
export function canSee(
  e: { isPrivate: boolean; ownerId: string; isShared: boolean },
  viewerId: string,
): boolean {
  return e.isShared || e.ownerId === viewerId || !e.isPrivate;
}

/** Whether a viewer may EDIT an item: its owner, or either member if it's joint. */
export function canEdit(
  e: { ownerId: string; isShared: boolean },
  viewerId: string,
): boolean {
  return e.isShared || e.ownerId === viewerId;
}

/** The display layer (calendar) an item belongs to: always its owner. */
export function layerOf(e: { ownerId: string }): string {
  return e.ownerId;
}

/**
 * Filter occurrences for the calendar view. Keep `o` iff it is joint (a Shared
 * context — always shown to both), or belongs to the viewer's own calendar, or
 * to an explicitly-overlaid member's calendar — and its category (when set)
 * isn't hidden. The viewer's own calendar is shown by default; setting
 * `selfHidden` hides the viewer's own personal items (joint/Shared items still
 * show). Other members appear only when toggled on in the sidebar. Hiding a
 * context still hides its joint items (the hidden-category clause applies to
 * everything).
 */
export function filterVisible(
  occ: Occurrence[],
  args: {
    viewerId: string;
    overlayMemberIds: Set<string>;
    hiddenCategoryIds: Set<string>;
    selfHidden: boolean;
  },
): Occurrence[] {
  const { viewerId, overlayMemberIds, hiddenCategoryIds, selfHidden } = args;
  return occ.filter(
    (o) =>
      ((!selfHidden && o.ownerId === viewerId) ||
        o.isShared ||
        overlayMemberIds.has(o.ownerId)) &&
      !(o.categoryId !== null && hiddenCategoryIds.has(o.categoryId)),
  );
}
