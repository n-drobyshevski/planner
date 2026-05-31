"use client";

import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarHeart,
  PanelLeft,
  PanelRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ViewSwitcher } from "./view-switcher";
import { AppNav } from "@/components/app-nav";
import { ToolbarUserMenu } from "@/components/toolbar-user-menu";
import type { CalendarView } from "@/lib/types";
import type { WorkspaceData } from "@/lib/hooks/use-workspace";

export function CalendarToolbar({
  view,
  label,
  onPrev,
  onNext,
  onToday,
  onViewChange,
  onNewEvent,
  onToggleSidebar,
  onToggleBacklog,
  backlogOpen,
  workspace,
}: {
  view: CalendarView;
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (v: CalendarView) => void;
  onNewEvent: () => void;
  onToggleSidebar: () => void;
  onToggleBacklog: () => void;
  backlogOpen: boolean;
  workspace: WorkspaceData | null;
}) {
  const current = workspace?.currentMember ?? null;

  return (
    <header className="flex items-center gap-2 border-b px-3 py-2 sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle sidebar"
        onClick={onToggleSidebar}
      >
        <PanelLeft />
      </Button>
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <CalendarHeart className="size-4" />
        </span>
        <span className="hidden font-heading text-sm font-semibold lg:inline">
          {workspace?.workspaceName ?? "Planner"}
        </span>
      </div>
      <AppNav />

      <Button variant="outline" size="sm" onClick={onToday}>
        Today
      </Button>
      <div className="flex items-center">
        <Button variant="ghost" size="icon" aria-label="Previous" onClick={onPrev}>
          <ChevronLeft />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Next" onClick={onNext}>
          <ChevronRight />
        </Button>
      </div>
      <h2 className="ml-1 min-w-0 truncate font-heading text-base font-semibold sm:text-lg">
        {label}
      </h2>

      <div className="ml-auto flex items-center gap-2">
        <ViewSwitcher view={view} onViewChange={onViewChange} />
        <Button size="sm" onClick={onNewEvent}>
          <Plus data-icon="inline-start" />
          <span className="hidden sm:inline">New</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle tasks panel"
          aria-pressed={backlogOpen}
          onClick={onToggleBacklog}
          className={cn(backlogOpen && "bg-accent text-accent-foreground")}
        >
          <PanelRight />
        </Button>
        <ToolbarUserMenu current={current} />
      </div>
    </header>
  );
}
