// Vertical-zoom math for the time grid (pure). Pairs with grid-math.ts, which
// already takes an `hourPx` scale on every conversion; this module owns the
// zoom bounds and the cursor-anchored scroll adjustment that keeps the time
// under the pointer fixed while the grid stretches. No I/O, no DOM.

import { HOUR_PX } from "./grid-math";

/** Default scale (px per hour), re-exported so reset paths don't import two modules. */
export const DEFAULT_HOUR_PX = HOUR_PX;
/** Zoom bounds in px per hour: 0.5x – 4x of the 48px default. */
export const MIN_HOUR_PX = 24;
export const MAX_HOUR_PX = 192;

/** Clamp a px-per-hour value into the allowed zoom range. Non-finite → default. */
export function clampHourPx(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_HOUR_PX;
  return Math.min(MAX_HOUR_PX, Math.max(MIN_HOUR_PX, n));
}

export interface ZoomAtCursorArgs {
  /** Current scale before this step. */
  oldHourPx: number;
  /** Multiplicative scale step (>1 zooms in, <1 zooms out). */
  factor: number;
  /** The scroll container's current scrollTop (px, in the old scale). */
  scrollTop: number;
  /** Pointer/pinch Y within the viewport's visible area (px from its top edge). */
  cursorOffsetY: number;
}

export interface ZoomResult {
  hourPx: number;
  scrollTop: number;
}

/**
 * Apply a zoom step anchored at the cursor: the content point currently under
 * `cursorOffsetY` stays under it after the scale change. Uses the POST-clamp
 * ratio so scroll doesn't drift once a zoom limit is hit. `scrollTop` is floored
 * at 0 (can't scroll above the top), which is the only case the anchor can't hold.
 */
export function zoomAtCursor({
  oldHourPx,
  factor,
  scrollTop,
  cursorOffsetY,
}: ZoomAtCursorArgs): ZoomResult {
  const hourPx = clampHourPx(oldHourPx * factor);
  const ratio = hourPx / oldHourPx;
  const contentY = scrollTop + cursorOffsetY;
  const nextScrollTop = Math.max(0, contentY * ratio - cursorOffsetY);
  return { hourPx, scrollTop: nextScrollTop };
}

interface ClientPoint {
  clientX: number;
  clientY: number;
}

/** Euclidean distance between two touch points (for pinch scale). */
export function pinchDistance(a: ClientPoint, b: ClientPoint): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/** Vertical midpoint of two touch points (the pinch's anchor Y). */
export function pinchMidpointY(a: ClientPoint, b: ClientPoint): number {
  return (a.clientY + b.clientY) / 2;
}
