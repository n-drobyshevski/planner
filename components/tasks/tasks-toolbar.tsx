"use client";

import { Plus, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AppNav } from "@/components/app-nav";
import { ToolbarUserMenu } from "@/components/toolbar-user-menu";
import { BoardSwitcher } from "./board-switcher";
import type { Member } from "@/lib/types";

export type TasksView = "board" | "list";

export function TasksToolbar({
  view,
  onViewChange,
  onNewTask,
  currentMember,
  activeBoardId,
  onBoardChange,
  taskCountByBoard,
}: {
  view: TasksView;
  onViewChange: (v: TasksView) => void;
  onNewTask: () => void;
  currentMember: Member | null;
  activeBoardId: string | null;
  onBoardChange: (boardId: string) => void;
  taskCountByBoard: Map<string, number>;
}) {
  return (
    <header className="flex items-center gap-2 border-b px-3 pt-safe pb-2 sm:px-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <ListChecks className="size-4" />
      </span>
      <BoardSwitcher
        activeBoardId={activeBoardId}
        onActiveBoardChange={onBoardChange}
        taskCountByBoard={taskCountByBoard}
      />
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
