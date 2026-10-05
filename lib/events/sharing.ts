// Who sees an event, from its Context + the private/visible/shared control.
// Shared by the event dialog and the .ics import review so both file events
// the same way.
import type { Category } from "@/lib/types";

/**
 * Visibility of an item (outside a Shared context):
 *  - private: only the owner sees it
 *  - visible: the default — the partner can see it on the owner's calendar
 *    (overlay), only the owner edits
 *  - shared: joint — both see it on their own calendars and both can edit it
 */
export type EventVisibility = "private" | "visible" | "shared";

/** Contexts a member can file an item under: the shared ones plus their own. */
export function usableCategories(categories: readonly Category[], memberId: string): Category[] {
  return categories.filter((c) => c.ownerId === null || c.ownerId === memberId);
}

/**
 * An item filed under a SHARED context (owner_id IS NULL) is JOINT via the
 * context, so the per-event visibility control is hidden and the stored flags
 * are coerced clean (jointness comes from the context). Otherwise the 3-way
 * control governs the flags. `categoryId` is "none" or a category id.
 */
export function deriveSharing(
  categoryId: string,
  visibility: EventVisibility,
  categories: readonly Category[],
): { sharedContext: boolean; isPrivate: boolean; isShared: boolean } {
  const selected =
    categoryId !== "none" ? (categories.find((c) => c.id === categoryId) ?? null) : null;
  const sharedContext = selected?.ownerId === null;
  return {
    sharedContext,
    isPrivate: sharedContext ? false : visibility === "private",
    isShared: sharedContext ? false : visibility === "shared",
  };
}
