"use client";

import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskContextMenu } from "./task-context-menu";
import { TaskCard } from "./task-card";
import type { Member, TaskRow, TaskStatus } from "@/lib/types";

export function Column({
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
  const headingId = `board-col-${status}`;
  return (
    <section aria-labelledby={headingId} className="flex min-h-0 flex-col rounded-xl bg-muted/40">
      <header className="flex items-center justify-between px-3 pt-3 pb-2">
        <h3 id={headingId} className="flex items-center gap-2 text-sm font-semibold">
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
        role="listitem"
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

export function EmptyColumn() {
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
      Drop tasks here
    </div>
  );
}
