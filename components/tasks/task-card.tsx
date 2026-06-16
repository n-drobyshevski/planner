"use client";

import { forwardRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatDayMonthToken } from "@/lib/datetime/format";
import { isDateTokenPast } from "@/lib/datetime/local";
import { useViewerTimeZone } from "@/lib/datetime/timezone-context";
import { CalendarClock, CalendarX2, Flag, GripVertical, Lock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toPaletteColor, toPaletteInk } from "@/lib/theme/appearance";
import { ItemMenuButton, type MenuableProps } from "@/components/shared/item-context-menu";
import { useUiStore } from "@/stores/ui-store";
import type { Member, TaskRow } from "@/lib/types";

export const PRIORITY: Record<number, { labelKey: string; variant: "destructive" | "secondary" | "outline" }> = {
  3: { labelKey: "priority.high", variant: "destructive" },
  2: { labelKey: "priority.medium", variant: "secondary" },
  1: { labelKey: "priority.low", variant: "outline" },
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
  const t = useTranslations("tasks");
  const locale = useLocale();
  const done = task.completedAt != null;
  const maskTitles = useUiStore((s) => s.maskTitles);
  const timeZone = useViewerTimeZone();
  const overdue =
    task.dueDate != null && !done && isDateTokenPast(task.dueDate, timeZone);
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
          aria-label={done ? t("card.markNotDone") : t("card.markDone")}
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

        {(task.dueDate != null || prio || progress?.total || blocked || task.isPrivate) && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {blocked && (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <Lock /> {t("card.blocked")}
              </Badge>
            )}
            {task.isPrivate && (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <Lock /> {t("card.private")}
              </Badge>
            )}
            {task.dueDate != null && (
              <span
                title={overdue ? t("card.overdue") : undefined}
                className={cn(
                  "inline-flex items-center gap-1 tabular-nums",
                  overdue && "font-medium text-destructive",
                )}
              >
                {/* Overdue is signalled by glyph + weight + colour (not colour
                    alone): a struck calendar icon and screen-reader text. */}
                {overdue ? (
                  <CalendarX2 className="size-3.5" />
                ) : (
                  <CalendarClock className="size-3.5" />
                )}
                {formatDayMonthToken(task.dueDate, locale)}
                {overdue && <span className="sr-only">{t("card.overdueSuffix")}</span>}
              </span>
            )}
            {prio && (
              <Badge variant={prio.variant} className="gap-1">
                <Flag /> {t(prio.labelKey)}
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
