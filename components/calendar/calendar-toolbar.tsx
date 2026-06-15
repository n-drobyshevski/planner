"use client";

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
  Minimize2,
  Keyboard,
} from "lucide-react";
import { useTranslations } from "next-intl";
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
import { ToolbarSlot } from "@/components/toolbar-slots";
import { MobileAccountSection } from "@/components/mobile-account-section";
import { useAccountSwitch } from "@/components/account-switch";
import type { CalendarView } from "@/lib/types";
import type { Member } from "@/lib/types";
import type { WorkspaceData } from "@/lib/hooks/use-workspace";

const VIEW_OPTIONS: { value: CalendarView; labelKey: string }[] = [
  { value: "agenda", labelKey: "views.agenda" },
  { value: "day", labelKey: "views.day" },
  { value: "3day", labelKey: "views.threeDay" },
  { value: "week", labelKey: "views.week" },
  { value: "month", labelKey: "views.month" },
];

/**
 * Calendar controls, portaled into the shared surface header (SurfaceChrome
 * owns the <header>, AppNav, swipe, and the desktop user menu). One responsive
 * sequence: desktop shows sidebar toggle · brand · period nav · label · view
 * switcher · actions; below `md` everything but Filters, the label, New and
 * the `⋯` menu hides, and the collapsed controls live in the `⋯` menu.
 */
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
  const t = useTranslations("calendar");
  const current = workspace?.currentMember ?? null;
  const timeGridView = view === "day" || view === "week" || view === "3day";
  const hourPx = useUiStore((s) => s.hourPx);
  const setHourPx = useUiStore((s) => s.setHourPx);
  // The reset affordance only makes sense in the timed grid, and only once the
  // user has actually zoomed away from the default scale.
  const zoomed = timeGridView && hourPx !== DEFAULT_HOUR_PX;

  return (
    <>
      <ToolbarSlot name="leading">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("toolbar.toggleSidebar")}
          title={t("toolbar.toggleSidebarTitle")}
          onClick={onToggleSidebar}
          className="hidden md:inline-flex"
        >
          <PanelLeft />
        </Button>
        <div className="hidden items-center gap-2 md:flex">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <CalendarDays className="size-4" />
          </span>
          <span className="hidden font-heading text-sm font-semibold lg:inline">
            {workspace?.workspaceName ?? "Planner"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("toolbar.filters")}
          onClick={onOpenFilters}
          className="md:hidden"
        >
          <SlidersHorizontal />
        </Button>
      </ToolbarSlot>

      <ToolbarSlot name="center">
        <Button
          variant="outline"
          size="sm"
          onClick={onToday}
          className="hidden md:inline-flex"
        >
          {t("toolbar.today")}
        </Button>
        <div className="hidden items-center md:flex">
          <Button variant="ghost" size="icon" aria-label={t("toolbar.previous")} onClick={onPrev}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon" aria-label={t("toolbar.next")} onClick={onNext}>
            <ChevronRight />
          </Button>
        </div>
        <h2 className="ml-1 min-w-0 flex-1 truncate font-heading text-base font-semibold sm:text-lg">
          {label}
        </h2>
      </ToolbarSlot>

      <ToolbarSlot name="trailing">
        {zoomed && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("toolbar.resetZoom")}
            title={t("toolbar.resetZoomTitle")}
            onClick={() => setHourPx(DEFAULT_HOUR_PX)}
            className="hidden md:inline-flex"
          >
            <Minimize2 />
          </Button>
        )}
        <div className="hidden md:contents">
          <ViewSwitcher view={view} onViewChange={onViewChange} />
        </div>
        <Button size="sm" onClick={onNewEvent} className="hidden md:inline-flex">
          <Plus data-icon="inline-start" />
          {t("toolbar.new")}
        </Button>
        <Button
          size="icon"
          aria-label={t("toolbar.newEvent")}
          onClick={onNewEvent}
          className="md:hidden"
        >
          <Plus />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("toolbar.toggleTasksPanel")}
          title={t("toolbar.toggleTasksPanelTitle")}
          aria-pressed={backlogOpen}
          onClick={onToggleBacklog}
          className={cn(
            "hidden md:inline-flex",
            backlogOpen && "bg-accent text-accent-foreground",
          )}
        >
          <PanelRight />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("toolbar.keyboardShortcuts")}
          title={t("toolbar.keyboardShortcutsTitle")}
          onClick={onOpenShortcuts}
          className="hidden md:inline-flex"
        >
          <Keyboard />
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
      </ToolbarSlot>
    </>
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
  const t = useTranslations("calendar");
  const timeGridView = view === "day" || view === "week" || view === "3day";
  const hourPx = useUiStore((s) => s.hourPx);
  const setHourPx = useUiStore((s) => s.setHourPx);
  const zoomed = timeGridView && hourPx !== DEFAULT_HOUR_PX;
  const { switchable, onSelectSwitch, pending, dialog } = useAccountSwitch();

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("toolbar.moreOptions")}
          className="md:hidden"
        >
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={onToday}>
          <CalendarCheck data-icon="inline-start" />
          {t("toolbar.today")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPrev}>
          <ChevronLeft data-icon="inline-start" />
          {t("toolbar.previous")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onNext}>
          <ChevronRight data-icon="inline-start" />
          {t("toolbar.next")}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("toolbar.viewLabel")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={view}
          onValueChange={(v) => onViewChange(v as CalendarView)}
        >
          {/* Week needs 7 columns it can't get on a phone — the shell coerces it
              to 3-day there, so it isn't offered in the mobile menu. */}
          {VIEW_OPTIONS.filter((o) => o.value !== "week").map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {t(o.labelKey)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={backlogOpen}
          onCheckedChange={() => onToggleBacklog()}
        >
          {t("toolbar.tasksPanel")}
        </DropdownMenuCheckboxItem>

        {zoomed && (
          <DropdownMenuItem onClick={() => setHourPx(DEFAULT_HOUR_PX)}>
            <Minimize2 data-icon="inline-start" />
            {t("toolbar.resetZoom")}
          </DropdownMenuItem>
        )}

        <MobileAccountSection
          current={current}
          switchable={switchable}
          onSelectSwitch={onSelectSwitch}
          pending={pending}
        />
      </DropdownMenuContent>
    </DropdownMenu>
    {dialog}
    </>
  );
}
