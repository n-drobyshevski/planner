"use client";

import { Plus, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { ToolbarSlot } from "@/components/toolbar-slots";
import { MobileAccountSection } from "@/components/mobile-account-section";
import { BoardSwitcher } from "./board-switcher";
import type { Member } from "@/lib/types";

export type TasksView = "board" | "list";

/**
 * Tasks controls, portaled into the shared surface header (SurfaceChrome owns
 * the <header>, AppNav, swipe, and the desktop user menu). The board switcher
 * sits in the center slot — right of the AppNav mode switcher, mirroring how
 * Insights places its period selector — and stays put across breakpoints; below
 * `md` the view toggle collapses into the `⋯` menu so the row never overflows a
 * phone.
 */
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
    <>
      <ToolbarSlot name="center">
        <BoardSwitcher
          activeBoardId={activeBoardId}
          onActiveBoardChange={onBoardChange}
          taskCountByBoard={taskCountByBoard}
        />
      </ToolbarSlot>
      <ToolbarSlot name="trailing">
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && onViewChange(v as TasksView)}
          variant="outline"
          size="sm"
          className="hidden md:flex"
        >
          <ToggleGroupItem value="board">Board</ToggleGroupItem>
          <ToggleGroupItem value="list">List</ToggleGroupItem>
        </ToggleGroup>
        {/* New task: a labelled button on desktop, a square icon button below md.
            An icon-only button needs its own aria-label — a CSS-hidden label is
            dropped from the accessible name. Mirrors the calendar toolbar. */}
        <Button size="sm" onClick={onNewTask} className="hidden md:inline-flex">
          <Plus data-icon="inline-start" />
          New task
        </Button>
        <Button
          size="icon"
          aria-label="New task"
          onClick={onNewTask}
          className="md:hidden"
        >
          <Plus />
        </Button>
        <TasksMobileMenu
          view={view}
          onViewChange={onViewChange}
          current={currentMember}
        />
      </ToolbarSlot>
    </>
  );
}

/** Phone-only overflow menu: the view toggle plus profile / settings / sign-out. */
function TasksMobileMenu({
  view,
  onViewChange,
  current,
}: {
  view: TasksView;
  onViewChange: (v: TasksView) => void;
  current: Member | null;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="More options"
          className="md:hidden"
        >
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>View</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={view}
          onValueChange={(v) => v && onViewChange(v as TasksView)}
        >
          <DropdownMenuRadioItem value="board">Board</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="list">List</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <MobileAccountSection current={current} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
