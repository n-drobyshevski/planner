"use client";

import * as React from "react";
import { useUiStore } from "@/stores/ui-store";
import {
  DEFAULT_HOUR_PX,
  zoomAtCursor,
  pinchDistance,
  pinchMidpointY,
} from "@/lib/datetime/zoom-math";

// Wheel deltaMode normalization (mirrors use-wheel-pager): line/page → px.
const LINE = 40;
const normY = (d: number, mode: number, pageY: number) =>
  mode === 1 ? d * LINE : mode === 2 ? d * pageY : d;

// deltaY → multiplicative zoom factor. Up (negative deltaY / pinch-open) zooms in.
// Tuned so a discrete mouse notch is a clear step while a trackpad's fine deltas
// stay smooth: factor = e^(-deltaY·k) ≈ 1.0015^(-deltaY).
const WHEEL_K = 0.0015;

interface ZoomGestureArgs {
  /** The scrolling viewport (Radix ScrollArea viewport) to read/set scrollTop on
   *  and bind the gesture listeners to. */
  viewportRef: React.RefObject<HTMLDivElement | null>;
  /** Called once when a two-finger pinch begins, so the caller can cancel any
   *  in-progress single-touch grid gesture (long-press / drag-create). */
  onGestureStart?: () => void;
  enabled?: boolean;
}

/**
 * Ctrl+wheel — and trackpad pinch, which the OS delivers AS ctrl+wheel — plus
 * touchscreen two-finger pinch, to stretch the time grid vertically. The time
 * under the pointer (or pinch midpoint) stays put: the post-zoom scrollTop is
 * computed analytically (see `zoomAtCursor`) and applied in a layout effect,
 * after the taller/shorter content has laid out but before paint (no flicker).
 *
 * A NATIVE non-passive `wheel`/`touchmove` listener is mandatory — React binds
 * these passively, so `preventDefault` (needed to suppress browser page-zoom and
 * native scroll) is ignored on synthetic handlers. Mirrors `use-wheel-pager`:
 * bind once on the target, read live state through refs.
 */
export function useTimelineZoom({
  viewportRef,
  onGestureStart,
  enabled = true,
}: ZoomGestureArgs) {
  const hourPx = useUiStore((s) => s.hourPx);
  const setHourPx = useUiStore((s) => s.setHourPx);

  // Live mirrors so the once-bound listeners always see the latest values.
  // Updated after each commit (the listeners only fire on later user
  // interaction), never during render — mirrors use-wheel-pager.
  const hourPxRef = React.useRef(hourPx);
  const setHourPxRef = React.useRef(setHourPx);
  const onGestureStartRef = React.useRef(onGestureStart);
  const enabledRef = React.useRef(enabled);
  React.useEffect(() => {
    hourPxRef.current = hourPx;
    setHourPxRef.current = setHourPx;
    onGestureStartRef.current = onGestureStart;
    enabledRef.current = enabled;
  });

  // scrollTop to apply once the new height lands: set by a gesture, consumed by
  // the layout effect that fires on the resulting `hourPx` change.
  const pendingScrollRef = React.useRef<number | null>(null);

  // Apply the anchored scrollTop AFTER the height change has committed, so the
  // viewport is already tall/short enough for the target offset not to be clamped.
  React.useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (vp && pendingScrollRef.current != null) {
      vp.scrollTop = pendingScrollRef.current;
      pendingScrollRef.current = null;
    }
  }, [hourPx, viewportRef]);

  React.useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    // One anchored zoom step, from the committed scale, keeping `anchorClientY` fixed.
    const applyZoom = (factor: number, anchorClientY: number) => {
      const old = hourPxRef.current;
      const rect = vp.getBoundingClientRect();
      const { hourPx: next, scrollTop } = zoomAtCursor({
        oldHourPx: old,
        factor,
        scrollTop: vp.scrollTop,
        cursorOffsetY: anchorClientY - rect.top,
      });
      if (next === old) return;
      pendingScrollRef.current = scrollTop;
      setHourPxRef.current(next);
    };

    // --- Ctrl+wheel / trackpad pinch, coalesced per animation frame ---
    let accumFactor = 1;
    let lastClientY = 0;
    let raf = 0;
    const flush = () => {
      raf = 0;
      const f = accumFactor;
      accumFactor = 1;
      if (f !== 1) applyZoom(f, lastClientY);
    };
    const onWheel = (e: WheelEvent) => {
      if (!enabledRef.current || !e.ctrlKey) return; // plain scroll flows through
      e.preventDefault(); // suppress browser page-zoom + native scroll
      e.stopPropagation(); // keep the carousel's wheel-pager out of it
      const dy = normY(e.deltaY, e.deltaMode, vp.clientHeight || 1);
      accumFactor *= Math.exp(-dy * WHEEL_K);
      lastClientY = e.clientY;
      if (!raf) raf = requestAnimationFrame(flush);
    };

    // --- Touchscreen two-finger pinch ---
    let pinching = false;
    let prevDist = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (!enabledRef.current || e.touches.length !== 2) return;
      pinching = true;
      prevDist = pinchDistance(e.touches[0], e.touches[1]);
      onGestureStartRef.current?.(); // cancel any single-touch grid gesture
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinching || e.touches.length !== 2) return;
      e.preventDefault(); // take over from native pan for the duration of the pinch
      const dist = pinchDistance(e.touches[0], e.touches[1]);
      if (prevDist > 0 && dist > 0) {
        applyZoom(dist / prevDist, pinchMidpointY(e.touches[0], e.touches[1]));
      }
      prevDist = dist;
    };
    const endPinch = (e: TouchEvent) => {
      if (pinching && e.touches.length < 2) pinching = false;
    };

    vp.addEventListener("wheel", onWheel, { passive: false });
    vp.addEventListener("touchstart", onTouchStart, { passive: false });
    vp.addEventListener("touchmove", onTouchMove, { passive: false });
    vp.addEventListener("touchend", endPinch);
    vp.addEventListener("touchcancel", endPinch);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      vp.removeEventListener("wheel", onWheel);
      vp.removeEventListener("touchstart", onTouchStart);
      vp.removeEventListener("touchmove", onTouchMove);
      vp.removeEventListener("touchend", endPinch);
      vp.removeEventListener("touchcancel", endPinch);
    };
  }, [viewportRef]);
}

const STORAGE_PREFIX = "planner:timelineZoom:";

/**
 * Remembers the time-grid zoom per device + per user (the user id separates
 * profiles sharing a device), debounces writes, and wires Ctrl/Cmd+0 to reset to
 * the default while `resetEnabled` (i.e. in a timed view). State starts at the
 * server-rendered default and is reconciled from localStorage in a mount effect,
 * so there's no hydration mismatch (mirrors `useSidebarWidth`).
 */
export function useTimelineZoomPersistence(userKey: string, resetEnabled: boolean) {
  const key = `${STORAGE_PREFIX}${userKey || "anon"}`;
  const hourPx = useUiStore((s) => s.hourPx);
  const setHourPx = useUiStore((s) => s.setHourPx);

  // Reconcile from storage once the (user-namespaced) key is known.
  React.useEffect(() => {
    const raw = window.localStorage.getItem(key);
    const n = raw ? Number.parseFloat(raw) : NaN;
    if (Number.isFinite(n)) setHourPx(n); // clamps inside
  }, [key, setHourPx]);

  // Persist after the value settles. Skip the first run so an untouched session
  // never writes a junk default; the load above re-fires this with the real value.
  const firstWrite = React.useRef(true);
  React.useEffect(() => {
    if (firstWrite.current) {
      firstWrite.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      window.localStorage.setItem(key, String(Math.round(hourPx)));
    }, 300);
    return () => window.clearTimeout(id);
  }, [key, hourPx]);

  // Ctrl/Cmd+0 → reset to the un-zoomed default (timed views only). Overrides the
  // browser's zoom-reset while the calendar grid is on screen.
  const resetEnabledRef = React.useRef(resetEnabled);
  React.useEffect(() => {
    resetEnabledRef.current = resetEnabled;
  });
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!resetEnabledRef.current) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === "0" || e.code === "Digit0")) {
        e.preventDefault();
        setHourPx(DEFAULT_HOUR_PX);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setHourPx]);
}
