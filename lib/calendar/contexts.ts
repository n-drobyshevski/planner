// Pure helpers for "context" time-block containers.
//
// Membership has two layers (see the feature plan):
//  * Visual nesting in the time grid is OVERLAP-based — a normal event whose
//    time range overlaps a context occurrence renders on top of its backdrop.
//  * `contextId` is a stored hint set by the assignment UIs (create-inside,
//    drag-into, dialog/menu). On move we re-derive it from overlap.
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
 * The master event id of the context a child at [start,end) belongs to under
 * the overlap model, or null. Used to re-derive `contextId` when an event is
 * moved/resized. Anchored on the start instant (consistent with create-inside).
 */
export function contextIdForRange(
  contexts: Occurrence[],
  start: number,
): string | null {
  return enclosingContext(contexts, start)?.eventId ?? null;
}
