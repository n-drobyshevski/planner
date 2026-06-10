"use client";

import { useState } from "react";
import { DndContext, DragOverlay, closestCorners } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { m, AnimatePresence } from "motion/react";
import { ListChecks } from "lucide-react";
import { tween, tweenFast } from "@/lib/motion";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { TaskCard } from "./task-card";
import { Column, SortableCard, EmptyColumn } from "./board-column";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useBoardDnd } from "@/lib/hooks/use-board-dnd";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSwipe } from "@/hooks/use-swipe";
import type { TaskActions } from "./task-actions";
import type { Member, TaskRow, TaskStatus } from "@/lib/types";

const COLUMNS: { status: TaskStatus; title: string }[] = [
  { status: "todo", title: "To Do" },
  { status: "in_progress", title: "In Progress" },
  { status: "done", title: "Done" },
];

export interface TaskBoardProps {
  tasks: TaskRow[]; // top-level tasks only
  colorOf: (t: TaskRow) => string;
  members: Map<string, Member>;
  progressOf?: (t: TaskRow) => { done: number; total: number } | null;
  actions: TaskActions;
}

export function TaskBoard({ tasks, colorOf, members, progressOf, actions }: TaskBoardProps) {
  const { byId, items, activeTask, sensors, onDragStart, onDragEnd } =
    useBoardDnd(tasks, actions.move);
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

  const renderColumn = (col: { status: TaskStatus; title: string }) => (
    <Column
      key={col.status}
      status={col.status}
      title={col.title}
      count={items[col.status].length}
      onNew={() => actions.create(col.status)}
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
                onOpen={() => actions.open(task)}
                onToggleDone={() => actions.toggleDone(task)}
                onChangeColor={(c) => actions.changeColor(task, c)}
                onDelete={() => actions.remove(task)}
              />
            );
          })
        )}
      </SortableContext>
    </Column>
  );

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
