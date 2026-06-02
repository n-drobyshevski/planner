// Pure helpers for "context" time-blocks (a Context's calendar backdrop).
//
// A context block (an occurrence with kind === "context") paints the category
// named by its `categoryId`. Membership has two layers:
//  * Visual nesting in the time grid is OVERLAP-based — a normal event whose
//    time range overlaps a context occurrence renders on top of its backdrop.
//  * `categoryId` is the stored membership. When an item is CREATED inside a
//    block it defaults to the block's category; moving never re-derives it.
//
// These functions are framework-free so they can be unit-tested directly.

import type { Occurrence } from "@/lib/types";

interface Span {
  start: number;
  end: number;
}

/** Half-open overlap: [a.start,a.end) intersects [b.start,b.end). */
export function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}

/** The context occurrences in a list (kind === "context"), in input order. */
export function contextOccurrences(occurrences: Occurrence[]): Occurrence[] {
  return occurrences.filter((o) => o.kind === "context");
}

/**
 * The context whose time range encloses instant `t` (used to auto-assign a
 * newly-created or dragged event). When several contexts overlap `t`, the
 * tightest (shortest) one wins so the most specific zone takes precedence.
 * Returns null when `t` is inside no context.
 */
export function enclosingContext(
  contexts: Occurrence[],
  t: number,
): Occurrence | null {
  let best: Occurrence | null = null;
  for (const c of contexts) {
    if (t >= c.start && t < c.end) {
      if (!best || c.end - c.start < best.end - best.start) best = c;
    }
  }
  return best;
}

/**
 * The category id an item starting at `start` should default to under the
 * overlap model: the category painted by its enclosing context block, or null
 * when it starts inside no block. Used to auto-assign a Context when an item is
 * created inside a backdrop. Anchored on the start instant.
 */
export function categoryIdForRange(
  contexts: Occurrence[],
  start: number,
): string | null {
  return enclosingContext(contexts, start)?.categoryId ?? null;
}
