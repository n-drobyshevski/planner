"use client";

import Link from "next/link";
import { ChartColumnBig, MoreVertical, Settings, LogOut } from "lucide-react";
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
import { PeriodSelector } from "./period-selector";
import { granularityChoices, type Granularity, type PeriodState, type ResolvedPeriod } from "@/lib/insights/period";
import type { Member } from "@/lib/types";

const GRANULARITY_LABELS: Record<Granularity, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
};

/**
 * Top bar of /insights: nav · period selector · bucket granularity · filters ·
 * user menu. Below `md` the granularity toggle and profile actions collapse
 * into the `⋯` menu so the row never overflows a phone (mirrors the tasks
 * toolbar); the period selector stays put — it's the view's main control.
 */
export function InsightsToolbar({
  state,
  period,
  timeZone,
  onPeriodChange,
  onGranularityChange,
  currentMember,
  filtersSlot,
}: {
  state: PeriodState;
  period: ResolvedPeriod;
  timeZone: string;
  onPeriodChange: (next: PeriodState) => void;
  onGranularityChange: (g: Granularity) => void;
  currentMember: Member | null;
  /** the filters trigger (popover/sheet), injected by the shell */
  filtersSlot?: React.ReactNode;
}) {
  const choices = granularityChoices(period.window);

  return (
    <header className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b px-3 pt-safe pb-2 sm:px-4">
      <span className="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground md:flex">
        <ChartColumnBig className="size-4" />
      </span>
      <AppNav />
      <PeriodSelector
        state={state}
        period={period}
        timeZone={timeZone}
        onChange={onPeriodChange}
      />

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
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
        {filtersSlot}
        <div className="hidden items-center gap-2 md:flex">
          <ToolbarUserMenu current={currentMember} />
        </div>
        <InsightsMobileMenu
          granularity={period.granularity}
          choices={choices}
          onGranularityChange={onGranularityChange}
          current={currentMember}
        />
      </div>
    </header>
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
