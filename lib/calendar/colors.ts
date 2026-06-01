import type { Occurrence, Category, Member } from "@/lib/types";

// Fallbacks when an event has no category (all WCAG-AA on white text).
const SHARED_FALLBACK = "#b45309"; // amber
const PERSONAL_FALLBACK = "#c0492a"; // coral

/** Resolve the display color for an occurrence: own color, else category, else member/shared. */
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
  if (occ.scope === "shared") return SHARED_FALLBACK;
  return members.get(occ.ownerId)?.color ?? PERSONAL_FALLBACK;
}
