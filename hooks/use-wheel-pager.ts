import * as React from "react";

interface WheelPagerOptions {
  /** The element to listen on (the carousel viewport). */
  targetRef: React.RefObject<HTMLElement | null>;
  /** Page one period; fires once per horizontal gesture. */
  onPage: (dir: -1 | 1) => void;
  enabled?: boolean;
  /** Returns true while a slide is animating — events are swallowed, not paged. */
  isBusy?: () => boolean;
  /**
   * Gestures whose target matches this selector (or a descendant) are ceded to
   * the native scroller. Reserved for a future horizontally-scrollable
   * descendant; the calendar has none today, so callers leave it unset.
   */
  ignoreSelector?: string;
}

const THRESHOLD = 60; // normalized px of accumulated |deltaX| before a page fires
const RESET_GAP = 200; // ms of silence after which leftover accumulation is dropped
const MIN_INTERVAL = 180; // ms floor between pages (rate-limit, independent of React state)
const LINE = 40; // px per line, for deltaMode=1 (Firefox) normalization

/**
 * The desktop counterpart to `useDragPager`: a two-finger horizontal trackpad
 * swipe (or Shift+wheel) pages the carousel, reusing the same animation. A
 * NATIVE non-passive `wheel` listener is required — React registers `onWheel`
 * passively, so its `preventDefault` is ignored, and we must `preventDefault`
 * horizontal events to suppress the browser's history back/forward swipe.
 *
 * Only horizontal-dominant events are claimed; vertical scrolling flows through
 * to the time grid untouched.
 *
 * Paging cadence: accumulate `deltaX` until it crosses `THRESHOLD`, fire one
 * page, then RESET the accumulator. The re-arm is immediate — we deliberately do
 * NOT wait for the momentum tail to fall silent (that's what made paging "stick"
 * for up to a second after a flick). Overshoot from a hard flick's momentum is
 * curbed three ways: events during the slide are discarded (the animation is the
 * cooldown), a `MIN_INTERVAL` floor caps the page rate, and a direction reversal
 * or a `RESET_GAP` pause zeroes the accumulator. A discrete mouse-wheel notch
 * (one event ≥ THRESHOLD) pages exactly once; momentum is normalized across
 * browsers via `deltaMode`.
 *
 * Direction: `deltaX > 0` → next (+1), `< 0` → prev (-1). This is the platform
 * natural-direction convention and the physical inverse of `useDragPager`'s
 * `dx` sign (drag tracks the finger; wheel tracks content displacement) — both
 * map a leftward content motion to "next". Do not "fix" this to match the drag.
 *
 * The listener binds once; live options are read through refs so an in-flight
 * gesture never loses its accumulated state to a re-bind.
 */
export function useWheelPager({
  targetRef,
  onPage,
  enabled = true,
  isBusy,
  ignoreSelector,
}: WheelPagerOptions) {
  const onPageRef = React.useRef(onPage);
  const enabledRef = React.useRef(enabled);
  const isBusyRef = React.useRef(isBusy);
  const ignoreRef = React.useRef(ignoreSelector);
  // Keep the latest options visible to the once-bound listener (updated after
  // each commit; the listener only fires on later user interaction).
  React.useEffect(() => {
    onPageRef.current = onPage;
    enabledRef.current = enabled;
    isBusyRef.current = isBusy;
    ignoreRef.current = ignoreSelector;
  });

  React.useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    let accumX = 0;
    let lastTs = 0;
    let lastFire = 0;

    // Normalize deltas to px so THRESHOLD is meaningful across line/page modes.
    const norm = (d: number, mode: number, page: number) =>
      mode === 1 ? d * LINE : mode === 2 ? d * page : d;

    const onWheel = (e: WheelEvent) => {
      if (!enabledRef.current) return;
      const dx = norm(e.deltaX, e.deltaMode, el.clientWidth || 1);
      const dy = norm(e.deltaY, e.deltaMode, el.clientHeight || 1);

      // Vertical-dominant: let the grid's scroller have it, untouched.
      if (Math.abs(dx) <= Math.abs(dy)) return;
      // Cede to an inner horizontal scroller if one ever exists (none today).
      const sel = ignoreRef.current;
      if (sel && (e.target as Element).closest(sel)) return;

      // Ours — block the browser's horizontal history swipe (every event).
      e.preventDefault();

      const now = e.timeStamp;
      // Drop stale accumulation after a pause or a direction reversal.
      if (now - lastTs > RESET_GAP || (accumX !== 0 && Math.sign(dx) !== Math.sign(accumX))) {
        accumX = 0;
      }
      lastTs = now;

      // During the slide, discard input — the animation is the cooldown.
      if (isBusyRef.current?.()) {
        accumX = 0;
        return;
      }
      // Rate-limit, independent of React's transitioning state settling.
      if (now - lastFire < MIN_INTERVAL) return;

      accumX += dx;
      if (Math.abs(accumX) >= THRESHOLD) {
        onPageRef.current(accumX > 0 ? 1 : -1);
        lastFire = now;
        accumX = 0;
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [targetRef]);
}
