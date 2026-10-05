"use client";

// Drill-down detail for a single day, opened by clicking a per-day bar or
// heatmap cell. Shows the same insights-filtered slice the chart was drawn
// from (so the numbers always reconcile with the bar that was clicked), plus
// a calendar deep link for acting on what's found.

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { ATTRIBUTE_META } from "@/lib/attributes/schema";
import { formatDuration, formatTime, toDateParam } from "@/lib/datetime/format";
import {
  buildDayDetail,
  clippedMs,
  formatDayDetailTitle,
} from "@/lib/insights/view-selectors";
import { seriesFallbackLabels, seriesMeta } from "./series";
import type { InsightsTabData } from "./insights-shell";
import type { Occurrence } from "@/lib/types";

/** Compact attribute chips, e.g. "Energy: 2 Steady · Focus: Deep". `ta` is the
 *  `common` translator (attribute labels/options live there, shared with the editor). */
function attributeChips(
  o: Occurrence,
  ta: (key: string) => string,
): string[] {
  const chips: string[] = [];
  for (const meta of ATTRIBUTE_META) {
    const value = o.attributes[meta.key];
    if (value === undefined) continue;
    const optLabel = ta(`attributes.${meta.key}.options.${String(value)}`);
    chips.push(`${ta(`attributes.${meta.key}.label`)}: ${optLabel}`);
  }
  return chips;
}

export function DayDetailSheet({
  dayMs,
  onClose,
  data,
}: {
  /** Start-of-day ms in the viewer's zone; null = closed. */
  dayMs: number | null;
  onClose: () => void;
  data: InsightsTabData;
}) {
  const t = useTranslations("insights");
  const ta = useTranslations("common");
  const locale = useLocale();
  const seriesLabels = seriesFallbackLabels(t);
  const { period, occurrences, categories, timeZone } = data;

  const day = useMemo(
    () => (dayMs === null ? null : buildDayDetail(dayMs, period, occurrences)),
    [dayMs, period, occurrences],
  );

  return (
    <ResponsiveDialog open={dayMs !== null} onOpenChange={(open) => !open && onClose()}>
      <ResponsiveDialogContent className="sm:max-w-md">
        {dayMs !== null && day && (
          <>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>
                {formatDayDetailTitle(dayMs, timeZone, locale)}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {day.items.length === 0
                  ? t("dayDetail.nothingScheduled")
                  : t("dayDetail.summary", {
                      ms: formatDuration(day.totalMs, locale),
                      count: day.items.length,
                    })}
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <ResponsiveDialogBody>
              <ul className="flex flex-col gap-2" role="list">
                {day.items.map((o) => {
                  const meta = seriesMeta(o.categoryId ?? "__uncategorized__", categories, seriesLabels);
                  const chips = attributeChips(o, ta);
                  return (
                    <li
                      key={o.key}
                      className="rounded-lg border bg-card p-2.5 shadow-soft"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium">
                          {o.title}
                          {o.inactive && (
                            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                              {t("dayDetail.inactive")}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                          {o.allDay
                            ? t("dayDetail.allDay")
                            : `${formatTime(o.start, timeZone)} – ${formatTime(o.end, timeZone)}`}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ background: meta.color }}
                            aria-hidden
                          />
                          {meta.name}
                        </span>
                        <span className="font-mono tabular-nums">
                          {formatDuration(clippedMs(o, dayMs, day.dayEnd), locale)}
                        </span>
                        {chips.length > 0 && <span>· {chips.join(" · ")}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </ResponsiveDialogBody>
            <ResponsiveDialogFooter>
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/calendar?date=${toDateParam(dayMs, timeZone)}&view=day`}
                >
                  <CalendarDays aria-hidden className="size-4" />
                  {t("dayDetail.openInCalendar")}
                </Link>
              </Button>
            </ResponsiveDialogFooter>
          </>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
