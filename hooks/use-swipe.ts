import * as React from "react";

interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  /** Minimum horizontal distance (px) to count as a swipe. */
  threshold?: number;
  enabled?: boolean;
  /**
   * Gestures that begin on an element matching this selector (or a descendant
   * of one) are left alone. Used so dragging an event inside the time grid —
   * which always starts on an event block — never doubles as a page swipe.
   */
  ignoreSelector?: string;
}

/**
 * Minimal horizontal-swipe detector on pointer events (no deps). Spread the
 * returned handlers on a container. A swipe fires only when horizontal travel
 * dominates (|dx| > 1.5·|dy|) and clears `threshold`, so it won't trip on
 * vertical scrolling. Touch only — mouse/pen drags are ignored. When disabled
 * it returns no handlers, so callers can gate it per view.
 */
export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  threshold = 60,
  enabled = true,
  ignoreSelector,
}: SwipeOptions) {
  const start = React.useRef<{ x: number; y: number; id: number } | null>(null);

  if (!enabled) return {} as React.HTMLAttributes<HTMLElement>;

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (ignoreSelector && (e.target as Element).closest(ignoreSelector)) return;
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    },
    onPointerUp: (e: React.PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) < threshold || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
      if (dx < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    },
    onPointerCancel: () => {
      start.current = null;
    },
  } satisfies React.HTMLAttributes<HTMLElement>;
}
