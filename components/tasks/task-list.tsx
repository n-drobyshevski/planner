"use client";

// The list is the read-oriented surface (phones default to it); reordering
// stays board-only on purpose — a second drag surface would duplicate the dnd
// machinery for little gain when the board already owns ordering.
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { TaskCard } from "./task-card";
import { TaskContextMenu } from "./task-context-menu";
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

  return (
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
              {g.items.map((t) => (
                <li key={t.id}>
                  <TaskContextMenu
                    task={t}
                    onOpen={() => actions.open(t)}
                    onToggleDone={() => actions.toggleDone(t)}
                    onDelete={() => actions.remove(t)}
                    onChangeColor={(c) => actions.changeColor(t, c)}
                  >
                    <TaskCard
                      task={t}
                      color={colorOf(t)}
                      assignee={t.assigneeId ? members.get(t.assigneeId) ?? null : null}
                      progress={progressOf?.(t) ?? null}
                      onOpen={() => actions.open(t)}
                      onToggleDone={() => actions.toggleDone(t)}
                    />
                  </TaskContextMenu>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
