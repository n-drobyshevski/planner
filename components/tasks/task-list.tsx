"use client";

import { useMemo } from "react";
import { TaskCard } from "./task-card";
import { TaskContextMenu } from "./task-context-menu";
import type { Member, TaskRow, TaskStatus } from "@/lib/types";

const SECTIONS: { status: TaskStatus; title: string }[] = [
  { status: "todo", title: "To Do" },
  { status: "in_progress", title: "In Progress" },
  { status: "done", title: "Done" },
];

export interface TaskListProps {
  tasks: TaskRow[]; // top-level tasks only
  colorOf: (t: TaskRow) => string;
  members: Map<string, Member>;
  progressOf?: (t: TaskRow) => { done: number; total: number } | null;
  onOpen: (t: TaskRow) => void;
  onToggleDone: (t: TaskRow) => void;
  onChangeColor: (t: TaskRow, color: string | null) => void;
  onDelete: (t: TaskRow) => void;
}

export function TaskList({
  tasks,
  colorOf,
  members,
  progressOf,
  onOpen,
  onToggleDone,
  onChangeColor,
  onDelete,
}: TaskListProps) {
  const groups = useMemo(
    () =>
      SECTIONS.map((s) => ({
        ...s,
        items: tasks
          .filter((t) => t.status === s.status)
          .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt),
      })),
    [tasks],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      {groups.map((g) => (
        <section key={g.status} className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 px-1 text-sm font-semibold">
            {g.title}
            <span className="rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground tabular-nums">
              {g.items.length}
            </span>
          </h3>
          {g.items.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">Nothing here.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {g.items.map((t) => (
                <TaskContextMenu
                  key={t.id}
                  task={t}
                  onOpen={() => onOpen(t)}
                  onToggleDone={() => onToggleDone(t)}
                  onDelete={() => onDelete(t)}
                  onChangeColor={(c) => onChangeColor(t, c)}
                >
                  <TaskCard
                    task={t}
                    color={colorOf(t)}
                    assignee={t.assigneeId ? members.get(t.assigneeId) ?? null : null}
                    progress={progressOf?.(t) ?? null}
                    onOpen={() => onOpen(t)}
                    onToggleDone={() => onToggleDone(t)}
                  />
                </TaskContextMenu>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
