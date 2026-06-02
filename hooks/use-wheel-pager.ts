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

const THRESHOLD = 40; // px of accumulated |deltaX| before a gesture pages
const RESET_GAP = 220; // ms of wheel silence that ends a gesture and re-arms

/**
 * The desktop counterpart to `useDragPager`: a two-finger horizontal trackpad
 * swipe (or Shift+wheel) pages the carousel, reusing the same animation. A
 * NATIVE non-passive `wheel` listener is required — React registers `onWheel`
 * passively, so its `preventDefault` is ignored, and we must `preventDefault`
 * horizontal events to suppress the browser's history back/forward swipe.
 *
 * Only horizontal-dominant events are claimed; vertical scrolling flows through
 * to the time grid untouched. One page fires per momentum gesture: a `fired`
 * latch holds until `RESET_GAP` ms of silence marks the gesture's end.
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
    let fired = false;
    let lastTs = 0;

    const onWheel = (e: WheelEvent) => {
      if (!enabledRef.current) return;
      // Mid-slide: swallow the event (kill history-nav) but never page.
      if (isBusyRef.current?.()) {
        e.preventDefault();
        lastTs = e.timeStamp;
        return;
      }
      // A gap in the wheel stream marks a fresh gesture.
      if (e.timeStamp - lastTs > RESET_GAP) {
        accumX = 0;
        fired = false;
      }
      lastTs = e.timeStamp;

      // Vertical-dominant: let the grid's scroller have it, untouched.
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      // Cede to an inner horizontal scroller if one ever exists (none today).
      const sel = ignoreRef.current;
      if (sel && (e.target as Element).closest(sel)) return;

      // Ours — block the browser's horizontal history swipe for the whole
      // gesture, including the momentum tail.
      e.preventDefault();
      if (fired) return;

      accumX += e.deltaX;
      if (Math.abs(accumX) >= THRESHOLD) {
        fired = true;
        onPageRef.current(accumX > 0 ? 1 : -1);
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [targetRef]);
}
