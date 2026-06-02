"use client";

import { forwardRef } from "react";
import { formatTime } from "@/lib/datetime/format";
import { cn } from "@/lib/utils";
import { toPaletteColor, toPaletteInk } from "@/lib/theme/appearance";
import { ItemMenuButton, type MenuableProps } from "@/components/shared/item-context-menu";
import type { Occurrence } from "@/lib/types";

/**
 * The translucent labelled backdrop for a "context" time-block in the week/day
 * grid. It sits BEHIND the packed event blocks (z-0) and spans the full column
 * width over its time range, so any event overlapping it reads as "inside" it.
 *
 * Pointer interaction (select / move / resize) is delegated to TimeGrid through
 * the `data-occ-key` / `data-resize` attributes, exactly like EventBlock. The
 * large fill body is `pointer-events-none` so pressing empty space inside a
 * context still creates a child event (or scrolls); only the label "handle" and
 * the thin top/bottom edges are interactive — that's where you grab to move or
 * resize the context itself.
 *
 * Forwards ref + props onto the root so it can be a desktop ContextMenu trigger
 * (`asChild`); `onMenu` adds the mobile ⋮ affordance on the label handle.
 */
export const ContextBackdrop = forwardRef<
  HTMLDivElement,
  {
    occ: Occurrence;
    color: string;
    style: React.CSSProperties;
    selected: boolean;
    /** Day view (one wide column) keeps the time range even on phones; the
        narrow multi-column week/3day grids drop it below md to save space. */
    singleColumn?: boolean;
    /** false = another member's context: no move/resize (view-only overlay) */
    editable?: boolean;
  } & MenuableProps &
    React.HTMLAttributes<HTMLDivElement>
>(function ContextBackdrop(
  { occ, color, style, selected, singleColumn, editable = true, onMenu, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      data-occ-key={occ.key}
      style={{
        ...style,
        // A clearly framed, translucent container: solid border in the context
        // color + a faint fill, so its events visibly sit inside the zone.
        backgroundColor: `color-mix(in srgb, ${toPaletteColor(color)} 10%, transparent)`,
        border: `1.5px solid ${toPaletteColor(color)}`,
      }}
      className={cn(
        "pointer-events-none absolute z-0 overflow-hidden rounded-lg",
        selected && "ring-2 ring-foreground ring-offset-1",
        occ.inactive && "opacity-55 grayscale",
        className,
      )}
      {...rest}
    >
      {/* Resize handles (thin, interactive) at the very top/bottom edges —
          omitted for another member's read-only context. */}
      {editable && (
        <>
          <span
            data-resize="start"
            className="pointer-events-auto absolute inset-x-0 top-0 z-20 h-1.5 cursor-ns-resize"
          />
          <span
            data-resize="end"
            className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 h-1.5 cursor-ns-resize"
          />
        </>
      )}

      {/* Title bar: full-width header that makes the zone read as a labelled
          container, and doubles as the move / menu handle. */}
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-1 px-1.5 py-0.5 text-left text-[11px] font-semibold leading-tight select-none",
          editable ? "cursor-grab" : "cursor-pointer",
        )}
        style={{ backgroundColor: toPaletteColor(color), color: toPaletteInk(color) }}
      >
        <span className="truncate">{occ.title}</span>
        {/* Drop the time range on phones (< md) in the narrow week/3day grids
            to give the name room; day view's one wide column keeps it. */}
        <span
          className={cn(
            "shrink-0 font-normal opacity-90 tabular-nums",
            !singleColumn && "hidden md:inline",
          )}
        >
          {formatTime(occ.start)}–{formatTime(occ.end)}
        </span>
        {onMenu && (
          <ItemMenuButton
            onMenu={onMenu}
            className="-mr-0.5 ml-auto text-white/90 hover:text-white"
          />
        )}
      </div>
    </div>
  );
});
