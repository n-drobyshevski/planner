"use client";

import Link from "next/link";
import { Plus, ListChecks, MoreVertical, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { AppNav } from "@/components/app-nav";
import { ToolbarUserMenu } from "@/components/toolbar-user-menu";
import { signOutAction } from "@/app/login/actions";
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
  // The board switcher and app nav render once and stay put across breakpoints;
  // only the trailing controls swap. Below `md` the view toggle and the
  // profile/settings/sign-out menu collapse into the `⋯` menu so the row never
  // overflows a phone (mirrors the calendar toolbar). The quick theme toggle is
  // desktop-only here too — it lives in Settings on mobile.
  return (
    <header className="flex items-center gap-2 border-b px-3 pt-safe pb-2 sm:px-4">
      <span className="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground md:flex">
        <ListChecks className="size-4" />
      </span>
      <BoardSwitcher
        activeBoardId={activeBoardId}
        onActiveBoardChange={onBoardChange}
        taskCountByBoard={taskCountByBoard}
      />
      <AppNav />

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
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
        <div className="hidden items-center gap-2 md:flex">
          <ToolbarUserMenu current={currentMember} />
        </div>
        <TasksMobileMenu
          view={view}
          onViewChange={onViewChange}
          current={currentMember}
        />
      </div>
    </header>
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

        <DropdownMenuSeparator />
        {current && (
          <DropdownMenuLabel className="font-normal text-muted-foreground">
            Signed in as {current.name}
          </DropdownMenuLabel>
        )}
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings data-icon="inline-start" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            void signOutAction();
          }}
        >
          <LogOut data-icon="inline-start" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
