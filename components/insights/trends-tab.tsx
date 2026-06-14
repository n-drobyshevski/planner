"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Area,
  Bar,
  ComposedChart,
  Line,
  LineChart,
  ReferenceDot,
} from "recharts";
import {
  ChartContainer,
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
import { bucketUsage, categoryTrends, rollingAverage } from "@/lib/analytics/trends";
import { activeStreak, bucketTrend, consistency, dayAnomalies } from "@/lib/analytics/momentum";
import { formatDuration, formatWeekdayDayMonth } from "@/lib/datetime/format";
import { usePrefersReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { deriveTrendsLede } from "@/lib/insights/ledes";
import { ChartCard } from "./chart-card";
import {
  INSIGHTS_CHART_MARGIN,
  TooltipRow,
  insightsGrid,
  insightsXAxis,
  insightsYAxis,
} from "./chart-frame";
import { InsightLede } from "./insight-lede";
import { DayDetailSheet } from "./day-detail-sheet";
import { InsightsEmpty } from "./insights-empty";
import { bucketLabel, bucketTick, seriesFallbackLabels, seriesMeta } from "./series";
import { CHART_H, Figure, Reading, SectionLabel, TabGrid, srPercent } from "./tab-bits";
import type { InsightsTabData } from "./insights-shell";

export function TrendsTab({ data }: { data: InsightsTabData }) {
  const t = useTranslations("insights");
  const locale = useLocale();
  const seriesLabels = seriesFallbackLabels(t);
  const reduced = usePrefersReducedMotion();
  const { period, occurrences, timeZone, viewerId } = data;
  const { granularity } = period;
  const [detailDay, setDetailDay] = useState<number | null>(null);

  const buckets = useMemo(
    () => bucketUsage(occurrences, period.buckets),
    [occurrences, period.buckets],
  );
  const total = useMemo(() => buckets.reduce((s, b) => s + b.ms, 0), [buckets]);

  // The rolling average overlays only at day granularity, where buckets ≡ days.
  const rows = useMemo(() => {
    const avg =
      granularity === "day"
        ? rollingAverage(
            buckets.map((b) => ({ dayMs: b.start, ms: b.ms })),
            7,
          )
        : null;
    return buckets.map((b, i) => ({
      key: String(b.start),
      ms: b.ms,
      ...(avg ? { avg: avg[i].avgMs } : {}),
      full: bucketLabel({ start: b.start, end: b.end }, granularity, timeZone, locale),
    }));
  }, [buckets, granularity, timeZone, locale]);

  // Momentum: direction over the bucket series, plus day-level streaks,
  // consistency, and unusual days (robust z over nonzero days).
  const trend = useMemo(() => bucketTrend(buckets), [buckets]);
  // Day-level momentum only at day granularity, where buckets ≡ days.
  const perDay = useMemo(
    () =>
      granularity === "day"
        ? buckets.map((b) => ({ dayMs: b.start, ms: b.ms }))
        : null,
    [buckets, granularity],
  );
  const streak = useMemo(() => (perDay ? activeStreak(perDay) : null), [perDay]);
  const steadiness = useMemo(() => (perDay ? consistency(perDay) : null), [perDay]);
  const anomalies = useMemo(() => (perDay ? dayAnomalies(perDay) : []), [perDay]);

  const catTrend = useMemo(
    () => categoryTrends(occurrences, period.buckets, 5),
    [occurrences, period.buckets],
  );
  const catRows = useMemo(
    () =>
      catTrend.rows.map((r) => ({
        key: String(r.start),
        full: bucketLabel({ start: r.start, end: r.end }, granularity, timeZone, locale),
        ...r.byKey,
      })),
    [catTrend, granularity, timeZone, locale],
  );
  const catTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of catTrend.rows) {
      for (const [k, ms] of Object.entries(r.byKey)) {
        totals.set(k, (totals.get(k) ?? 0) + ms);
      }
    }
    return totals;
  }, [catTrend]);

  if (total === 0)
    return (
      <InsightsEmpty
        title={t("trends.emptyTitle")}
        description={t("trends.emptyDescription")}
      />
    );

  const totalConfig: ChartConfig = {
    ms: { label: t("trends.seriesTracked"), color: "var(--chart-1)" },
    ...(granularity === "day"
      ? { avg: { label: t("trends.seriesAvg"), color: "var(--chart-2)" } }
      : {}),
  };
  const catConfig: ChartConfig = Object.fromEntries(
    catTrend.seriesKeys.map((k) => {
      const meta = seriesMeta(k, data.categories, seriesLabels);
      return [k, { label: meta.name, color: meta.color }];
    }),
  );
  const catSeries = catTrend.seriesKeys.map((k) => {
    const meta = seriesMeta(k, data.categories, seriesLabels);
    return { key: k, label: meta.name, color: meta.color };
  });

  const busiest = rows.reduce((a, b) => (b.ms > a.ms ? b : a), rows[0]);
  const trendClause =
    trend.direction === "up"
      ? t("trends.trendUp")
      : trend.direction === "down"
        ? t("trends.trendDown")
        : trend.direction === "flat"
          ? t("trends.trendFlat")
          : "";
  const topCat = catSeries.length
    ? catSeries.reduce((a, b) =>
        (catTotals.get(b.key) ?? 0) > (catTotals.get(a.key) ?? 0) ? b : a,
      )
    : null;

  const lede = deriveTrendsLede({
    trend,
    granularity,
    busiest: { full: busiest.full, ms: busiest.ms },
    t,
    locale,
  });

  const leadFigures = [
    { label: t("trends.totalTracked"), value: formatDuration(total, locale) },
    {
      label: t("trends.busiestGranularity", { granularity }),
      value: formatDuration(busiest.ms, locale),
      hint: busiest.full,
    },
  ];

  return (
    <Reading>
      <p className="sr-only">
        {t("trends.srSummary", {
          total: formatDuration(total, locale),
          count: rows.length,
          granularity,
          busiest: busiest.full,
          ms: formatDuration(busiest.ms, locale),
        })}
      </p>

      <InsightLede lede={lede} figures={leadFigures} />

      <TabGrid>
      <ChartCard
        id="trends-per-bucket"
        className="lg:col-span-2"
        viewerId={viewerId}
        title={t("trends.perBucketTitle", { granularity })}
        headline={t("trends.perBucketHeadline", {
          granularity,
          busiest: busiest.full,
          ms: formatDuration(busiest.ms, locale),
          trend: trendClause,
        })}
        chartTypes={["bar", "line", "area"]}
        footnote={
          [
            granularity === "day" ? t("trends.footnoteAvg") : null,
            anomalies.length > 0 ? t("trends.footnoteUnusual") : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        }
      >
        {(settings) => (
          <ChartContainer
            config={totalConfig}
            className={`aspect-auto ${CHART_H.standard} w-full`}
            aria-label={t("trends.perBucketAria", { granularity, label: period.label })}
          >
            <ComposedChart
              data={rows}
              margin={INSIGHTS_CHART_MARGIN}
              onClick={(state) => {
                if (granularity !== "day") return;
                const label = (state as { activeLabel?: string } | null)?.activeLabel;
                if (label) setDetailDay(Number(label));
              }}
            >
              {insightsGrid()}
              {insightsXAxis({
                tickFormatter: (v) => bucketTick(Number(v), granularity, timeZone, locale),
              })}
              {insightsYAxis({ tickCount: 3 })}
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_l, payload) =>
                      (payload?.[0]?.payload as { full?: string } | undefined)?.full ?? ""
                    }
                    formatter={(value, name, item) => (
                      <TooltipRow
                        color={item.color}
                        label={totalConfig[name as string]?.label ?? name}
                        value={formatDuration(Number(value), locale)}
                      />
                    )}
                  />
                }
              />
              {settings.chartType === "bar" && (
                <Bar
                  dataKey="ms"
                  fill="var(--color-ms)"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={!reduced}
                />
              )}
              {settings.chartType === "line" && (
                <Line
                  dataKey="ms"
                  type="monotone"
                  stroke="var(--color-ms)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={!reduced}
                />
              )}
              {settings.chartType === "area" && (
                <Area
                  dataKey="ms"
                  type="monotone"
                  stroke="var(--color-ms)"
                  fill="var(--color-ms)"
                  fillOpacity={0.25}
                  strokeWidth={2}
                  isAnimationActive={!reduced}
                />
              )}
              {granularity === "day" && (
                <Line
                  dataKey="avg"
                  type="monotone"
                  stroke="var(--color-avg)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={!reduced}
                />
              )}
              {anomalies.map((a) => (
                <ReferenceDot
                  key={a.dayMs}
                  x={String(a.dayMs)}
                  y={a.ms}
                  r={4}
                  fill="var(--card)"
                  stroke="var(--color-ms)"
                  strokeWidth={2}
                />
              ))}
            </ComposedChart>
          </ChartContainer>
        )}
      </ChartCard>

      {perDay &&
        (streak ||
          steadiness !== null ||
          anomalies.length > 0 ||
          trend.direction !== null) && (
        <section className="space-y-1.5">
          <SectionLabel>{t("trends.momentum")}</SectionLabel>
          <dl className="flex flex-wrap gap-x-6 gap-y-2">
            {streak && (
              <Figure
                label={t("trends.currentStreak")}
                value={t("trends.days", { count: streak.current })}
              />
            )}
            {streak && (
              <Figure
                label={t("trends.longestStreak")}
                value={t("trends.days", { count: streak.longest })}
              />
            )}
            {steadiness !== null && (
              <Figure label={t("trends.consistency")} value={`${Math.round(steadiness * 100)}%`} />
            )}
            {/* Theil–Sen slope of the day series — the steady drift behind the
                "trending up/down" verdict, as a per-day figure. */}
            {trend.direction !== null && trend.slopeMsPerBucket !== null && (
              <Figure
                label={t("trends.trendRate")}
                value={
                  trend.direction === "flat"
                    ? t("trends.level")
                    : t("trends.trendRatePerDay", {
                        sign: trend.slopeMsPerBucket > 0 ? "+" : "−",
                        ms: formatDuration(Math.abs(trend.slopeMsPerBucket), locale),
                      })
                }
              />
            )}
          </dl>
          {anomalies.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {anomalies.map((a) => (
                <li
                  key={a.dayMs}
                  className="flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs"
                >
                  <span className="text-muted-foreground">
                    {a.direction === "high" ? t("trends.unusuallyHeavy") : t("trends.unusuallyLight")}
                  </span>
                  <span>{formatWeekdayDayMonth(a.dayMs, timeZone, locale)}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {formatDuration(a.ms, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {catTrend.seriesKeys.length > 0 && (
        <ChartCard
          id="trends-by-context"
          viewerId={viewerId}
          title={t("trends.byContextTitle")}
          headline={
            topCat
              ? t("trends.byContextHeadline", {
                  name: topCat.label,
                  ms: formatDuration(catTotals.get(topCat.key) ?? 0, locale),
                  pct: srPercent(catTotals.get(topCat.key) ?? 0, total),
                })
              : undefined
          }
          series={catSeries}
          table={
            <Table className="text-xs">
              <TableCaption className="sr-only">
                {t("trends.tableCaption", { label: period.label })}
              </TableCaption>
              <TableHeader>
                <TableRow className="text-muted-foreground hover:bg-transparent">
                  <TableHead scope="col" className="h-auto px-0 py-1.5 text-muted-foreground">
                    {t("trends.colContext")}
                  </TableHead>
                  <TableHead scope="col" className="h-auto px-0 py-1.5 text-right text-muted-foreground">
                    {t("trends.colTime")}
                  </TableHead>
                  <TableHead scope="col" className="h-auto px-0 py-1.5 text-right text-muted-foreground">
                    {t("trends.colShare")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catTrend.seriesKeys.map((k) => {
                  const meta = seriesMeta(k, data.categories, seriesLabels);
                  const ms = catTotals.get(k) ?? 0;
                  return (
                    <TableRow key={k} className="border-border/60">
                      <TableCell className="flex items-center gap-2 px-0 py-1.5">
                        <span
                          className="size-2.5 shrink-0 rounded-[3px]"
                          style={{ background: meta.color }}
                          aria-hidden
                        />
                        <span className="truncate">{meta.name}</span>
                      </TableCell>
                      <TableCell className="px-0 py-1.5 text-right font-mono tabular-nums">
                        {formatDuration(ms, locale)}
                      </TableCell>
                      <TableCell className="px-0 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                        {srPercent(ms, total)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          }
        >
          {(settings) => (
            <ChartContainer
              config={catConfig}
              className={`aspect-auto ${CHART_H.standard} w-full`}
              aria-label={t("trends.byContextAria", {
                granularity,
                count: Math.min(5, catTrend.seriesKeys.length),
              })}
            >
              <LineChart data={catRows} margin={INSIGHTS_CHART_MARGIN}>
                {insightsGrid()}
                {insightsXAxis({
                  tickFormatter: (v) => bucketTick(Number(v), granularity, timeZone, locale),
                })}
                {insightsYAxis({ tickCount: 3 })}
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_l, payload) =>
                        (payload?.[0]?.payload as { full?: string } | undefined)?.full ??
                        ""
                      }
                      formatter={(value, name, item) => (
                        <TooltipRow
                          color={item.color}
                          label={catConfig[name as string]?.label ?? name}
                          value={formatDuration(Number(value), locale)}
                        />
                      )}
                    />
                  }
                />
                {catTrend.seriesKeys
                  .filter((k) => !settings.hiddenSeries.has(k))
                  .map((k) => (
                    <Line
                      key={k}
                      dataKey={k}
                      type="monotone"
                      stroke={`var(--color-${k})`}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={!reduced}
                    />
                  ))}
              </LineChart>
            </ChartContainer>
          )}
        </ChartCard>
      )}
      </TabGrid>

      <DayDetailSheet
        dayMs={detailDay}
        onClose={() => setDetailDay(null)}
        data={data}
      />
    </Reading>
  );
}
