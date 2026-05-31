"use client";

import { Plus, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AppNav } from "@/components/app-nav";
import { ToolbarUserMenu } from "@/components/toolbar-user-menu";
import type { Member } from "@/lib/types";

export type TasksView = "board" | "list";

export function TasksToolbar({
  view,
  onViewChange,
  onNewTask,
  currentMember,
}: {
  view: TasksView;
  onViewChange: (v: TasksView) => void;
  onNewTask: () => void;
  currentMember: Member | null;
}) {
  return (
    <header className="flex items-center gap-2 border-b px-3 py-2 sm:px-4">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ListChecks className="size-4" />
        </span>
        <span className="hidden font-heading text-sm font-semibold lg:inline">
          Tasks
        </span>
      </div>
      <AppNav />

      <div className="ml-auto flex items-center gap-2">
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && onViewChange(v as TasksView)}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="board">Board</ToggleGroupItem>
          <ToggleGroupItem value="list">List</ToggleGroupItem>
        </ToggleGroup>
        <Button size="sm" onClick={onNewTask}>
          <Plus data-icon="inline-start" />
          <span className="hidden sm:inline">New task</span>
        </Button>
        <ToolbarUserMenu current={currentMember} />
      </div>
    </header>
  );
}
