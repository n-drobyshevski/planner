"use client";

// The list is the read-oriented surface (phones default to it). Sibling
// *reordering* stays board-only on purpose — the board already owns ordering and
// a second sortable surface would duplicate that machinery. The one drag gesture
// the list does carry is drag-to-nest: drop a task onto another to file it as a
// subtask. (No reorder competes here, so the whole target row nests.)
import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { TaskCard } from "./task-card";
import { TaskContextMenu } from "./task-context-menu";
import { canNest } from "@/lib/tasks/nesting";
import type { TaskActions } from "./task-actions";
import type { Board, Member, TaskRow } from "@/lib/types";

export interface TaskListProps {
  tasks: TaskRow[]; // top-level tasks only
  /** the active collection's columns, ordered by position */
  boards: Board[];
  colorOf: (t: TaskRow) => string;
  members: Map<string, Member>;
  progressOf?: (t: TaskRow) => { done: number; total: number } | null;
  actions: TaskActions;
}

export function TaskList({ tasks, boards, colorOf, members, progressOf, actions }: TaskListProps) {
  const t = useTranslations("tasks");
  const groups = useMemo(
    () =>
      boards.map((board) => ({
        board,
        items: tasks
          .filter((t) => t.boardId === board.id)
          .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt),
      })),
    [tasks, boards],
  );

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  // Tasks that already have subtasks can't be nested (it would orphan their
  // children as invisible grandchildren).
  const parentIds = useMemo(
    () => new Set(tasks.filter((t) => (progressOf?.(t)?.total ?? 0) > 0).map((t) => t.id)),
    [tasks, progressOf],
  );
  const hasChildren = (id: string) => parentIds.has(id);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const activeTask = activeId ? byId.get(activeId) ?? null : null;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  function nestParentOf(overTaskId: string | null): TaskRow | null {
    if (!activeTask || !overTaskId) return null;
    const parent = byId.get(overTaskId);
    if (!parent || !canNest(activeTask, parent, hasChildren)) return null;
    return parent;
  }

  function onDragEnd(e: DragEndEvent) {
    const parent = nestParentOf(e.over ? String(e.over.id) : null);
    setActiveId(null);
    setOverId(null);
    if (activeTask && parent) actions.reparent(activeTask, parent.id);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragOver={(e) => setOverId(e.over ? String(e.over.id) : null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setOverId(null);
      }}
    >
      <div className="mx-auto max-w-3xl space-y-6 p-4">
        {groups.map((g) => (
          <section key={g.board.id} aria-labelledby={`list-col-${g.board.id}`} className="flex flex-col gap-2">
            <h3
              id={`list-col-${g.board.id}`}
              className="flex items-center gap-2 px-1 text-sm font-semibold"
            >
              {g.board.name}
              <span className="rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground tabular-nums">
                {g.items.length}
              </span>
            </h3>
            {g.items.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">{t("list.nothingHere")}</p>
            ) : (
              <ul className="flex list-none flex-col gap-2">
                {g.items.map((task) => (
                  <NestableRow
                    key={task.id}
                    task={task}
                    color={colorOf(task)}
                    assignee={task.assigneeId ? members.get(task.assigneeId) ?? null : null}
                    progress={progressOf?.(task) ?? null}
                    dragging={activeId === task.id}
                    nesting={!!nestParentOf(overId) && overId === task.id}
                    actions={actions}
                  />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <TaskCard
            task={activeTask}
            color={colorOf(activeTask)}
            assignee={activeTask.assigneeId ? members.get(activeTask.assigneeId) ?? null : null}
            progress={progressOf?.(activeTask) ?? null}
            onOpen={() => {}}
            onToggleDone={() => {}}
            showHandle
            // Fade while over a valid nest target so its highlight reads through.
            style={{ opacity: nestParentOf(overId) ? 0.35 : 1 }}
            className="cursor-grabbing shadow-soft-lg transition-opacity"
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** A list row that can be picked up (drag-to-nest) and dropped onto (nest target). */
function NestableRow({
  task,
  color,
  assignee,
  progress,
  dragging,
  nesting,
  actions,
}: {
  task: TaskRow;
  color: string;
  assignee: Member | null;
  progress: { done: number; total: number } | null;
  dragging: boolean;
  nesting: boolean;
  actions: TaskActions;
}) {
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({ id: task.id });
  const { setNodeRef: setDropRef } = useDroppable({ id: task.id });

  return (
    <li ref={setDropRef}>
      <TaskContextMenu
        task={task}
        onOpen={() => actions.open(task)}
        onToggleDone={() => actions.toggleDone(task)}
        onDelete={() => actions.remove(task)}
        onChangeColor={(c) => actions.changeColor(task, c)}
      >
        <TaskCard
          ref={setDragRef}
          task={task}
          color={color}
          assignee={assignee}
          progress={progress}
          dragging={dragging}
          nesting={nesting}
          showHandle
          onOpen={() => actions.open(task)}
          onToggleDone={() => actions.toggleDone(task)}
          dragProps={{ ...attributes, ...listeners }}
        />
      </TaskContextMenu>
    </li>
  );
}
