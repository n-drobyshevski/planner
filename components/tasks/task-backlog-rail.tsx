"use client";

import { CalendarPlus, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Member, TaskRow } from "@/lib/types";

/**
 * A right-side rail of open (not-done) top-level tasks. Each card is an HTML5
 * drag source — drop it on the week/day grid to schedule a default block — and
 * has a Schedule button for the precise dialog (split / subtasks).
 */
export function TaskBacklogRail({
  tasks,
  colorOf,
  members,
  onSchedule,
}: {
  tasks: TaskRow[];
  colorOf: (t: TaskRow) => string;
  members: Map<string, Member>;
  onSchedule: (t: TaskRow) => void;
}) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-l bg-sidebar">
      <div className="border-b px-3 py-2">
        <h3 className="font-heading text-sm font-semibold">Tasks</h3>
        <p className="text-xs text-muted-foreground">
          Drag onto the week or day grid to schedule, or use Schedule for options.
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
        {tasks.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            No open tasks. Everything&apos;s scheduled or done. 🎉
          </p>
        ) : (
          tasks.map((t) => {
            const assignee = t.assigneeId ? members.get(t.assigneeId) ?? null : null;
            return (
              <div
                key={t.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/task-id", t.id);
                  e.dataTransfer.setData("text/plain", t.title);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                style={{ borderInlineStartColor: colorOf(t) }}
                className="group flex cursor-grab items-center gap-1.5 rounded-md border border-l-4 bg-card p-2 text-sm shadow-soft active:cursor-grabbing"
              >
                <GripVertical className="size-4 shrink-0 text-muted-foreground/40" />
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                {assignee && (
                  <Avatar className="size-5 shrink-0" title={assignee.name}>
                    <AvatarFallback
                      style={{ backgroundColor: assignee.color, color: "#fff" }}
                      className="text-[9px] font-semibold"
                    >
                      {assignee.name.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  aria-label={`Schedule ${t.title}`}
                  onClick={() => onSchedule(t)}
                >
                  <CalendarPlus className="size-4" />
                </Button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
