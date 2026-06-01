"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Side = "left" | "right";

const DEFAULTS: Record<Side, number> = { left: 240, right: 256 };
const MIN = 200;
const MAX = 480;

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
        window.localStorage.setItem(key, String(widthRef.current));
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [key, side, apply],
  );

  return { width, beginResize };
}

/**
 * Thin drag affordance hugging a sidebar's inner edge. The parent aside must be
 * `relative`; lives inside the `hidden md:flex` rails so it is desktop-only.
 */
export function SidebarResizeHandle({
  side,
  onPointerDown,
}: {
  side: Side;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      onPointerDown={onPointerDown}
      className={cn(
        "absolute inset-y-0 z-10 w-1.5 cursor-col-resize touch-none",
        "after:absolute after:inset-y-0 after:w-px after:bg-transparent hover:after:bg-border",
        side === "left" ? "right-0 after:right-0" : "left-0 after:left-0",
      )}
    />
  );
}
