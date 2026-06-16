"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  CalendarPlus,
  CalendarClock,
  CalendarX2,
  Flag,
  GripVertical,
  Lock,
  CheckCircle2,
  Circle,
  Trash2,
  ListTodo,
  ChartColumnBig,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ItemContextMenu,
  ItemMenuButton,
  type MenuableProps,
} from "@/components/shared/item-context-menu";
import { type UsageTabProps } from "@/components/analytics/usage-tab";
import { PRIORITY } from "@/components/tasks/task-card";
import { useSidebarWidth, SidebarResizeHandle } from "@/lib/hooks/use-sidebar-width";
import { cn } from "@/lib/utils";
import { toPaletteColor, toPaletteInk } from "@/lib/theme/appearance";
import { dateKeyInZone, isDateTokenPast, DAY_IN_MS } from "@/lib/datetime/local";
import { formatDayMonthToken } from "@/lib/datetime/format";
import { useViewerTimeZone } from "@/lib/datetime/timezone-context";
import type { Member, TaskRow } from "@/lib/types";

/** Skeleton shown while the lazy Insights chunk (recharts) loads. Reserves the
 *  panel's rough height to avoid layout shift; pulse only when motion is allowed. */
function UsageTabFallback() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 p-3 motion-safe:animate-pulse"
      aria-hidden
    >
      <div className="h-8 w-40 rounded bg-muted/60" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-14 rounded-lg bg-muted/40" />
        <div className="h-14 rounded-lg bg-muted/40" />
        <div className="h-14 rounded-lg bg-muted/40" />
        <div className="h-14 rounded-lg bg-muted/40" />
      </div>
      <div className="h-[140px] rounded-lg bg-muted/40" />
      <div className="h-[150px] rounded-lg bg-muted/40" />
    </div>
  );
}

/** recharts (~100KB+ with its d3 deps) is only used by the Insights tab, which
 *  isn't the default tab — lazy-load it so it stays out of the rail's initial
 *  chunk and downloads only when the user opens Insights. */
const UsageTab = dynamic(
  () => import("@/components/analytics/usage-tab").then((m) => m.UsageTab),
  { ssr: false, loading: () => <UsageTabFallback /> },
);

interface BacklogProps {
  tasks: TaskRow[];
  colorOf: (t: TaskRow) => string;
  members: Map<string, Member>;
  onSchedule: (t: TaskRow) => void;
  onToggleDone: (t: TaskRow) => void;
  onChangeColor: (t: TaskRow, color: string | null) => void;
  onDelete: (t: TaskRow) => void;
}

/**
 * A backlog task row: a drag source (desktop) that schedules onto the grid, with
 * a leading colour swatch (its category/owner colour), the task's due/priority/
 * private signals, an assignee, and a Schedule action. On desktop the Schedule
 * button + menu stay hidden until the row is hovered or keyboard-focused so the
 * list reads calm; on touch (the sheet, `draggable={false}`) they stay visible
 * since there's no hover.
 */
const BacklogCard = React.forwardRef<
  HTMLDivElement,
  {
    task: TaskRow;
    color: string;
    assignee: Member | null;
    draggable: boolean;
    onSchedule: () => void;
  } & MenuableProps &
    React.HTMLAttributes<HTMLDivElement>
>(function BacklogCard(
  { task, color, assignee, draggable, onSchedule, onMenu, className, ...rest },
  ref,
) {
  const t = useTranslations("tasks");
  const locale = useLocale();
  const timeZone = useViewerTimeZone();
  const done = task.completedAt != null;
  const overdue =
    task.dueDate != null && !done && isDateTokenPast(task.dueDate, timeZone);
  const prio = task.priority ? PRIORITY[task.priority] : undefined;
  const hasMeta = task.dueDate != null || prio != null || task.isPrivate;

  return (
    <div
      ref={ref}
      draggable={draggable}
      onDragStart={
        draggable
          ? (e) => {
              e.dataTransfer.setData("text/task-id", task.id);
              e.dataTransfer.setData("text/plain", task.title);
              e.dataTransfer.effectAllowed = "copy";
            }
          : undefined
      }
      className={cn(
        "group flex min-h-11 gap-2 rounded-md border bg-card p-2 text-sm shadow-soft md:min-h-0",
        draggable && "cursor-grab active:cursor-grabbing",
        className,
      )}
      {...rest}
    >
      {draggable && (
        <GripVertical
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground"
        />
      )}

      {/* Leading colour swatch (category/owner colour); the row's only colour. */}
      <span
        aria-hidden
        className="mt-[5px] size-2.5 shrink-0 rounded-[3px]"
        style={{ backgroundColor: toPaletteColor(color) }}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate leading-snug">{task.title}</span>

        {hasMeta && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
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
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 self-start">
        {assignee && (
          <Avatar className="size-5 shrink-0" title={assignee.name}>
            <AvatarFallback
              style={{ backgroundColor: toPaletteColor(assignee.color), color: toPaletteInk(assignee.color) }}
              className="text-[9px] font-semibold"
            >
              {assignee.name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
        {/* Hidden until hover / keyboard focus on desktop; always shown on touch
            (no hover). Opacity only — never display:none — so it stays in tab order. */}
        <div
          className={cn(
            "flex items-center gap-0.5",
            draggable &&
              "opacity-0 transition-opacity duration-150 ease-out-quint group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none",
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 md:size-8"
            aria-label={t("backlog.schedule", { title: task.title })}
            onClick={onSchedule}
          >
            <CalendarPlus className="size-4" />
          </Button>
          {onMenu && (
            <ItemMenuButton
              onMenu={onMenu}
              className="size-11 text-muted-foreground hover:text-foreground md:size-8"
            />
          )}
        </div>
      </div>
    </div>
  );
});

type DueGroup = "overdue" | "week" | "later" | "none";
const GROUP_ORDER: DueGroup[] = ["overdue", "week", "later", "none"];

/**
 * The list of open tasks, shared by the desktop rail and the mobile sheet. On
 * desktop the cards are HTML5 drag sources (drop on the grid to schedule); on
 * touch, dragging onto a grid is impractical, so the per-card Schedule button
 * is the (only) path and the grip/drag affordance is dropped.
 *
 * Tasks are grouped by due-window (Overdue / This week / Later / No date) and
 * ordered within each group by soonest-due, then priority, so the most pressing
 * unscheduled work surfaces first. Each card carries a right-click (desktop) /
 * long-press ⋮ (mobile) menu: Schedule, mark done/not done, recolor, and delete.
 */
function BacklogList({
  tasks,
  colorOf,
  members,
  onSchedule,
  onToggleDone,
  onChangeColor,
  onDelete,
  draggable,
  stickyBg = "bg-sidebar/95",
}: BacklogProps & { draggable: boolean; stickyBg?: string }) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const timeZone = useViewerTimeZone();
  // Captured once on mount (a backlog panel re-mounts often enough that a
  // midnight rollover isn't worth an interval); a lazy initializer keeps the
  // render pure for the react-hooks purity rule.
  const [now] = React.useState(() => Date.now());

  const groups = React.useMemo(() => {
    const weekToken = dateKeyInZone(now + 7 * DAY_IN_MS, timeZone);
    const classify = (task: TaskRow): DueGroup => {
      if (task.dueDate == null) return "none";
      if (isDateTokenPast(task.dueDate, timeZone)) return "overdue";
      if (task.dueDate <= weekToken) return "week";
      return "later";
    };
    const buckets = new Map<DueGroup, { task: TaskRow; idx: number }[]>();
    tasks.forEach((task, idx) => {
      const key = classify(task);
      const arr = buckets.get(key) ?? [];
      arr.push({ task, idx });
      buckets.set(key, arr);
    });
    // soonest due first; dated before undated; then priority high→low; then the
    // original (shell) order as a stable tiebreaker.
    const cmp = (
      a: { task: TaskRow; idx: number },
      b: { task: TaskRow; idx: number },
    ) => {
      const ad = a.task.dueDate;
      const bd = b.task.dueDate;
      if (ad != null && bd != null && ad !== bd) return ad < bd ? -1 : 1;
      if ((ad == null) !== (bd == null)) return ad == null ? 1 : -1;
      const ap = a.task.priority ?? 0;
      const bp = b.task.priority ?? 0;
      if (ap !== bp) return bp - ap;
      return a.idx - b.idx;
    };
    return GROUP_ORDER.map((key) => ({
      key,
      items: (buckets.get(key) ?? []).sort(cmp).map((x) => x.task),
    })).filter((g) => g.items.length > 0);
  }, [tasks, timeZone, now]);

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <ListTodo aria-hidden className="size-6 text-muted-foreground" />
        <p className="text-sm text-foreground">{t("backlog.empty")}</p>
        <p className="max-w-[26ch] text-xs text-muted-foreground">
          {t("backlog.emptyHint")}
        </p>
      </div>
    );
  }

  const groupLabel: Record<DueGroup, string> = {
    overdue: t("backlog.groupOverdue"),
    week: t("backlog.groupThisWeek"),
    later: t("backlog.groupLater"),
    none: t("backlog.groupNoDate"),
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-2">
      {groups.map((group) => (
        <section key={group.key}>
          {/* Sticky subheader: -mx-2 + px-3 lets the (blurred) bg span the full
              rail width so cards never peek beside it as they scroll under. */}
          <h3
            className={cn(
              "sticky top-0 z-[1] -mx-2 flex items-baseline gap-1.5 px-3 pt-3 pb-1.5 text-xs font-semibold uppercase tracking-wide backdrop-blur-sm",
              stickyBg,
              group.key === "overdue" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {groupLabel[group.key]}
            <span className="font-normal tabular-nums text-muted-foreground">
              {group.items.length}
            </span>
          </h3>
          <div className="flex flex-col gap-1.5 pt-1.5">
            {group.items.map((task) => {
              const assignee = task.assigneeId
                ? members.get(task.assigneeId) ?? null
                : null;
              const done = task.completedAt != null;
              return (
                <ItemContextMenu
                  key={task.id}
                  title={task.title}
                  color={task.color}
                  onColorChange={(c) => onChangeColor(task, c)}
                  actions={[
                    { label: t("contextMenu.schedule"), icon: CalendarPlus, onSelect: () => onSchedule(task) },
                    {
                      label: done ? t("contextMenu.markNotDone") : t("contextMenu.markDone"),
                      icon: done ? Circle : CheckCircle2,
                      onSelect: () => onToggleDone(task),
                    },
                    { label: tc("delete"), icon: Trash2, destructive: true, onSelect: () => onDelete(task) },
                  ]}
                >
                  <BacklogCard
                    task={task}
                    color={colorOf(task)}
                    assignee={assignee}
                    draggable={draggable}
                    onSchedule={() => onSchedule(task)}
                  />
                </ItemContextMenu>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * Desktop-only right rail. Hidden on phones (< md) — see TaskBacklogSheet. Drag
 * the inner edge to resize; the width is remembered per device + per user.
 *
 * Two tabs: the unscheduled-task backlog and an "Insights" analytics panel for
 * the calendar's currently selected timeframe (see UsageTab). The mobile sheet
 * stays tasks-only.
 */
export function TaskBacklogRail({
  userKey,
  analytics,
  ...props
}: BacklogProps & { userKey: string | undefined; analytics: UsageTabProps }) {
  const t = useTranslations("tasks");
  const { width, beginResize } = useSidebarWidth("right", userKey);
  const [tab, setTab] = React.useState<"tasks" | "insights">("tasks");
  const count = props.tasks.length;
  return (
    <aside
      style={{ width }}
      className="relative hidden shrink-0 flex-col border-l bg-sidebar md:flex"
    >
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "tasks" | "insights")}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="border-b px-3 py-2">
          <TabsList className="w-full">
            <TabsTrigger value="tasks">
              <ListTodo />
              {t("backlog.tasks")}
              {count > 0 && (
                <>
                  <span aria-hidden className="ml-0.5 tabular-nums text-muted-foreground">
                    {count}
                  </span>
                  <span className="sr-only">{t("backlog.openCount", { count })}</span>
                </>
              )}
            </TabsTrigger>
            <TabsTrigger value="insights">
              <ChartColumnBig />
              {t("backlog.insights")}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="tasks" className="flex min-h-0 flex-1 flex-col">
          {count > 0 && (
            <p className="px-3 pt-2 text-xs text-muted-foreground">
              {t("backlog.scheduleHint")}
            </p>
          )}
          <BacklogList {...props} draggable />
        </TabsContent>
        <TabsContent value="insights" className="flex min-h-0 flex-1 flex-col">
          <UsageTab {...analytics} />
        </TabsContent>
      </Tabs>
      <SidebarResizeHandle side="right" onPointerDown={beginResize} />
    </aside>
  );
}

/** Phone presentation of the backlog: a bottom sheet with tap-to-schedule. */
export function TaskBacklogSheet({
  open,
  onOpenChange,
  ...props
}: BacklogProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("tasks");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80dvh]">
        <SheetHeader>
          <SheetTitle>{t("backlog.tasks")}</SheetTitle>
          <SheetDescription>
            {t("backlog.sheetDescription")}
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-safe">
          <BacklogList {...props} draggable={false} stickyBg="bg-popover/95" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
