"use client";

import {
  CalendarClock,
  CalendarX2,
  CheckCircle2,
  Circle,
  Flag,
  Lock,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { useTranslations, useLocale } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { ColorSwatchPicker } from "@/components/shared/color-swatch-picker";
import { cn } from "@/lib/utils";
import {
  formatDayMonth,
  formatDayMonthToken,
  formatTime,
} from "@/lib/datetime/format";
import { isDateTokenPast } from "@/lib/datetime/local";
import { useViewerTimeZone } from "@/lib/datetime/timezone-context";
import { toPaletteColor } from "@/lib/theme/appearance";
import type { Board, EventRow, TaskRow } from "@/lib/types";
import { PRIORITY } from "./task-card";

interface TaskDetailsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskRow;
  /** resolved display color (per-item / category / owner) */
  color: string;
  /** the assignee's (or owner's) member identity color, for the "whose" dot */
  assigneeColor?: string | null;
  /** assignee display name; null when unassigned */
  assigneeName?: string | null;
  /** owner name, surfaced only when it differs from the assignee */
  ownerName: string;
  categoryName?: string | null;
  categoryColor?: string | null;
  /** the current board column's name (the task's state); null when none */
  boardName?: string | null;
  /** the collection's columns, for the "Move to column" quick action */
  boards: Board[];
  /** the viewer owns this task (can edit); otherwise read-only */
  isOwn: boolean;
  done: boolean;
  /** a sequential predecessor or an unmet dependency is holding this task */
  blocked?: boolean;
  /** done/total of this task's whole subtree, if any */
  progress?: { done: number; total: number } | null;
  /** direct children, for the inset list */
  subtasks: TaskRow[];
  subtaskColorOf: (t: TaskRow) => string;
  /** the tasks this one is blocked by (unmet or not) */
  blockedBy: TaskRow[];
  /** linked calendar blocks ("parts" of the task scheduled on the grid) */
  scheduledBlocks: EventRow[];
  onEdit: () => void;
  onDelete: () => void;
  onToggleDone: () => void;
  onSchedule: () => void;
  onAddSubtask: () => void;
  onChangeColor: (color: string | null) => void;
  onChangePriority: (priority: number | null) => void;
  onMoveToBoard: (boardId: string) => void;
  onOpenSubtask: (id: string) => void;
  onToggleSubtaskDone: (t: TaskRow) => void;
}

/**
 * Read-only summary card for a clicked task (dialog on desktop, bottom sheet on
 * mobile) — the tasks-surface twin of {@link EventDetails}. The header is the
 * headline (title + state badges); the body leads with the column/state and due
 * date as the focal point, then a quiet meta line (assignee · category · owner),
 * subtask progress + an inset list, blockers, scheduled blocks, and notes. Your
 * own tasks get Edit / Delete plus a "More" menu (schedule, add subtask, color,
 * priority, move column, done); another member's task is view-only. Edit/Delete
 * defer to the shell's existing flows (the full editor, the delete confirm).
 */
export function TaskDetails({
  open,
  onOpenChange,
  task,
  color,
  assigneeColor,
  assigneeName,
  ownerName,
  categoryName,
  categoryColor,
  boardName,
  boards,
  isOwn,
  done,
  blocked,
  progress,
  subtasks,
  subtaskColorOf,
  blockedBy,
  scheduledBlocks,
  onEdit,
  onDelete,
  onToggleDone,
  onSchedule,
  onAddSubtask,
  onChangeColor,
  onChangePriority,
  onMoveToBoard,
  onOpenSubtask,
  onToggleSubtaskDone,
}: TaskDetailsProps) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const locale = useLocale();
  const timeZone = useViewerTimeZone();

  const overdue =
    task.dueDate != null && !done && isDateTokenPast(task.dueDate, timeZone);
  const prio = task.priority ? PRIORITY[task.priority] : undefined;
  // Owner is only worth a line when it isn't the assignee (a handed-over task).
  const showOwner = assigneeName != null && ownerName !== assigneeName;

  const hasBadges =
    task.isPrivate || task.isMilestone || done || blocked || !!prio;

  // The soonest scheduled block, for the "Scheduled …" line.
  const nextBlock =
    scheduledBlocks.length > 0
      ? scheduledBlocks.reduce((a, b) => (b.start < a.start ? b : a))
      : null;
  const scheduledWhen = nextBlock
    ? nextBlock.allDay
      ? formatDayMonth(nextBlock.start, timeZone, locale)
      : `${formatDayMonth(nextBlock.start, timeZone, locale)} ${formatTime(
          nextBlock.start,
          timeZone,
        )}`
    : null;

  // Comfortable touch targets on phones (44px), compact on desktop.
  const menuItem = "min-h-11 sm:min-h-7";
  const pct = progress?.total
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-sm">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-start gap-2 text-lg font-semibold">
            <span
              className="mt-1.5 size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: toPaletteColor(color) }}
              aria-hidden
            />
            <span
              className={cn(
                "min-w-0 text-balance",
                done && "text-muted-foreground line-through",
              )}
            >
              {task.title || t("details.untitled")}
            </span>
          </ResponsiveDialogTitle>

          <ResponsiveDialogDescription className="sr-only">
            {boardName ?? t("details.noColumn")}
          </ResponsiveDialogDescription>

          {hasBadges && (
            <div className="mt-0.5 flex flex-wrap gap-1.5">
              {done && (
                <Badge variant="outline" className="text-muted-foreground">
                  {t("status.done")}
                </Badge>
              )}
              {prio && (
                <Badge variant={prio.variant} className="gap-1">
                  <Flag /> {t(prio.labelKey)}
                </Badge>
              )}
              {task.isMilestone && (
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  <Target /> {t("flows.milestone.label")}
                </Badge>
              )}
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
            </div>
          )}
        </ResponsiveDialogHeader>

        <ResponsiveDialogBody>
          <div className="flex flex-col gap-3.5 text-sm">
            {/* State + due — the focal point. */}
            <div className="flex flex-col gap-0.5">
              <span className="text-lg font-semibold leading-tight text-balance">
                {boardName ?? t("details.noColumn")}
              </span>
              {task.dueDate != null ? (
                <span
                  className={cn(
                    "mt-0.5 inline-flex items-center gap-1.5 tabular-nums",
                    overdue
                      ? "font-medium text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {overdue ? (
                    <CalendarX2 className="size-3.5 shrink-0" aria-hidden />
                  ) : (
                    <CalendarClock className="size-3.5 shrink-0" aria-hidden />
                  )}
                  {t("details.due", {
                    date: formatDayMonthToken(task.dueDate, locale),
                  })}
                  {overdue && (
                    <span className="sr-only">{t("card.overdueSuffix")}</span>
                  )}
                </span>
              ) : (
                <span className="mt-0.5 text-muted-foreground">
                  {t("details.noDueDate")}
                </span>
              )}
              {task.startDate != null && (
                <span className="text-muted-foreground tabular-nums">
                  {t("details.starts", {
                    date: formatDayMonthToken(task.startDate, locale),
                  })}
                </span>
              )}
            </div>

            {/* One quiet meta line: assignee · category · owner. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: toPaletteColor(assigneeColor ?? color),
                  }}
                  aria-hidden
                />
                {assigneeName ?? t("taskDialog.unassigned")}
              </span>
              {categoryName && (
                <>
                  <span className="text-muted-foreground" aria-hidden>
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    {categoryColor && (
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: toPaletteColor(categoryColor) }}
                        aria-hidden
                      />
                    )}
                    {categoryName}
                  </span>
                </>
              )}
              {showOwner && (
                <>
                  <span className="text-muted-foreground" aria-hidden>
                    ·
                  </span>
                  <span className="text-muted-foreground">
                    {t("details.by", { name: ownerName })}
                  </span>
                </>
              )}
            </div>

            {/* Subtask progress. */}
            {progress?.total ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t("subtasks.title")}</span>
                  <span className="tabular-nums">
                    {progress.done}/{progress.total}
                  </span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={progress.total}
                  aria-valuenow={progress.done}
                  aria-label={t("subtasks.progressLabel", {
                    done: progress.done,
                    total: progress.total,
                  })}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out-quint"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            ) : null}

            {/* Direct subtasks — checkable, each opens its own details. */}
            {subtasks.length > 0 && (
              <ul className="flex flex-col gap-1 rounded-lg bg-muted/40 p-1.5">
                {subtasks.map((st) => {
                  const stDone = st.completedAt != null;
                  return (
                    <li key={st.id} className="flex items-center gap-2">
                      <span
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0"
                      >
                        <Checkbox
                          checked={stDone}
                          onCheckedChange={() => onToggleSubtaskDone(st)}
                          aria-label={
                            stDone
                              ? t("subtasks.markNotDone")
                              : t("subtasks.markDone")
                          }
                        />
                      </span>
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: toPaletteColor(subtaskColorOf(st)) }}
                        aria-hidden
                      />
                      <button
                        type="button"
                        onClick={() => onOpenSubtask(st.id)}
                        className={cn(
                          "min-w-0 flex-1 truncate rounded-sm py-1 text-left underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none",
                          stDone && "text-muted-foreground line-through",
                        )}
                      >
                        {st.title}
                      </button>
                      {st.dueDate != null && (
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {formatDayMonthToken(st.dueDate, locale)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Blocked by other tasks. */}
            {blockedBy.length > 0 && (
              <div className="flex items-start gap-2">
                <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <span className="text-muted-foreground">
                    {t("dependencies.blockedByLabel")}:
                  </span>{" "}
                  {blockedBy.map((b, i) => (
                    <span key={b.id}>
                      {i > 0 && ", "}
                      {b.title || t("dependencies.unknownTask")}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Scheduled on the calendar. */}
            {scheduledWhen && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarClock className="size-4 shrink-0" aria-hidden />
                <span className="tabular-nums">
                  {t("details.scheduledAt", { when: scheduledWhen })}
                  {scheduledBlocks.length > 1 && ` +${scheduledBlocks.length - 1}`}
                </span>
              </div>
            )}

            {task.description && (
              <p className="whitespace-pre-wrap">{task.description}</p>
            )}
          </div>
        </ResponsiveDialogBody>

        <ResponsiveDialogFooter className="flex-row justify-between sm:justify-between">
          {isOwn ? (
            <>
              <Button
                variant="ghost"
                onClick={onDelete}
                className="text-destructive max-sm:h-11"
              >
                <Trash2 data-icon="inline-start" />
                {tc("delete")}
              </Button>
              <div className="flex gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={t("details.more")}
                      className="max-sm:size-11"
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-48">
                    <DropdownMenuItem className={menuItem} onSelect={onSchedule}>
                      <CalendarClock />
                      {t("contextMenu.schedule")}
                    </DropdownMenuItem>
                    <DropdownMenuItem className={menuItem} onSelect={onAddSubtask}>
                      <Plus />
                      {t("subtasks.addChild")}
                    </DropdownMenuItem>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className={menuItem}>
                        <Palette />
                        {t("details.changeColor")}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="p-2">
                        <ColorSwatchPicker
                          value={task.color}
                          onSelect={onChangeColor}
                          className="max-w-44"
                        />
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className={menuItem}>
                        <Flag />
                        {t("taskDialog.priorityLabel")}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuRadioGroup
                          value={String(task.priority ?? 0)}
                          onValueChange={(v) =>
                            onChangePriority(v === "0" ? null : Number(v))
                          }
                        >
                          <DropdownMenuRadioItem className={menuItem} value="0">
                            {t("priority.none")}
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem className={menuItem} value="1">
                            {t("priority.low")}
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem className={menuItem} value="2">
                            {t("priority.medium")}
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem className={menuItem} value="3">
                            {t("priority.high")}
                          </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    {boards.length > 0 && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className={menuItem}>
                          <Circle />
                          {t("details.moveToColumn")}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuRadioGroup
                            value={task.boardId ?? ""}
                            onValueChange={(id) => onMoveToBoard(id)}
                          >
                            {boards.map((b) => (
                              <DropdownMenuRadioItem
                                key={b.id}
                                className={menuItem}
                                value={b.id}
                              >
                                {b.name}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}

                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      className={menuItem}
                      checked={done}
                      onCheckedChange={() => onToggleDone()}
                    >
                      <CheckCircle2 />
                      {t("status.done")}
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button onClick={onEdit} className="max-sm:h-11">
                  <Pencil data-icon="inline-start" />
                  {tc("edit")}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex gap-2 max-sm:w-full sm:ml-auto">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="max-sm:h-11 max-sm:flex-1"
              >
                {tc("close")}
              </Button>
            </div>
          )}
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
