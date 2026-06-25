"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Side = "left" | "right";

const DEFAULTS: Record<Side, number> = { left: 240, right: 256 };
const MIN = 200;
const MAX = 480;
/** Keyboard resize increment (Arrow keys). */
const STEP = 16;

const clamp = (n: number) => Math.min(MAX, Math.max(MIN, Math.round(n)));

/**
 * Drag-to-resize width for a desktop sidebar, remembered per device + per user
 * via localStorage (the user id in the key separates profiles sharing a
 * device). The settled width is persisted on pointer-up, not on every move.
 *
 * State starts at the server-rendered default and is reconciled from
 * localStorage in a mount effect, so there's no hydration mismatch.
 */
export function useSidebarWidth(side: Side, userKey: string | undefined) {
  const key = `planner:sidebarWidth:${side}:${userKey || "anon"}`;
  const [width, setWidth] = React.useState(DEFAULTS[side]);
  // True while a pointer-drag resize is in flight, so the panel can suppress its
  // open/close width transition (otherwise the drag rubber-bands).
  const [resizing, setResizing] = React.useState(false);
  // Mirrors the latest width for the resize handlers + persist-on-release,
  // without reading the ref during render.
  const widthRef = React.useRef(DEFAULTS[side]);

  const apply = React.useCallback((next: number) => {
    widthRef.current = next;
    setWidth(next);
  }, []);

  React.useEffect(() => {
    const raw = window.localStorage.getItem(key);
    const n = raw ? Number.parseInt(raw, 10) : NaN;
    if (!Number.isNaN(n)) apply(clamp(n));
  }, [key, apply]);

  const beginResize = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = widthRef.current;
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        apply(clamp(side === "left" ? startWidth + dx : startWidth - dx));
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setResizing(false);
        window.localStorage.setItem(key, String(widthRef.current));
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      setResizing(true);
    },
    [key, side, apply],
  );

  /**
   * Keyboard resize: nudge by a pixel delta, or jump to a bound. Clamps and
   * persists immediately (keyboard has no pointer-up to settle on).
   */
  const nudge = React.useCallback(
    (deltaPx: number, toBound?: "min" | "max") => {
      const base =
        toBound === "min" ? MIN : toBound === "max" ? MAX : widthRef.current + deltaPx;
      const next = clamp(base);
      apply(next);
      window.localStorage.setItem(key, String(next));
    },
    [key, apply],
  );

  return { width, beginResize, nudge, resizing };
}

/**
 * Thin drag affordance hugging a sidebar's inner edge. The parent aside must be
 * `relative`; lives inside the `hidden md:flex` rails so it is desktop-only.
 *
 * The visible mark is a 1px hairline (shown on hover/focus), but the grab zone is
 * wider (~12px) so it's easy to catch. Keyboard-operable as an ARIA separator:
 * Arrow keys resize by a step (in the panel's grow/shrink direction), Home/End
 * jump to the min/max width.
 */
export function SidebarResizeHandle({
  side,
  width,
  onPointerDown,
  onNudge,
}: {
  side: Side;
  width: number;
  onPointerDown: (e: React.PointerEvent) => void;
  onNudge: (deltaPx: number, toBound?: "min" | "max") => void;
}) {
  const grow = side === "left" ? "ArrowRight" : "ArrowLeft";
  const shrink = side === "left" ? "ArrowLeft" : "ArrowRight";
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={Math.round(width)}
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        if (e.key === grow) {
          e.preventDefault();
          onNudge(STEP);
        } else if (e.key === shrink) {
          e.preventDefault();
          onNudge(-STEP);
        } else if (e.key === "Home") {
          e.preventDefault();
          onNudge(0, "min");
        } else if (e.key === "End") {
          e.preventDefault();
          onNudge(0, "max");
        }
      }}
      className={cn(
        // 10px grab zone hugging the inner edge (over the panel's own padding, so
        // it never covers interactive content); the visible mark stays a 1px line.
        "absolute inset-y-0 z-10 w-2.5 cursor-col-resize touch-none outline-none",
        "after:absolute after:inset-y-0 after:w-px after:bg-transparent after:transition-colors after:duration-150",
        "hover:after:bg-border focus-visible:after:bg-ring motion-reduce:after:transition-none",
        side === "left" ? "right-0 after:right-0" : "left-0 after:left-0",
      )}
    />
  );
}
