import * as React from "react";

interface DragPagerOptions {
  /** Fires once a gesture locks into horizontal paging (use to mount neighbours). */
  onStart?: () => void;
  /** Live horizontal delta in px (negative = dragging left / toward "next"). */
  onMove?: (dx: number) => void;
  /** Release after a horizontal drag; `dx` is the final delta (0 on cancel). */
  onEnd?: (dx: number) => void;
  /** Min travel (px) before the gesture commits to an axis. */
  axisLock?: number;
  enabled?: boolean;
  /**
   * Gestures that begin on an element matching this selector (or a descendant)
   * are ceded — used so dragging an event block in the time grid stays an event
   * move and never turns into a page swipe. Same rule as `useSwipe`.
   */
  ignoreSelector?: string;
}

type Lock = "none" | "x" | "y" | "ignore";

/**
 * Live, finger-following horizontal drag detector on pointer events (no deps),
 * the carousel counterpart to `useSwipe`. Touch only — mouse/pen are ignored so
 * desktop selection/scroll is untouched. On the first move it locks an axis:
 * horizontal arms paging (`onStart` → `onMove(dx)*` → `onEnd(dx)`); vertical (or
 * a gesture starting on `ignoreSelector`) is ceded to native scroll / the grid.
 * `touch-action: pan-y` on the container lets vertical scroll flow through while
 * horizontal moves come here.
 */
export function useDragPager({
  onStart,
  onMove,
  onEnd,
  axisLock = 8,
  enabled = true,
  ignoreSelector,
}: DragPagerOptions) {
  const st = React.useRef<{ x: number; y: number; id: number; lock: Lock } | null>(
    null,
  );

  if (!enabled) return {} as React.HTMLAttributes<HTMLElement>;

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const onIgnored =
        ignoreSelector && (e.target as Element).closest(ignoreSelector);
      st.current = {
        x: e.clientX,
        y: e.clientY,
        id: e.pointerId,
        lock: onIgnored ? "ignore" : "none",
      };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = st.current;
      if (!s || e.pointerId !== s.id || s.lock === "ignore" || s.lock === "y") return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (s.lock === "none") {
        if (Math.abs(dx) < axisLock && Math.abs(dy) < axisLock) return;
        if (Math.abs(dx) > Math.abs(dy)) {
          s.lock = "x";
          onStart?.();
        } else {
          s.lock = "y";
          return;
        }
      }
      if (s.lock === "x") onMove?.(dx);
    },
    onPointerUp: (e: React.PointerEvent) => {
      const s = st.current;
      st.current = null;
      if (s && e.pointerId === s.id && s.lock === "x") onEnd?.(e.clientX - s.x);
    },
    onPointerCancel: () => {
      const s = st.current;
      st.current = null;
      if (s && s.lock === "x") onEnd?.(0);
    },
  } satisfies React.HTMLAttributes<HTMLElement>;
}
