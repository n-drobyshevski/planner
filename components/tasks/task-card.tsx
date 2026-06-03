"use client";

import { forwardRef } from "react";
import { isBefore, startOfDay } from "date-fns";
import { formatDayMonth } from "@/lib/datetime/format";
import { CalendarClock, Flag, GripVertical, Lock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toPaletteColor, toPaletteInk } from "@/lib/theme/appearance";
import { ItemMenuButton, type MenuableProps } from "@/components/shared/item-context-menu";
import { useUiStore } from "@/stores/ui-store";
import type { Member, TaskRow } from "@/lib/types";

const PRIORITY: Record<number, { label: string; variant: "destructive" | "secondary" | "outline" }> = {
  3: { label: "High", variant: "destructive" },
  2: { label: "Medium", variant: "secondary" },
  1: { label: "Low", variant: "outline" },
};

export interface TaskCardProps {
  task: TaskRow;
  color: string;
  assignee: Member | null;
  /** done/total of this task's subtasks, if any */
  progress?: { done: number; total: number } | null;
  /** sequential subtask waiting on a predecessor */
  blocked?: boolean;
  onToggleDone: () => void;
  onOpen: () => void;
  dragging?: boolean;
  showHandle?: boolean;
  style?: React.CSSProperties;
  /** dnd-kit attributes + listeners, spread on the root when sortable */
  dragProps?: Record<string, unknown>;
  className?: string;
}

export const TaskCard = forwardRef<
  HTMLDivElement,
  TaskCardProps & MenuableProps & React.HTMLAttributes<HTMLDivElement>
>(function TaskCard(
  {
    task,
    color,
    assignee,
    progress,
    blocked,
    onToggleDone,
    onOpen,
    dragging,
    showHandle,
    style,
    dragProps,
    className,
    onMenu,
    ...rest
  },
  ref,
) {
  const done = task.status === "done";
  const maskTitles = useUiStore((s) => s.maskTitles);
  const overdue =
    task.dueAt != null && !done && isBefore(task.dueAt, startOfDay(new Date()));
  const prio = task.priority ? PRIORITY[task.priority] : undefined;

  return (
    <div
      ref={ref}
      style={{ ...style, borderInlineStartColor: toPaletteColor(color) }}
      onClick={onOpen}
      className={cn(
        "group/card relative flex gap-2.5 rounded-md border border-l-4 bg-card p-2.5 text-left shadow-soft",
        "cursor-pointer transition-shadow hover:shadow-soft-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        dragging && "opacity-50",
        className,
      )}
      {...dragProps}
      {...rest}
    >
      {showHandle && (
        <GripVertical
          aria-hidden
          className="mt-0.5 size-4 shrink-0 cursor-grab text-muted-foreground/50 group-hover/card:text-muted-foreground"
        />
      )}

      <span
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="mt-0.5"
      >
        <Checkbox
          checked={done}
          onCheckedChange={onToggleDone}
          aria-label={done ? "Mark as not done" : "Mark as done"}
        />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span
          className={cn(
            "text-sm leading-snug font-medium",
            done && "text-muted-foreground line-through",
            maskTitles && "blur-[5px] select-none",
          )}
        >
          {task.title}
        </span>

        {(task.dueAt != null || prio || progress?.total || blocked || task.isPrivate) && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {blocked && (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <Lock /> Blocked
              </Badge>
            )}
            {task.isPrivate && (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <Lock /> Private
              </Badge>
            )}
            {task.dueAt != null && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 tabular-nums",
                  overdue && "font-medium text-destructive",
                )}
              >
                <CalendarClock className="size-3.5" />
                {formatDayMonth(task.dueAt)}
              </span>
            )}
            {prio && (
              <Badge variant={prio.variant} className="gap-1">
                <Flag /> {prio.label}
              </Badge>
            )}
            {progress?.total ? (
              <span className="tabular-nums">
                {progress.done}/{progress.total}
              </span>
            ) : null}
          </div>
        )}
      </div>

      {assignee && (
        <Avatar className="size-6 shrink-0" title={assignee.name}>
          <AvatarFallback
            style={{ backgroundColor: toPaletteColor(assignee.color), color: toPaletteInk(assignee.color) }}
            className="text-[10px] font-semibold"
          >
            {assignee.name.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}

      {onMenu && (
        <ItemMenuButton
          onMenu={onMenu}
          className="mt-0.5 text-muted-foreground hover:text-foreground"
        />
      )}
    </div>
  );
});
