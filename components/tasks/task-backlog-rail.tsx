"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  CalendarPlus,
  GripVertical,
  CheckCircle2,
  Circle,
  Trash2,
  ListTodo,
  ChartColumnBig,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { useSidebarWidth, SidebarResizeHandle } from "@/lib/hooks/use-sidebar-width";
import { cn } from "@/lib/utils";
import { toPaletteColor, toPaletteInk } from "@/lib/theme/appearance";
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

/** A backlog task row: drag source + assignee + Schedule, with a context menu. */
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
      style={{ borderInlineStartColor: toPaletteColor(color) }}
      className={cn(
        "group flex min-h-11 items-center gap-1.5 rounded-md border border-l-4 bg-card p-2 text-sm shadow-soft md:min-h-0",
        draggable && "cursor-grab active:cursor-grabbing",
        className,
      )}
      {...rest}
    >
      {draggable && (
        <GripVertical className="size-4 shrink-0 text-muted-foreground/40" />
      )}
      <span className="min-w-0 flex-1 truncate">{task.title}</span>
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
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        aria-label={t("backlog.schedule", { title: task.title })}
        onClick={onSchedule}
      >
        <CalendarPlus className="size-4" />
      </Button>
      {onMenu && (
        <ItemMenuButton
          onMenu={onMenu}
          className="size-8 text-muted-foreground hover:text-foreground"
        />
      )}
    </div>
  );
});

/**
 * The list of open tasks, shared by the desktop rail and the mobile sheet. On
 * desktop the cards are HTML5 drag sources (drop on the grid to schedule); on
 * touch, dragging onto a grid is impractical, so the per-card Schedule button
 * is the (only) path and the grip/drag affordance is dropped.
 *
 * Each card carries a right-click (desktop) / long-press ⋮ (mobile) menu:
 * Schedule, mark done/not done, recolor, and delete.
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
}: BacklogProps & { draggable: boolean }) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  if (tasks.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-xs text-muted-foreground">
        {t("backlog.empty")}
      </p>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
      {tasks.map((task) => {
        const assignee = task.assigneeId ? members.get(task.assigneeId) ?? null : null;
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
            </TabsTrigger>
            <TabsTrigger value="insights">
              <ChartColumnBig />
              {t("backlog.insights")}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="tasks" className="flex min-h-0 flex-1 flex-col">
          <p className="px-3 pt-2 text-xs text-muted-foreground">
            {t("backlog.scheduleHint")}
          </p>
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
          <BacklogList {...props} draggable={false} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
