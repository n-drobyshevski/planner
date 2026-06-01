"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";
import { useDragPager } from "@/hooks/use-drag-pager";

export interface CalendarPagerHandle {
  /** Animate to the next (+1) / previous (-1) period, then commit. */
  page: (dir: -1 | 1) => void;
}

interface Props {
  /** The centred, interactive pane. */
  children: React.ReactNode;
  /** Display-only neighbour panes (mounted only while paging). */
  prev: React.ReactNode;
  next: React.ReactNode;
  /** Apply the page change (e.g. advance the focused date). */
  onCommit: (dir: -1 | 1) => void;
  enabled?: boolean;
  /** Selector for elements whose gestures are event-drags, not page swipes. */
  ignoreSelector?: string;
}

const DURATION = 240; // ms slide
const COMMIT_FRACTION = 0.25; // drag past 25% of the viewport to commit
const CENTER = "translateX(-100%)";

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** The scrollable element inside a pane (time-grid ScrollArea or agenda list). */
function findScroller(el: HTMLElement | null): HTMLElement | null {
  return (
    el?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"], .overflow-y-auto',
    ) ?? null
  );
}

/** translateX with a px delta from the centred baseline, calc-safe for any sign. */
function offsetTransform(dx: number): string {
  return dx < 0
    ? `translateX(calc(-100% - ${-dx}px))`
    : `translateX(calc(-100% + ${dx}px))`;
}

/**
 * A recycled three-pane carousel — [prev | current | next] on a track that
 * starts centred (`translateX(-100%)`). A horizontal finger-drag translates the
 * track live; on release it snaps to a neighbour (commit) or springs back. Only
 * the centre pane is interactive; neighbours are display-only and mount just for
 * the transition. On commit we swap the focused period and reset the transform
 * in one synchronous paint (the old neighbour already shows the committed
 * content, so there's no flash).
 */
export const CalendarPager = React.forwardRef<CalendarPagerHandle, Props>(
  function CalendarPager(
    { children, prev, next, onCommit, enabled = true, ignoreSelector },
    ref,
  ) {
    const viewportRef = React.useRef<HTMLDivElement>(null);
    const trackRef = React.useRef<HTMLDivElement>(null);
    const curRef = React.useRef<HTMLDivElement>(null);
    const prevRef = React.useRef<HTMLDivElement>(null);
    const nextRef = React.useRef<HTMLDivElement>(null);

    const [neighborsOn, setNeighborsOn] = React.useState(false);
    const [transitioning, setTransitioning] = React.useState(false);
    const [transform, setTransform] = React.useState(CENTER);
    const pendingCommit = React.useRef<-1 | 0 | 1>(0); // 0 = spring back
    const settleTimer = React.useRef<number | undefined>(undefined);

    // Mirror the centre pane's scroll position onto the neighbours the moment
    // they mount, so a time-grid scrolled to 9am pages to a neighbour also at
    // 9am instead of jumping to midnight mid-slide.
    React.useLayoutEffect(() => {
      if (!neighborsOn) return;
      const top = findScroller(curRef.current)?.scrollTop ?? 0;
      for (const el of [prevRef.current, nextRef.current]) {
        const s = findScroller(el);
        if (s) s.scrollTop = top;
      }
    }, [neighborsOn]);

    const finalize = React.useCallback(() => {
      window.clearTimeout(settleTimer.current);
      const dir = pendingCommit.current;
      pendingCommit.current = 0;
      if (dir === 0) {
        setTransitioning(false);
        setNeighborsOn(false);
        return;
      }
      // Swap the period and snap the track back to centre in one paint: the
      // committed neighbour and the freshly-focused centre show the same pixels,
      // so disabling the transition here hides the swap.
      flushSync(() => {
        setTransitioning(false);
        setTransform(CENTER);
        onCommit(dir);
      });
      requestAnimationFrame(() => setNeighborsOn(false));
    }, [onCommit]);

    const startAnim = React.useCallback(
      (target: string, dir: -1 | 0 | 1) => {
        pendingCommit.current = dir;
        setTransitioning(true);
        setTransform(target);
        window.clearTimeout(settleTimer.current);
        // Fallback in case transitionend never fires (e.g. target === current).
        settleTimer.current = window.setTimeout(finalize, DURATION + 80);
      },
      [finalize],
    );

    const onTransitionEnd = React.useCallback(
      (e: React.TransitionEvent) => {
        if (e.target === trackRef.current && e.propertyName === "transform") {
          finalize();
        }
      },
      [finalize],
    );

    const dragHandlers = useDragPager({
      enabled: enabled && !transitioning,
      ignoreSelector,
      onStart: () => setNeighborsOn(true),
      onMove: (dx) => {
        setTransitioning(false);
        setTransform(offsetTransform(dx));
      },
      onEnd: (dx) => {
        const w = viewportRef.current?.clientWidth ?? 1;
        if (dx <= -w * COMMIT_FRACTION) startAnim("translateX(-200%)", 1);
        else if (dx >= w * COMMIT_FRACTION) startAnim("translateX(0%)", -1);
        else startAnim(CENTER, 0);
      },
    });

    React.useImperativeHandle(
      ref,
      () => ({
        page: (dir) => {
          if (transitioning) return;
          if (reducedMotion()) {
            onCommit(dir);
            return;
          }
          setNeighborsOn(true);
          // Let the neighbour mount, sync its scroll, then animate.
          requestAnimationFrame(() => {
            const top = findScroller(curRef.current)?.scrollTop ?? 0;
            const s = findScroller(dir === 1 ? nextRef.current : prevRef.current);
            if (s) s.scrollTop = top;
            startAnim(dir === 1 ? "translateX(-200%)" : "translateX(0%)", dir);
          });
        },
      }),
      [transitioning, onCommit, startAnim],
    );

    React.useEffect(() => () => window.clearTimeout(settleTimer.current), []);

    return (
      <div
        ref={viewportRef}
        className="relative h-full touch-pan-y overflow-hidden"
        {...dragHandlers}
      >
        <div
          ref={trackRef}
          className={cn("flex h-full will-change-transform", transitioning && "ease-out")}
          style={{
            transform,
            transitionProperty: transitioning ? "transform" : "none",
            transitionDuration: transitioning ? `${DURATION}ms` : undefined,
          }}
          onTransitionEnd={onTransitionEnd}
        >
          <div
            ref={prevRef}
            aria-hidden
            className="h-full w-full shrink-0 overflow-hidden [&_*]:pointer-events-none"
          >
            {neighborsOn ? prev : null}
          </div>
          <div ref={curRef} className="h-full w-full shrink-0 overflow-hidden">
            {children}
          </div>
          <div
            ref={nextRef}
            aria-hidden
            className="h-full w-full shrink-0 overflow-hidden [&_*]:pointer-events-none"
          >
            {neighborsOn ? next : null}
          </div>
        </div>
      </div>
    );
  },
);
