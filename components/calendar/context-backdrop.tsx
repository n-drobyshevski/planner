"use client";

import { forwardRef } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
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
  } & MenuableProps &
    React.HTMLAttributes<HTMLDivElement>
>(function ContextBackdrop({ occ, color, style, selected, onMenu, ...rest }, ref) {
  return (
    <div
      ref={ref}
      data-occ-key={occ.key}
      style={{
        ...style,
        // Translucent fill + a framed border (solid left accent) so the zone
        // reads as a container its children sit inside, not a solid event.
        // color-mix keeps it tinted in light & dark themes.
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
        borderLeft: `3px solid ${color}`,
      }}
      className={cn(
        "pointer-events-none absolute z-0 overflow-hidden rounded-lg",
        selected && "ring-2 ring-foreground",
      )}
      {...rest}
    >
      {/* Resize handles (thin, interactive) at the very top/bottom edges. */}
      <span
        data-resize="start"
        className="pointer-events-auto absolute inset-x-0 top-0 h-1.5 cursor-ns-resize"
      />
      <span
        data-resize="end"
        className="pointer-events-auto absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
      />

      {/* Label handle: grab here to move / select the context. */}
      <div
        className="pointer-events-auto flex max-w-full cursor-grab items-center gap-1 self-start rounded-br-lg rounded-tl-md px-1.5 py-0.5 text-left text-[11px] font-semibold leading-tight select-none"
        style={{ backgroundColor: color, color: "white" }}
      >
        <span className="truncate">{occ.title}</span>
        <span className="shrink-0 font-normal opacity-90 tabular-nums">
          {format(occ.start, "h:mm")}–{format(occ.end, "h:mm a")}
        </span>
        {onMenu && (
          <ItemMenuButton
            onMenu={onMenu}
            className="-mr-0.5 ml-0.5 text-white/90 hover:text-white"
          />
        )}
      </div>
    </div>
  );
});
