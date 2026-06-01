"use client";

import { CalendarPlus, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { Member, TaskRow } from "@/lib/types";

interface BacklogProps {
  tasks: TaskRow[];
  colorOf: (t: TaskRow) => string;
  members: Map<string, Member>;
  onSchedule: (t: TaskRow) => void;
}

/**
 * The list of open tasks, shared by the desktop rail and the mobile sheet. On
 * desktop the cards are HTML5 drag sources (drop on the grid to schedule); on
 * touch, dragging onto a grid is impractical, so the per-card Schedule button
 * is the (only) path and the grip/drag affordance is dropped.
 */
function BacklogList({
  tasks,
  colorOf,
  members,
  onSchedule,
  draggable,
}: BacklogProps & { draggable: boolean }) {
  if (tasks.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-xs text-muted-foreground">
        No open tasks. Everything&apos;s scheduled or done. 🎉
      </p>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
      {tasks.map((t) => {
        const assignee = t.assigneeId ? members.get(t.assigneeId) ?? null : null;
        return (
          <div
            key={t.id}
            draggable={draggable}
            onDragStart={
              draggable
                ? (e) => {
                    e.dataTransfer.setData("text/task-id", t.id);
                    e.dataTransfer.setData("text/plain", t.title);
                    e.dataTransfer.effectAllowed = "copy";
                  }
                : undefined
            }
            style={{ borderInlineStartColor: colorOf(t) }}
            className={cn(
              "group flex min-h-11 items-center gap-1.5 rounded-md border border-l-4 bg-card p-2 text-sm shadow-soft md:min-h-0",
              draggable && "cursor-grab active:cursor-grabbing",
            )}
          >
            {draggable && (
              <GripVertical className="size-4 shrink-0 text-muted-foreground/40" />
            )}
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
              className="size-8 shrink-0"
              aria-label={`Schedule ${t.title}`}
              onClick={() => onSchedule(t)}
            >
              <CalendarPlus className="size-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

/** Desktop-only right rail. Hidden on phones (< md) — see TaskBacklogSheet. */
export function TaskBacklogRail(props: BacklogProps) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-l bg-sidebar md:flex">
      <div className="border-b px-3 py-2">
        <h3 className="font-heading text-sm font-semibold">Tasks</h3>
        <p className="text-xs text-muted-foreground">
          Drag onto the week or day grid to schedule, or use Schedule for options.
        </p>
      </div>
      <BacklogList {...props} draggable />
    </aside>
  );
}

/** Phone presentation of the backlog: a bottom sheet with tap-to-schedule. */
export function TaskBacklogSheet({
  open,
  onOpenChange,
  ...props
}: BacklogProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80dvh]">
        <SheetHeader>
          <SheetTitle>Tasks</SheetTitle>
          <SheetDescription>
            Tap Schedule to place a task on your calendar.
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-safe">
          <BacklogList {...props} draggable={false} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
