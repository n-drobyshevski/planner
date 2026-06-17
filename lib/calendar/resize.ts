// Pure time math for dragging an event's top/bottom edge in the week/day grid.
//
// Everything here works in ABSOLUTE epoch-ms so events that cross midnight —
// most importantly sleep, which routinely runs e.g. 23:00 → 07:00 the next day —
// resize correctly. The dragged edge follows the pointer's own day/column while
// the opposite edge stays anchored; the two are kept at least `minMin` apart.

const MIN_MS = 60_000;

/**
 * New `[start, end]` for an event when one edge is dragged to `pointerMs`.
 *
 * `pointerMs` is the absolute time under the cursor (the cursor's own column's
 * midnight plus its minutes-of-day) — NOT a minutes-of-day value clamped to the
 * event's start day. That's the whole point: a cross-midnight event's morning
 * segment lives in the next column, so its handles must resolve against that
 * column's day, not the start day.
 */
export function resizeOccurrence(
  startMs: number,
  endMs: number,
  edge: "start" | "end",
  pointerMs: number,
  minMin: number,
): { start: number; end: number } {
  const minMs = minMin * MIN_MS;
  if (edge === "start") {
    // Top edge: never cross past (end − minimum).
    return { start: Math.min(pointerMs, endMs - minMs), end: endMs };
  }
  // Bottom edge: never cross above (start + minimum).
  return { start: startMs, end: Math.max(pointerMs, startMs + minMs) };
}

/**
 * The single-column preview rectangle for an in-progress resize.
 *
 * A resize preview is drawn in one day column. For a multi-day event we show the
 * segment that contains the edge being dragged: the start edge's column for a
 * top drag, the end edge's column for a bottom drag (a bottom edge landing
 * exactly on midnight belongs to the day that just ended, hence `endMs − 1`).
 * Returns `null` if the clipped segment is empty.
 */
export function resizePreviewSegment(
  startMs: number,
  endMs: number,
  edge: "start" | "end",
  days: number[],
  dayMs: number,
): { dayIndex: number; topMin: number; heightMin: number } | null {
  const dayIndexOf = (ms: number) => {
    for (let i = 0; i < days.length; i++) {
      if (ms >= days[i] && ms < days[i] + dayMs) return i;
    }
    return ms < days[0] ? 0 : days.length - 1;
  };
  const col = edge === "end" ? dayIndexOf(endMs - 1) : dayIndexOf(startMs);
  const colStart = days[col];
  const colEnd = colStart + dayMs;
  const top = Math.max(startMs, colStart);
  const bot = Math.min(endMs, colEnd);
  if (bot <= top) return null;
  return {
    dayIndex: col,
    topMin: (top - colStart) / MIN_MS,
    heightMin: (bot - top) / MIN_MS,
  };
}
