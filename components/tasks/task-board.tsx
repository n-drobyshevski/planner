"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { m, AnimatePresence } from "motion/react";
import { Plus, ListChecks } from "lucide-react";
import { tween, tweenFast } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { TaskContextMenu } from "./task-context-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { TaskCard } from "./task-card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { positionBetween } from "@/lib/tasks/ordering";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSwipe } from "@/hooks/use-swipe";
import type { Member, TaskRow, TaskStatus } from "@/lib/types";

const COLUMNS: { status: TaskStatus; title: string }[] = [
  { status: "todo", title: "To Do" },
  { status: "in_progress", title: "In Progress" },
  { status: "done", title: "Done" },
];

type Columns = Record<TaskStatus, string[]>;

const isColumn = (id: string): id is TaskStatus =>
  id === "todo" || id === "in_progress" || id === "done";

function buildColumns(tasks: TaskRow[]): Columns {
  const cols: Columns = { todo: [], in_progress: [], done: [] };
  const sorted = [...tasks].sort(
    (a, b) => a.position - b.position || a.createdAt - b.createdAt,
  );
  for (const t of sorted) cols[t.status].push(t.id);
  return cols;
}

export interface TaskBoardProps {
  tasks: TaskRow[]; // top-level tasks only
  colorOf: (t: TaskRow) => string;
  members: Map<string, Member>;
  progressOf?: (t: TaskRow) => { done: number; total: number } | null;
  onOpen: (t: TaskRow) => void;
  onToggleDone: (t: TaskRow) => void;
  onMove: (t: TaskRow, status: TaskStatus, position: number) => void;
  onNew: (status: TaskStatus) => void;
  onChangeColor: (t: TaskRow, color: string | null) => void;
  onDelete: (t: TaskRow) => void;
}

export function TaskBoard({
  tasks,
  colorOf,
  members,
  progressOf,
  onOpen,
  onToggleDone,
  onMove,
  onNew,
  onChangeColor,
  onDelete,
}: TaskBoardProps) {
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const source = useMemo(() => buildColumns(tasks), [tasks]);
  const [items, setItems] = useState<Columns>(source);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<TaskStatus>("todo");
  const isMobile = useIsMobile();
  const statusOrder: TaskStatus[] = ["todo", "in_progress", "done"];
  const swipe = useSwipe({
    enabled: isMobile,
    onSwipeLeft: () =>
      setActiveStatus((s) => statusOrder[Math.min(statusOrder.indexOf(s) + 1, 2)]),
    onSwipeRight: () =>
      setActiveStatus((s) => statusOrder[Math.max(statusOrder.indexOf(s) - 1, 0)]),
  });

  // Resync from server data when it changes and we're not mid-drag. Done during
  // render (React's "adjust state on prop change" pattern) rather than in an
  // effect, so optimistic order set in onDragEnd survives until the refetch.
  const [syncedSource, setSyncedSource] = useState(source);
  if (source !== syncedSource && !activeId) {
    setSyncedSource(source);
    setItems(source);
  }

  // Mouse drags immediately (5px); touch requires a 200ms long-press so the
  // board can still be scrolled and swiped between columns on a phone.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findContainer = (id: string): TaskStatus | null => {
    if (isColumn(id)) return id;
    return (Object.keys(items) as TaskStatus[]).find((c) =>
      items[c].includes(id),
    ) ?? null;
  };

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    const activeC = findContainer(activeIdStr);
    const overC = isColumn(overIdStr) ? overIdStr : findContainer(overIdStr);
    if (!activeC || !overC) return;

    const withoutActive = items[activeC].filter((id) => id !== activeIdStr);
    const base = activeC === overC ? withoutActive : items[overC];

    let insertIndex: number;
    if (isColumn(overIdStr)) {
      insertIndex = base.length; // dropped on the column body
    } else {
      const idx = base.indexOf(overIdStr);
      insertIndex = idx >= 0 ? idx : base.length;
    }

    const overArr = [
      ...base.slice(0, insertIndex),
      activeIdStr,
      ...base.slice(insertIndex),
    ];
    const next: Columns = { ...items, [activeC]: withoutActive, [overC]: overArr };
    if (activeC === overC) next[activeC] = overArr;

    // No change at all → nothing to persist.
    if (
      activeC === overC &&
      items[activeC].join() === next[activeC].join()
    ) {
      return;
    }

    setItems(next);

    const finalArr = next[overC];
    const pos = finalArr.indexOf(activeIdStr);
    const before = pos > 0 ? byId.get(finalArr[pos - 1])?.position ?? null : null;
    const after =
      pos < finalArr.length - 1
        ? byId.get(finalArr[pos + 1])?.position ?? null
        : null;
    const task = byId.get(activeIdStr);
    if (task) onMove(task, overC, positionBetween(before, after));
  }

  const renderColumn = (col: { status: TaskStatus; title: string }) => (
    <Column
      key={col.status}
      status={col.status}
      title={col.title}
      count={items[col.status].length}
      onNew={() => onNew(col.status)}
    >
      <SortableContext
        items={items[col.status]}
        strategy={verticalListSortingStrategy}
      >
        {items[col.status].length === 0 ? (
          <EmptyColumn />
        ) : (
          items[col.status].map((id) => {
            const task = byId.get(id);
            if (!task) return null;
            return (
              <SortableCard
                key={id}
                task={task}
                color={colorOf(task)}
                assignee={task.assigneeId ? members.get(task.assigneeId) ?? null : null}
                progress={progressOf?.(task) ?? null}
                onOpen={() => onOpen(task)}
                onToggleDone={() => onToggleDone(task)}
                onChangeColor={(c) => onChangeColor(task, c)}
                onDelete={() => onDelete(task)}
              />
            );
          })
        )}
      </SortableContext>
    </Column>
  );

  const activeTask = activeId ? byId.get(activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {isMobile ? (
        <div className="flex h-full flex-col gap-3 p-3">
          <ToggleGroup
            type="single"
            value={activeStatus}
            onValueChange={(v) => v && setActiveStatus(v as TaskStatus)}
            variant="outline"
            size="sm"
            className="w-full"
          >
            {COLUMNS.map((c) => (
              <ToggleGroupItem key={c.status} value={c.status} className="flex-1">
                {c.title}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="relative min-h-0 flex-1" {...swipe}>
            {/* Crossfade the swapped column instead of an instant cut.
                `initial={false}` paints the first column at once; only the swap
                (toggle or swipe) animates. Column swaps never happen mid-drag,
                so this doesn't interfere with dnd-kit. */}
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={activeStatus}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: tween }}
                exit={{ opacity: 0, transition: tweenFast }}
                className="h-full"
              >
                {renderColumn(COLUMNS.find((c) => c.status === activeStatus)!)}
              </m.div>
            </AnimatePresence>
          </div>
        </div>
      ) : (
        <div className="grid h-full grid-cols-1 gap-3 overflow-x-auto p-3 sm:grid-cols-3 sm:p-4">
          {COLUMNS.map(renderColumn)}
        </div>
      )}

      <DragOverlay>
        {activeTask ? (
          // The grabbed card lifts (subtle scale) above the board while dragging;
          // shadow-soft-lg reinforces the depth. reducedMotion="user" (provider)
          // drops the scale for users who ask for it.
          <m.div initial={{ scale: 1 }} animate={{ scale: 1.03 }} transition={tweenFast}>
            <TaskCard
              task={activeTask}
              color={colorOf(activeTask)}
              assignee={
                activeTask.assigneeId ? members.get(activeTask.assigneeId) ?? null : null
              }
              progress={progressOf?.(activeTask) ?? null}
              onOpen={() => {}}
              onToggleDone={() => {}}
              showHandle
              className="cursor-grabbing shadow-soft-lg"
            />
          </m.div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  title,
  count,
  onNew,
  children,
}: {
  status: TaskStatus;
  title: string;
  count: number;
  onNew: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section className="flex min-h-0 flex-col rounded-xl bg-muted/40">
      <header className="flex items-center justify-between px-3 pt-3 pb-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {title}
          <span className="rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground tabular-nums">
            {count}
          </span>
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={`Add task to ${title}`}
          onClick={onNew}
        >
          <Plus />
        </Button>
      </header>
      <div
        ref={setNodeRef}
        data-over={isOver || undefined}
        className="flex flex-1 flex-col gap-2 overflow-y-auto rounded-b-xl p-2 transition-colors duration-150 ease-out-quint data-[over]:bg-muted/70"
      >
        {children}
      </div>
    </section>
  );
}

function SortableCard(props: {
  task: TaskRow;
  color: string;
  assignee: Member | null;
  progress: { done: number; total: number } | null;
  onOpen: () => void;
  onToggleDone: () => void;
  onChangeColor: (color: string | null) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.task.id });
  return (
    <TaskContextMenu
      task={props.task}
      onOpen={props.onOpen}
      onToggleDone={props.onToggleDone}
      onDelete={props.onDelete}
      onChangeColor={props.onChangeColor}
    >
      <TaskCard
        ref={setNodeRef}
        task={props.task}
        color={props.color}
        assignee={props.assignee}
        progress={props.progress}
        onOpen={props.onOpen}
        onToggleDone={props.onToggleDone}
        dragging={isDragging}
        showHandle
        style={{ transform: CSS.Transform.toString(transform), transition }}
        dragProps={{ ...attributes, ...listeners }}
      />
    </TaskContextMenu>
  );
}

function EmptyColumn() {
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
      Drop tasks here
    </div>
  );
}

export function BoardEmpty() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ListChecks />
        </EmptyMedia>
        <EmptyTitle>No tasks yet</EmptyTitle>
        <EmptyDescription>Create your first task to get started.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
