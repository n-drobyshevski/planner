"use client";

import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  ComposedChart,
  Line,
  LineChart,
  ReferenceDot,
  XAxis,
  YAxis,
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
import { StatCard, StatGrid } from "./stat-card";
import { ChartCard } from "./chart-card";
import { DayDetailSheet } from "./day-detail-sheet";
import { InsightsEmpty } from "./insights-empty";
import { bucketLabel, bucketTick, seriesMeta } from "./series";
import { CHART_H, SectionLabel, TabGrid, srPercent } from "./tab-bits";
import type { InsightsTabData } from "./insights-shell";

export function TrendsTab({ data }: { data: InsightsTabData }) {
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
      full: bucketLabel({ start: b.start, end: b.end }, granularity, timeZone),
    }));
  }, [buckets, granularity, timeZone]);

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
        full: bucketLabel({ start: r.start, end: r.end }, granularity, timeZone),
        ...r.byKey,
      })),
    [catTrend, granularity, timeZone],
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
        title="Nothing to chart over time"
        description="Timed events in this period will appear here as a trend across days, weeks, or months."
      />
    );

  const totalConfig: ChartConfig = {
    ms: { label: "Tracked", color: "var(--chart-1)" },
    ...(granularity === "day"
      ? { avg: { label: "7-day avg", color: "var(--chart-2)" } }
      : {}),
  };
  const catConfig: ChartConfig = Object.fromEntries(
    catTrend.seriesKeys.map((k) => {
      const meta = seriesMeta(k, data.categories);
      return [k, { label: meta.name, color: meta.color }];
    }),
  );
  const catSeries = catTrend.seriesKeys.map((k) => {
    const meta = seriesMeta(k, data.categories);
    return { key: k, label: meta.name, color: meta.color };
  });

  const busiest = rows.reduce((a, b) => (b.ms > a.ms ? b : a), rows[0]);
  const trendClause =
    trend.direction === "up"
      ? " Trending up across the period."
      : trend.direction === "down"
        ? " Trending down across the period."
        : trend.direction === "flat"
          ? " Holding steady across the period."
          : "";
  const topCat = catSeries.length
    ? catSeries.reduce((a, b) =>
        (catTotals.get(b.key) ?? 0) > (catTotals.get(a.key) ?? 0) ? b : a,
      )
    : null;

  return (
    <div className="space-y-4">
      <p className="sr-only">
        {formatDuration(total)} tracked across {rows.length} {granularity} buckets.
        Busiest: {busiest.full} with {formatDuration(busiest.ms)}.
      </p>

      <TabGrid>
      <ChartCard
        id="trends-per-bucket"
        className="xl:col-span-2"
        viewerId={viewerId}
        title={`Tracked time per ${granularity}`}
        headline={`Busiest ${granularity}: ${busiest.full} (${formatDuration(busiest.ms)}).${trendClause}`}
        chartTypes={["bar", "line", "area"]}
        footnote={
          granularity === "day"
            ? "Curve: trailing 7-day average · tap a day for detail"
            : undefined
        }
      >
        {(settings) => (
          <ChartContainer
            config={totalConfig}
            className={`aspect-auto ${CHART_H.standard} w-full`}
            aria-label={`Tracked time per ${granularity}, ${period.label}`}
          >
            <ComposedChart
              data={rows}
              margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
              onClick={(state) => {
                if (granularity !== "day") return;
                const label = (state as { activeLabel?: string } | null)?.activeLabel;
                if (label) setDetailDay(Number(label));
              }}
            >
              <XAxis
                dataKey="key"
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                minTickGap={24}
                interval="preserveStartEnd"
                tickFormatter={(v: string) => bucketTick(Number(v), granularity, timeZone)}
              />
              <YAxis hide domain={[0, "dataMax"]} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_l, payload) =>
                      (payload?.[0]?.payload as { full?: string } | undefined)?.full ?? ""
                    }
                    formatter={(value, name, item) => (
                      <div className="flex w-full items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="size-2 shrink-0 rounded-[2px]"
                            style={{ background: item.color }}
                          />
                          {totalConfig[name as string]?.label ?? name}
                        </span>
                        <span className="font-mono tabular-nums">
                          {formatDuration(Number(value))}
                        </span>
                      </div>
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
          <SectionLabel>Momentum</SectionLabel>
          <StatGrid>
            {streak && (
              <StatCard
                label="Current streak"
                value={`${streak.current} ${streak.current === 1 ? "day" : "days"}`}
                hint="ending at the period's last day"
              />
            )}
            {streak && (
              <StatCard
                label="Longest streak"
                value={`${streak.longest} ${streak.longest === 1 ? "day" : "days"}`}
                hint="consecutive days with tracked time"
              />
            )}
            {steadiness !== null && (
              <StatCard
                label="Consistency"
                value={`${Math.round(steadiness * 100)}%`}
                hint="days near your typical load"
              />
            )}
            {/* Theil–Sen slope of the day series — the steady drift behind the
                "trending up/down" verdict, as a per-day figure. */}
            {trend.direction !== null && trend.slopeMsPerBucket !== null && (
              <StatCard
                label="Trend rate"
                value={
                  trend.direction === "flat"
                    ? "Level"
                    : `${trend.slopeMsPerBucket > 0 ? "+" : "−"}${formatDuration(
                        Math.abs(trend.slopeMsPerBucket),
                      )}`
                }
                hint={trend.direction === "flat" ? "holding steady" : "per day, typical drift"}
              />
            )}
          </StatGrid>
          {anomalies.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {anomalies.map((a) => (
                <li
                  key={a.dayMs}
                  className="flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs"
                >
                  <span className="text-muted-foreground">
                    {a.direction === "high" ? "Unusually heavy" : "Unusually light"}:
                  </span>
                  <span>{formatWeekdayDayMonth(a.dayMs, timeZone)}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {formatDuration(a.ms)}
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
          title="By context over time"
          headline={
            topCat
              ? `${topCat.label} leads with ${formatDuration(catTotals.get(topCat.key) ?? 0)} (${srPercent(catTotals.get(topCat.key) ?? 0, total)} of tracked time).`
              : undefined
          }
          series={catSeries}
          table={
            <Table className="text-xs">
              <TableCaption className="sr-only">
                Total tracked time per context for {period.label}
              </TableCaption>
              <TableHeader>
                <TableRow className="text-muted-foreground hover:bg-transparent">
                  <TableHead scope="col" className="h-auto px-0 py-1.5 text-muted-foreground">
                    Context
                  </TableHead>
                  <TableHead scope="col" className="h-auto px-0 py-1.5 text-right text-muted-foreground">
                    Time
                  </TableHead>
                  <TableHead scope="col" className="h-auto px-0 py-1.5 text-right text-muted-foreground">
                    Share
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catTrend.seriesKeys.map((k) => {
                  const meta = seriesMeta(k, data.categories);
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
                        {formatDuration(ms)}
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
              aria-label={`Tracked time per context per ${granularity}, top ${Math.min(5, catTrend.seriesKeys.length)} contexts`}
            >
              <LineChart data={catRows} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <XAxis
                  dataKey="key"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  minTickGap={24}
                  interval="preserveStartEnd"
                  tickFormatter={(v: string) =>
                    bucketTick(Number(v), granularity, timeZone)
                  }
                />
                <YAxis hide domain={[0, "dataMax"]} />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_l, payload) =>
                        (payload?.[0]?.payload as { full?: string } | undefined)?.full ??
                        ""
                      }
                      formatter={(value, name, item) => (
                        <div className="flex w-full items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="size-2 shrink-0 rounded-[2px]"
                              style={{ background: item.color }}
                            />
                            {catConfig[name as string]?.label ?? name}
                          </span>
                          <span className="font-mono tabular-nums">
                            {formatDuration(Number(value))}
                          </span>
                        </div>
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
    </div>
  );
}
