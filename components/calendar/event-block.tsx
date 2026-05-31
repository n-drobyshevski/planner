"use client";

import { format } from "date-fns";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Occurrence } from "@/lib/types";

/**
 * A timed event in the week/day grid. Presentational + drag affordances only —
 * all pointer interaction (move / resize / select) is delegated to TimeGrid via
 * the data attributes below. Blocks that belong to a task get a check-circle
 * that toggles the task done (its pointer events are stopped so the grid drag
 * never starts from the toggle).
 */
export function EventBlock({
  occ,
  color,
  style,
  selected,
  taskDone,
  onToggleTaskDone,
}: {
  occ: Occurrence;
  color: string;
  style: React.CSSProperties;
  selected: boolean;
  taskDone?: boolean;
  onToggleTaskDone?: () => void;
}) {
  const isTask = occ.taskId != null && onToggleTaskDone != null;
  return (
    <div
      data-occ-key={occ.key}
      style={{ ...style, backgroundColor: color }}
      className={cn(
        "absolute z-10 flex cursor-grab touch-none flex-col overflow-hidden rounded-md px-1.5 py-1 text-left text-xs text-white shadow-soft select-none",
        selected && "z-20 ring-2 ring-foreground",
      )}
    >
      <div className="flex items-start gap-1">
        {isTask && (
          <button
            type="button"
            aria-label={taskDone ? "Mark task not done" : "Mark task done"}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleTaskDone?.();
            }}
            className="mt-px shrink-0 cursor-pointer text-white/90 hover:text-white"
          >
            {taskDone ? (
              <CheckCircle2 className="size-3.5" />
            ) : (
              <Circle className="size-3.5" />
            )}
          </button>
        )}
        <span
          className={cn(
            "truncate font-semibold leading-tight",
            taskDone && "line-through opacity-80",
          )}
        >
          {occ.title}
        </span>
      </div>
      <span className="truncate text-[11px] leading-tight opacity-90 tabular-nums">
        {format(occ.start, "h:mm")}–{format(occ.end, "h:mm a")}
      </span>
      <span
        data-resize="start"
        className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize"
      />
      <span
        data-resize="end"
        className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
      />
    </div>
  );
}
