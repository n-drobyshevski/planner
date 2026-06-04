"use client";

import { forwardRef } from "react";
import { formatTime } from "@/lib/datetime/format";
import { useViewerTimeZone } from "@/lib/datetime/timezone-context";
import { CheckCircle2, Circle, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { ItemMenuButton, type MenuableProps } from "@/components/shared/item-context-menu";
import { eventStatusClass, eventFillStyle } from "@/lib/theme/appearance";
import { useUiStore } from "@/stores/ui-store";
import type { Occurrence } from "@/lib/types";

/**
 * A timed event in the week/day grid. Presentational + drag affordances only —
 * all pointer interaction (move / resize / select) is delegated to TimeGrid via
 * the data attributes below. Blocks that belong to a task get a check-circle
 * that toggles the task done (its pointer events are stopped so the grid drag
 * never starts from the toggle).
 *
 * Forwards ref + extra props onto the root so it can act as a ContextMenu
 * trigger (`asChild`) on desktop; `onMenu` adds the ⋮ affordance on mobile.
 */
export const EventBlock = forwardRef<
  HTMLDivElement,
  {
    occ: Occurrence;
    color: string;
    style: React.CSSProperties;
    selected: boolean;
    /** false = another member's item: no drag/resize/toggle (view-only overlay) */
    editable?: boolean;
    taskDone?: boolean;
    onToggleTaskDone?: () => void;
    /**
     * When this event double-books against another, the pixel range (relative
     * to this block's top) over which to draw the whisper "clash" seam. null /
     * undefined = no overlap. The seam is currentColor-inset so it inherits the
     * block's own legible ink-vs-fill contrast on both filled and outlined fills.
     */
    clash?: { topPx: number; heightPx: number } | null;
    /** Keyboard / assistive-tech activation (Enter or Space): open this event's
     *  details. The pointer "click to open" is handled by TimeGrid; this is the
     *  keyboard equivalent so a focused block is operable without a mouse. */
    onActivate?: () => void;
  } & MenuableProps &
    React.HTMLAttributes<HTMLDivElement>
>(function EventBlock(
  { occ, color, style, selected, editable = true, taskDone, onToggleTaskDone, clash, onActivate, onMenu, className, ...rest },
  ref,
) {
  const timeZone = useViewerTimeZone();
  const maskTitles = useUiStore((s) => s.maskTitles);
  const isTask = occ.taskId != null && onToggleTaskDone != null;
  // Another member's read-only overlay (`!editable`) renders OUTLINED so it
  // reads as "not mine, look don't touch"; my own and shared/joint events stay
  // solid-FILLED. See eventFillStyle.
  const fill = eventFillStyle(color, !editable);
  // Accessible name read aloud on focus, e.g. "Dinner, 18:30 to 20:00, shared".
  const a11yLabel = [
    occ.title || "Untitled event",
    `${formatTime(occ.start, timeZone)} to ${formatTime(occ.end, timeZone)}`,
    occ.isShared ? "shared" : null,
    !editable ? "another member's, read-only" : null,
    occ.status === "cancelled" ? "cancelled" : occ.status === "planned" ? "planned" : null,
    isTask ? (taskDone ? "task, done" : "task") : null,
  ]
    .filter(Boolean)
    .join(", ");
  // Enter/Space open the block (Delete is handled centrally by the grid's window
  // listener so it never races a multi-selection delete). Ignore keys bubbling
  // from inner controls (the task toggle / ⋮ menu handle their own).
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate?.();
    }
  }
  return (
    <div
      ref={ref}
      data-occ-key={occ.key}
      role="button"
      tabIndex={0}
      aria-label={a11yLabel}
      onKeyDown={onKeyDown}
      style={{ ...style, ...fill }}
      className={cn(
        // z-index comes from --evt-z (the cascade order set by day-column);
        // hovering or selecting an event raises it above the stack so a covered
        // block is revealed in full — a pure z change, no layout shift.
        "absolute z-[var(--evt-z,10)] flex touch-none flex-col overflow-hidden rounded-md border-[1.5px] px-1.5 py-1 text-left text-xs shadow-soft select-none hover:z-30",
        // Keyboard focus ring (foreground ink contrasts every fill, matching the
        // selection ring) so a Tab-focused block is always visible.
        "outline-none focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-foreground",
        editable ? "cursor-grab" : "cursor-pointer",
        selected && "z-30 ring-2 ring-foreground",
        occ.inactive && "evt-inactive",
        eventStatusClass(occ.status),
        className,
      )}
      {...rest}
    >
      <div className="flex items-start gap-1">
        {isTask &&
          (editable ? (
            <button
              type="button"
              aria-label={taskDone ? "Mark task not done" : "Mark task done"}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onToggleTaskDone?.();
              }}
              className="mt-px shrink-0 cursor-pointer text-current opacity-90 hover:opacity-100"
            >
              {taskDone ? (
                <CheckCircle2 className="size-3.5" />
              ) : (
                <Circle className="size-3.5" />
              )}
            </button>
          ) : (
            <span className="mt-px shrink-0 text-current opacity-90" aria-hidden>
              {taskDone ? (
                <CheckCircle2 className="size-3.5" />
              ) : (
                <Circle className="size-3.5" />
              )}
            </span>
          ))}
        <span
          className={cn(
            "truncate font-semibold leading-tight",
            taskDone && "line-through opacity-80",
            occ.status === "cancelled" && "line-through",
            maskTitles && "blur-[5px] select-none",
          )}
        >
          {occ.title}
        </span>
        {occ.isShared && (
          <Users className="mt-px size-3 shrink-0 opacity-90" aria-label="Shared" />
        )}
        {onMenu && (
          <ItemMenuButton
            onMenu={onMenu}
            className="-mr-0.5 ml-auto text-current opacity-90 hover:opacity-100"
          />
        )}
      </div>
      <span className="truncate text-[11px] leading-tight opacity-90 tabular-nums">
        {formatTime(occ.start, timeZone)}–{formatTime(occ.end, timeZone)}
      </span>
      {clash && (
        <>
          {/* Whisper clash seam: a hairline down the leading edge over exactly
              the overlap range, marking a double-booking without a banner. */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-[2px] w-[2px] rounded-full bg-current"
            style={{
              top: clash.topPx,
              height: Math.max(clash.heightPx, 4),
              // 1px paper sliver to the left detaches the seam from the block's
              // own border, so it stays legible even on outlined (partner's)
              // blocks where currentColor equals the border color.
              boxShadow: "-1px 0 0 0 var(--background)",
            }}
          />
          <span className="sr-only">, overlaps another event</span>
        </>
      )}
      {editable && (
        <>
          <span
            data-resize="start"
            className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize"
          />
          <span
            data-resize="end"
            className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
          />
        </>
      )}
    </div>
  );
});
