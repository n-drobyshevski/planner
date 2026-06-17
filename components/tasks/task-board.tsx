"use client";

import { useMemo, useState } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { m, AnimatePresence } from "motion/react";
import { ListChecks, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { tween, tweenFast } from "@/lib/motion";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { TaskCard } from "./task-card";
import { Column, SortableCard, EmptyColumn } from "./board-column";
import { BoardColumnMenu } from "./board-column-menu";
import { BoardEditorDialog } from "./board-editor-dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useBoardDnd } from "@/lib/hooks/use-board-dnd";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSwipe } from "@/hooks/use-swipe";
import type { TaskActions } from "./task-actions";
import type { Board, Member, TaskRow } from "@/lib/types";

export interface TaskBoardProps {
  tasks: TaskRow[]; // top-level tasks only
  /** the active collection's columns, ordered by position */
  boards: Board[];
  collectionId: string;
  workspaceId: string;
  colorOf: (t: TaskRow) => string;
  members: Map<string, Member>;
  progressOf?: (t: TaskRow) => { done: number; total: number } | null;
  actions: TaskActions;
}

export function TaskBoard({
  tasks,
  boards,
  collectionId,
  workspaceId,
  colorOf,
  members,
  progressOf,
  actions,
}: TaskBoardProps) {
  const t = useTranslations("tasks");
  // Tasks that already have subtasks can't themselves be nested (it would orphan
  // their children as invisible grandchildren); the hook uses this to gate nesting.
  const parentIds = useMemo(
    () => new Set(tasks.filter((t) => (progressOf?.(t)?.total ?? 0) > 0).map((t) => t.id)),
    [tasks, progressOf],
  );
  const {
    byId,
    items,
    activeTask,
    nestTargetId,
    collisionDetection,
    sensors,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  } = useBoardDnd(
    tasks,
    boards,
    actions.move,
    actions.reparent,
    (id) => parentIds.has(id),
  );
  const [addingColumn, setAddingColumn] = useState(false);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // The mobile single-column view tracks an active board id, clamped to the
  // current set (boards can be added/removed/reordered).
  const mobileBoard =
    boards.find((b) => b.id === activeBoardId) ?? boards[0] ?? null;
  const swipe = useSwipe({
    enabled: isMobile,
    onSwipeLeft: () => {
      const i = boards.findIndex((b) => b.id === mobileBoard?.id);
      const next = boards[Math.min(i + 1, boards.length - 1)];
      if (next) setActiveBoardId(next.id);
    },
    onSwipeRight: () => {
      const i = boards.findIndex((b) => b.id === mobileBoard?.id);
      const prev = boards[Math.max(i - 1, 0)];
      if (prev) setActiveBoardId(prev.id);
    },
  });

  const renderColumn = (board: Board) => (
    <Column
      key={board.id}
      board={board}
      count={items[board.id]?.length ?? 0}
      onNew={() => actions.create(board.id)}
      menu={<BoardColumnMenu board={board} workspaceId={workspaceId} />}
    >
      <SortableContext
        items={items[board.id] ?? []}
        strategy={verticalListSortingStrategy}
      >
        {(items[board.id]?.length ?? 0) === 0 ? (
          <EmptyColumn />
        ) : (
          (items[board.id] ?? []).map((id) => {
            const task = byId.get(id);
            if (!task) return null;
            return (
              <SortableCard
                key={id}
                task={task}
                color={colorOf(task)}
                assignee={task.assigneeId ? members.get(task.assigneeId) ?? null : null}
                progress={progressOf?.(task) ?? null}
                nesting={nestTargetId === id}
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
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {isMobile ? (
        <div className="flex h-full flex-col gap-3 p-3">
          <ToggleGroup
            type="single"
            value={mobileBoard?.id ?? ""}
            onValueChange={(v) => v && setActiveBoardId(v)}
            variant="outline"
            size="sm"
            className="w-full overflow-x-auto"
          >
            {boards.map((b) => (
              <ToggleGroupItem key={b.id} value={b.id} className="flex-1">
                {b.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="relative min-h-0 flex-1" {...swipe}>
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={mobileBoard?.id ?? "none"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: tween }}
                exit={{ opacity: 0, transition: tweenFast }}
                className="h-full"
              >
                {mobileBoard ? renderColumn(mobileBoard) : null}
              </m.div>
            </AnimatePresence>
          </div>
        </div>
      ) : (
        <div className="flex h-full gap-3 overflow-x-auto p-3 sm:p-4">
          {boards.map((board) => (
            <div key={board.id} className="min-w-64 flex-1 basis-64">
              {renderColumn(board)}
            </div>
          ))}
          <div className="shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setAddingColumn(true)}
            >
              <Plus data-icon="inline-start" />
              {t("boardEditor.addColumn")}
            </Button>
          </div>
        </div>
      )}

      <DragOverlay>
        {activeTask ? (
          // While a nest is pending, fade + shrink the floating card so the
          // target's "make subtask" highlight reads through underneath it.
          <m.div
            initial={{ scale: 1 }}
            animate={{ scale: nestTargetId ? 0.9 : 1.03, opacity: nestTargetId ? 0.35 : 1 }}
            transition={tweenFast}
          >
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

      <BoardEditorDialog
        open={addingColumn}
        onOpenChange={setAddingColumn}
        mode="create"
        workspaceId={workspaceId}
        collectionId={collectionId}
        newPosition={(boards[boards.length - 1]?.position ?? -1) + 1}
      />
    </DndContext>
  );
}

export function BoardEmpty() {
  const t = useTranslations("tasks");
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ListChecks />
        </EmptyMedia>
        <EmptyTitle>{t("board.emptyTitle")}</EmptyTitle>
        <EmptyDescription>{t("board.emptyDescription")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
