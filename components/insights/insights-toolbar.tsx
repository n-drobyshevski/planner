"use client";

import { ChartColumnBig, MoreVertical } from "lucide-react";
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
import { PeriodSelector } from "./period-selector";
import { granularityChoices, type Granularity, type PeriodState, type ResolvedPeriod } from "@/lib/insights/period";
import type { Member } from "@/lib/types";

const GRANULARITY_LABELS: Record<Granularity, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
};

/**
 * Insights controls, portaled into the shared surface header (SurfaceChrome
 * owns the <header>, AppNav, swipe, and the desktop user menu): period
 * selector · bucket granularity · filters. Below `md` the granularity toggle
 * and profile actions collapse into the `⋯` menu so the row never overflows a
 * phone; the period selector stays put — it's the view's main control.
 */
export function InsightsToolbar({
  state,
  period,
  timeZone,
  onPeriodChange,
  onGranularityChange,
  currentMember,
  viewsSlot,
  filtersSlot,
}: {
  state: PeriodState;
  period: ResolvedPeriod;
  timeZone: string;
  onPeriodChange: (next: PeriodState) => void;
  onGranularityChange: (g: Granularity) => void;
  currentMember: Member | null;
  /** the saved-views trigger (popover), injected by the shell */
  viewsSlot?: React.ReactNode;
  /** the filters trigger (popover/sheet), injected by the shell */
  filtersSlot?: React.ReactNode;
}) {
  const choices = granularityChoices(period.window);

  return (
    <>
      <ToolbarSlot name="leading">
        <span className="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground md:flex">
          <ChartColumnBig className="size-4" />
        </span>
      </ToolbarSlot>
      <ToolbarSlot name="center">
        <PeriodSelector
          state={state}
          period={period}
          timeZone={timeZone}
          onChange={onPeriodChange}
        />
      </ToolbarSlot>
      <ToolbarSlot name="trailing">
        <ToggleGroup
          type="single"
          value={period.granularity}
          onValueChange={(v) => v && onGranularityChange(v as Granularity)}
          variant="outline"
          size="sm"
          className="hidden md:flex"
          aria-label="Bucket size"
        >
          {(Object.keys(GRANULARITY_LABELS) as Granularity[]).map((g) => (
            <ToggleGroupItem key={g} value={g} disabled={!choices.includes(g)}>
              {GRANULARITY_LABELS[g]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {viewsSlot}
        {filtersSlot}
        <InsightsMobileMenu
          granularity={period.granularity}
          choices={choices}
          onGranularityChange={onGranularityChange}
          current={currentMember}
        />
      </ToolbarSlot>
    </>
  );
}

/** Phone-only overflow menu: granularity plus profile / settings / sign-out. */
function InsightsMobileMenu({
  granularity,
  choices,
  onGranularityChange,
  current,
}: {
  granularity: Granularity;
  choices: Granularity[];
  onGranularityChange: (g: Granularity) => void;
  current: Member | null;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="More options"
          className="size-11 sm:size-8 md:hidden"
        >
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Bucket size</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={granularity}
          onValueChange={(v) => v && onGranularityChange(v as Granularity)}
        >
          {(Object.keys(GRANULARITY_LABELS) as Granularity[]).map((g) => (
            <DropdownMenuRadioItem key={g} value={g} disabled={!choices.includes(g)}>
              {GRANULARITY_LABELS[g]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <MobileAccountSection current={current} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
