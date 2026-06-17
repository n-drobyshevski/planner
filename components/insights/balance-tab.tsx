"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bar, BarChart } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { categoryShares, categoryByBucket } from "@/lib/analytics/balance";
import { MIN_CATEGORY_RATINGS, satisfactionByCategory } from "@/lib/analytics/correlations";
import { formatDuration } from "@/lib/datetime/format";
import { usePrefersReducedMotion } from "@/lib/hooks/use-reduced-motion";
import {
  INSIGHTS_CHART_MARGIN,
  TooltipRow,
  insightsGrid,
  insightsXAxis,
  insightsYAxis,
} from "./chart-frame";
import { GoalsSection } from "./goals/goals-section";
import { SectionEmpty } from "./insights-empty";
import { bucketLabel, bucketTick, seriesFallbackLabels, seriesMeta } from "./series";
import { CHART_H, SectionLabel } from "./tab-bits";
import type { InsightsTabData } from "./insights-shell";

/**
 * Context + member balance, as a set of sections (not a standalone tab). The
 * 7→5 consolidation folds Balance into the Patterns tab, which renders these
 * inside its own grid and owns the empty state. Returns a fragment so each
 * section becomes a direct grid child (the col-span classes still apply).
 */
export function BalanceSections({ data }: { data: InsightsTabData }) {
  const t = useTranslations("insights");
  const locale = useLocale();
  const seriesLabels = seriesFallbackLabels(t);
  const reduced = usePrefersReducedMotion();
  const { period, occurrences, prevOccurrences, timeZone } = data;
  const { granularity } = period;

  const stacked = useMemo(
    () => categoryByBucket(occurrences, period.buckets, 5),
    [occurrences, period.buckets],
  );
  const shares = useMemo(
    () =>
      categoryShares(occurrences, prevOccurrences, period.window, period.prevWindow),
    [occurrences, prevOccurrences, period],
  );
  // Satisfaction lens: duration-weighted mean per category, gated on n in the
  // analytics layer so a single 5-star outing can't crown a context.
  const satisfaction = useMemo(
    () => satisfactionByCategory(occurrences, period.window),
    [occurrences, period.window],
  );

  const total = useMemo(
    () => shares.reduce((s, r) => s + r.ms, 0),
    [shares],
  );
  // Tracked ms per category over the focused window, for the goals section.
  const actualByCategory = useMemo(
    () => new Map<string | null, number>(shares.map((s) => [s.categoryId, s.ms])),
    [shares],
  );
  // The host tab (Patterns) owns the empty state; when Patterns has tracked
  // time these always do too, so there's simply nothing to add at zero.
  if (total === 0) return null;

  const stackedRows = stacked.rows.map((r) => ({
    key: String(r.start),
    full: bucketLabel({ start: r.start, end: r.end }, granularity, timeZone, locale),
    ...r.byKey,
  }));
  const stackedConfig: ChartConfig = Object.fromEntries(
    stacked.seriesKeys.map((k) => {
      const meta = seriesMeta(k, data.categories, seriesLabels);
      return [k, { label: meta.name, color: meta.color }];
    }),
  );

  const tooltipContent = (config: ChartConfig) => (
    <ChartTooltipContent
      labelFormatter={(_l, payload) =>
        (payload?.[0]?.payload as { full?: string } | undefined)?.full ?? ""
      }
      formatter={(value, name, item) => (
        <TooltipRow
          color={item.color}
          label={config[name as string]?.label ?? name}
          value={formatDuration(Number(value), locale)}
        />
      )}
    />
  );

  return (
    <>
      <section className="space-y-1.5 lg:col-span-2">
        <SectionLabel>{t("balance.contextMix", { granularity })}</SectionLabel>
        <ChartContainer
          config={stackedConfig}
          className={`aspect-auto ${CHART_H.standard} w-full`}
          aria-label={t("balance.contextMixAria", { granularity, label: period.label })}
        >
          <BarChart data={stackedRows} margin={INSIGHTS_CHART_MARGIN}>
            {insightsGrid()}
            {insightsXAxis({
              tickFormatter: (v) => bucketTick(Number(v), granularity, timeZone, locale),
            })}
            {insightsYAxis({ tickCount: 3 })}
            <ChartTooltip cursor={false} content={tooltipContent(stackedConfig)} />
            <ChartLegend content={<ChartLegendContent />} />
            {stacked.seriesKeys.map((k, i) => (
              <Bar
                key={k}
                dataKey={k}
                stackId="mix"
                fill={`var(--color-${k})`}
                radius={i === stacked.seriesKeys.length - 1 ? [3, 3, 0, 0] : 0}
                isAnimationActive={!reduced}
              />
            ))}
          </BarChart>
        </ChartContainer>
      </section>

      <section className="space-y-1.5">
        <SectionLabel>{t("balance.shareShifts")}</SectionLabel>
        <Table className="text-xs">
          <TableCaption className="sr-only">
            {t("balance.shareShiftsCaption")}
          </TableCaption>
          <TableHeader>
            <TableRow className="text-muted-foreground hover:bg-transparent">
              <TableHead scope="col" className="h-auto px-0 py-1.5 text-muted-foreground">
                {t("balance.colContext")}
              </TableHead>
              <TableHead scope="col" className="h-auto px-0 py-1.5 text-right text-muted-foreground">
                {t("balance.colTime")}
              </TableHead>
              <TableHead scope="col" className="h-auto px-0 py-1.5 text-right text-muted-foreground">
                {t("balance.colShare")}
              </TableHead>
              <TableHead
                scope="col"
                className="hidden h-auto px-0 py-1.5 text-right text-muted-foreground sm:table-cell"
              >
                {t("balance.colPrev")}
              </TableHead>
              <TableHead scope="col" className="h-auto px-0 py-1.5 text-right text-muted-foreground">
                {t("balance.colDelta")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shares.map((s) => {
              const meta = seriesMeta(
                s.categoryId ?? "__uncategorized__",
                data.categories,
                seriesLabels,
              );
              const pts = Math.round(s.deltaShare * 100);
              return (
                <TableRow key={s.categoryId ?? "uncategorized"} className="border-border/60">
                  <TableCell className="flex items-center gap-2 px-0 py-1.5">
                    <span
                      className="size-2.5 shrink-0 rounded-[3px]"
                      style={{ background: meta.color }}
                      aria-hidden
                    />
                    <span className="truncate">{meta.name}</span>
                  </TableCell>
                  <TableCell className="px-0 py-1.5 text-right font-mono tabular-nums">
                    {formatDuration(s.ms, locale)}
                  </TableCell>
                  <TableCell className="px-0 py-1.5 text-right font-mono tabular-nums">
                    {Math.round(s.share * 100)}%
                  </TableCell>
                  <TableCell className="hidden px-0 py-1.5 text-right font-mono tabular-nums text-muted-foreground sm:table-cell">
                    {Math.round(s.prevShare * 100)}%
                  </TableCell>
                  <TableCell
                    className="px-0 py-1.5 text-right font-mono tabular-nums text-muted-foreground"
                    aria-label={
                      pts === 0
                        ? t("balance.deltaNoChange")
                        : t("balance.deltaPoints", {
                            direction: pts > 0 ? "up" : "down",
                            points: Math.abs(pts),
                          })
                    }
                  >
                    <span aria-hidden>
                      {pts > 0 ? "▲" : pts < 0 ? "▼" : "–"}{" "}
                      {pts === 0 ? "" : t("balance.pts", { points: Math.abs(pts) })}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      {data.workspaceId && data.viewerId && (
        <GoalsSection data={data} actualByCategory={actualByCategory} />
      )}

      <section className="space-y-1.5">
        <SectionLabel>{t("balance.satisfactionByContext")}</SectionLabel>
        {satisfaction.length === 0 ? (
          <SectionEmpty actionLabel={t("empty.openCalendar")} actionHref="/calendar">
            {t("balance.satisfactionEmpty", { min: MIN_CATEGORY_RATINGS })}
          </SectionEmpty>
        ) : (
          <ul className="space-y-1.5" role="list">
            {satisfaction.map(({ categoryId, agg }) => {
              const meta = seriesMeta(categoryId ?? "__uncategorized__", data.categories, seriesLabels);
              const pct = (agg.mean / 5) * 100;
              return (
                <li key={categoryId ?? "uncategorized"} className="flex items-center gap-2 text-xs">
                  <span
                    className="size-2.5 shrink-0 rounded-[3px]"
                    style={{ background: meta.color }}
                    aria-hidden
                  />
                  <span className="w-28 min-w-0 truncate sm:w-36">{meta.name}</span>
                  <span
                    className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                    role="img"
                    aria-label={t("balance.satisfactionAria", {
                      name: meta.name,
                      mean: agg.mean.toFixed(1),
                      n: agg.n,
                    })}
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${pct}%`, background: meta.color }}
                    />
                  </span>
                  <span className="w-12 text-right font-mono tabular-nums">
                    {agg.mean.toFixed(1)}/5
                  </span>
                  <span className="w-10 text-right font-mono tabular-nums text-muted-foreground/70">
                    n {agg.n}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

    </>
  );
}
