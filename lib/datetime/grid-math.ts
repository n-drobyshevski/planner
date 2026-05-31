// Vertical time-grid math (pure).
// All times are epoch milliseconds (UTC-based). No I/O, no current-time reads.

export const HOUR_PX = 48;
export const SLOT_MIN = 15;
export const MIN_EVENT_MIN = 15;

/** Convert a minute offset into vertical pixels. */
export function minutesToY(minutes: number, hourPx = HOUR_PX): number {
  return (minutes * hourPx) / 60;
}

/** Convert a vertical pixel offset back into minutes. */
export function yToMinutes(y: number, hourPx = HOUR_PX): number {
  return (y * 60) / hourPx;
}

/** Round minutes to the nearest slot boundary. */
export function snapMinutes(minutes: number, slot = SLOT_MIN): number {
  // `+ 0` normalizes a possible signed-zero (Math.round(-0.4) === -0) to +0.
  return Math.round(minutes / slot) * slot + 0;
}

/** Convert an absolute ms timestamp into a Y pixel offset within a day. */
export function msToY(ms: number, dayStartMs: number, hourPx = HOUR_PX): number {
  return minutesToY((ms - dayStartMs) / 60000, hourPx);
}

/**
 * Pixel height for an event spanning [startMs, endMs), clamped so it is never
 * shorter than `minMin` minutes.
 */
export function durationToHeight(
  startMs: number,
  endMs: number,
  hourPx = HOUR_PX,
  minMin = MIN_EVENT_MIN,
): number {
  const durationMin = (endMs - startMs) / 60000;
  const minHeight = minutesToY(minMin, hourPx);
  const height = minutesToY(durationMin, hourPx);
  return Math.max(height, minHeight);
}

/** Round an absolute ms timestamp to the nearest slot boundary. */
export function snapMsToSlot(ms: number, slotMin = SLOT_MIN): number {
  const slotMs = slotMin * 60000;
  // `+ 0` normalizes a possible signed-zero result to +0.
  return Math.round(ms / slotMs) * slotMs + 0;
}

/** Map an X coordinate to a column index, clamped to [0, numCols-1]. */
export function dayIndexFromX(x: number, totalWidth: number, numCols: number): number {
  if (numCols <= 0) return 0;
  const colWidth = totalWidth / numCols;
  const idx = Math.floor(x / colWidth);
  return Math.max(0, Math.min(numCols - 1, idx));
}
