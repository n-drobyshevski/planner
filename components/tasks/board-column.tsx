"use client";

import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { NEST_PREFIX } from "@/lib/tasks/nest-collision";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { TaskContextMenu } from "./task-context-menu";
import { TaskCard } from "./task-card";
import type { Board, Member, TaskRow } from "@/lib/types";

export function Column({
  board,
  count,
  onNew,
  menu,
  children,
}: {
  board: Board;
  count: number;
  onNew: () => void;
  /** Optional per-column controls (the edit/delete menu). */
  menu?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTranslations("tasks");
  const { setNodeRef, isOver } = useDroppable({ id: board.id });
  const headingId = `board-col-${board.id}`;
  return (
    <section aria-labelledby={headingId} className="flex min-h-0 flex-col rounded-xl bg-muted/40">
      <header className="flex items-center justify-between gap-1 px-3 pt-3 pb-2">
        <h3 id={headingId} className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <span className="truncate">{board.name}</span>
          <span className="rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground tabular-nums">
            {count}
          </span>
        </h3>
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t("board.addTaskTo", { title: board.name })}
            onClick={onNew}
          >
            <Plus />
          </Button>
          {menu}
        </div>
      </header>
      <div
        ref={setNodeRef}
        role="list"
        aria-labelledby={headingId}
        data-over={isOver || undefined}
        className="flex flex-1 flex-col gap-2 overflow-y-auto rounded-b-xl p-2 transition-colors duration-150 ease-out-quint data-[over]:bg-muted/70"
      >
        {children}
      </div>
    </section>
  );
}

export function SortableCard(props: {
  task: TaskRow;
  color: string;
  assignee: Member | null;
  progress: { done: number; total: number } | null;
  /** another card is hovering this one's centre, about to nest under it */
  nesting?: boolean;
  onOpen: () => void;
  onToggleDone: () => void;
  onChangeColor: (color: string | null) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.task.id });
  // A second droppable over the same box, so the centre-band collision can resolve
  // a nest without triggering the sortable reorder reflow.
  const { setNodeRef: setNestRef } = useDroppable({ id: `${NEST_PREFIX}${props.task.id}` });
  const setRefs = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    setNestRef(node);
  };
  return (
    <TaskContextMenu
      task={props.task}
      onOpen={props.onOpen}
      onToggleDone={props.onToggleDone}
      onDelete={props.onDelete}
      onChangeColor={props.onChangeColor}
    >
      <TaskCard
        ref={setRefs}
        role="listitem"
        task={props.task}
        color={props.color}
        assignee={props.assignee}
        progress={props.progress}
        nesting={props.nesting}
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

export function EmptyColumn() {
  const t = useTranslations("tasks");
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
      {t("board.dropTasksHere")}
    </div>
  );
}
