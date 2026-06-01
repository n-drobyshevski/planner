import type { Occurrence, Category, Member } from "@/lib/types";

// Fallback when an event has no category and its owner can't be resolved.
const FALLBACK = "#c0492a"; // coral (WCAG-AA on white text)

/**
 * Resolve the display color for an occurrence: per-item override, else category,
 * else its owner's calendar color. The owner color makes each member's calendar
 * read as its own color when overlaid (Google-Calendar style).
 */
export function resolveOccurrenceColor(
  occ: Occurrence,
  categories: Map<string, Category>,
  members: Map<string, Member>,
): string {
  if (occ.color) return occ.color; // per-item override wins
  if (occ.categoryId) {
    const c = categories.get(occ.categoryId);
    if (c) return c.color;
  }
  return members.get(occ.ownerId)?.color ?? FALLBACK;
}
