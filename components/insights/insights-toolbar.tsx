"use client";

import { MoreVertical } from "lucide-react";
import { useTranslations } from "next-intl";
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

const GRANULARITIES: Granularity[] = ["day", "week", "month"];

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
  const t = useTranslations("insights");
  const choices = granularityChoices(period.window);

  return (
    <>
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
          aria-label={t("toolbar.bucketSize")}
        >
          {GRANULARITIES.map((g) => (
            <ToggleGroupItem key={g} value={g} disabled={!choices.includes(g)}>
              {t(`toolbar.granularity.${g}`)}
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
  const t = useTranslations("insights");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("toolbar.moreOptions")}
          className="size-11 sm:size-8 md:hidden"
        >
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("toolbar.bucketSize")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={granularity}
          onValueChange={(v) => v && onGranularityChange(v as Granularity)}
        >
          {GRANULARITIES.map((g) => (
            <DropdownMenuRadioItem key={g} value={g} disabled={!choices.includes(g)}>
              {t(`toolbar.granularity.${g}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <MobileAccountSection current={current} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
