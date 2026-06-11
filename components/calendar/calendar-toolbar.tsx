"use client";

import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  CalendarCheck,
  PanelLeft,
  PanelRight,
  SlidersHorizontal,
  MoreVertical,
  Settings,
  LogOut,
  Minimize2,
  Keyboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import { DEFAULT_HOUR_PX } from "@/lib/datetime/zoom-math";
import { ViewSwitcher } from "./view-switcher";
import { AppNav } from "@/components/app-nav";
import { useSurfaceSwipe } from "@/hooks/use-surface-swipe";
import { ToolbarUserMenu } from "@/components/toolbar-user-menu";
import { signOutAction } from "@/app/login/actions";
import type { CalendarView } from "@/lib/types";
import type { Member } from "@/lib/types";
import type { WorkspaceData } from "@/lib/hooks/use-workspace";

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: "agenda", label: "Agenda" },
  { value: "day", label: "Day" },
  { value: "3day", label: "3 days" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

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
  onOpenFilters,
  onOpenShortcuts,
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
  onOpenFilters: () => void;
  onOpenShortcuts: () => void;
  backlogOpen: boolean;
  workspace: WorkspaceData | null;
}) {
  const current = workspace?.currentMember ?? null;
  const timeGridView = view === "day" || view === "week" || view === "3day";
  const hourPx = useUiStore((s) => s.hourPx);
  const setHourPx = useUiStore((s) => s.setHourPx);
  // The reset affordance only makes sense in the timed grid, and only once the
  // user has actually zoomed away from the default scale.
  const zoomed = timeGridView && hourPx !== DEFAULT_HOUR_PX;
  const surfaceSwipe = useSurfaceSwipe();

  return (
    <header
      {...surfaceSwipe}
      className="flex items-center gap-2 border-b px-3 pt-safe pb-2 sm:px-4"
    >
      {/* ---- Desktop toolbar (>= md) ---- */}
      <div className="hidden flex-1 items-center gap-2 md:flex">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle sidebar"
          title="Toggle sidebar (Ctrl+Alt+←)"
          onClick={onToggleSidebar}
        >
          <PanelLeft />
        </Button>
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <CalendarDays className="size-4" />
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
          {zoomed && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Reset zoom"
              title="Reset zoom (Ctrl+0)"
              onClick={() => setHourPx(DEFAULT_HOUR_PX)}
            >
              <Minimize2 />
            </Button>
          )}
          <ViewSwitcher view={view} onViewChange={onViewChange} />
          <Button size="sm" onClick={onNewEvent}>
            <Plus data-icon="inline-start" />
            <span className="hidden sm:inline">New</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle tasks panel"
            title="Toggle tasks panel (Ctrl+Alt+→)"
            aria-pressed={backlogOpen}
            onClick={onToggleBacklog}
            className={cn(backlogOpen && "bg-accent text-accent-foreground")}
          >
            <PanelRight />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            onClick={onOpenShortcuts}
          >
            <Keyboard />
          </Button>
          <ToolbarUserMenu current={current} />
        </div>
      </div>

      {/* ---- Mobile toolbar (< md) ---- */}
      <div className="flex flex-1 items-center gap-1 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Filters"
          onClick={onOpenFilters}
        >
          <SlidersHorizontal />
        </Button>
        <AppNav />
        <h2 className="ml-1 min-w-0 flex-1 truncate font-heading text-base font-semibold">
          {label}
        </h2>
        <Button size="icon" aria-label="New event" onClick={onNewEvent}>
          <Plus />
        </Button>
        <CalendarMobileMenu
          view={view}
          onViewChange={onViewChange}
          onToday={onToday}
          onPrev={onPrev}
          onNext={onNext}
          onToggleBacklog={onToggleBacklog}
          backlogOpen={backlogOpen}
          current={current}
        />
      </div>
    </header>
  );
}

function CalendarMobileMenu({
  view,
  onViewChange,
  onToday,
  onPrev,
  onNext,
  onToggleBacklog,
  backlogOpen,
  current,
}: {
  view: CalendarView;
  onViewChange: (v: CalendarView) => void;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleBacklog: () => void;
  backlogOpen: boolean;
  current: Member | null;
}) {
  const timeGridView = view === "day" || view === "week" || view === "3day";
  const hourPx = useUiStore((s) => s.hourPx);
  const setHourPx = useUiStore((s) => s.setHourPx);
  const zoomed = timeGridView && hourPx !== DEFAULT_HOUR_PX;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="More options">
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={onToday}>
          <CalendarCheck data-icon="inline-start" />
          Today
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPrev}>
          <ChevronLeft data-icon="inline-start" />
          Previous
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onNext}>
          <ChevronRight data-icon="inline-start" />
          Next
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>View</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={view}
          onValueChange={(v) => onViewChange(v as CalendarView)}
        >
          {/* Week needs 7 columns it can't get on a phone — the shell coerces it
              to 3-day there, so it isn't offered in the mobile menu. */}
          {VIEW_OPTIONS.filter((o) => o.value !== "week").map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={backlogOpen}
          onCheckedChange={() => onToggleBacklog()}
        >
          Tasks panel
        </DropdownMenuCheckboxItem>

        {zoomed && (
          <DropdownMenuItem onClick={() => setHourPx(DEFAULT_HOUR_PX)}>
            <Minimize2 data-icon="inline-start" />
            Reset zoom
          </DropdownMenuItem>
        )}

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
