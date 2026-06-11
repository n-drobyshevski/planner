"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import {
  Bar,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { computeUsage } from "@/lib/analytics/usage";
import { rollingAverage, delta } from "@/lib/analytics/trends";
import { categoryShares } from "@/lib/analytics/balance";
import { computeTaskStats } from "@/lib/analytics/task-stats";
import { formatDuration, formatWeekdayDayMonth } from "@/lib/datetime/format";
import { usePrefersReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { StatCard, StatGrid } from "./stat-card";
import { InsightsEmpty } from "./insights-empty";
import { NEUTRAL, seriesMeta } from "./series";
import { CHART_H, SectionLabel, srPercent } from "./tab-bits";
import type { InsightsTabData } from "./insights-shell";

/** Categories shown individually in the donut before collapsing into "Other". */
const TOP_CATEGORIES = 6;

export function OverviewTab({ data }: { data: InsightsTabData }) {
  const reduced = usePrefersReducedMotion();
  const { period, occurrences, prevOccurrences, tasks, timeZone, now } = data;

  const usage = useMemo(
    () =>
      computeUsage(occurrences, period.days, period.window, { includeInactive: true }),
    [occurrences, period],
  );
  const prevUsage = useMemo(
    () =>
      computeUsage(prevOccurrences, period.prevDays, period.prevWindow, {
        includeInactive: true,
      }),
    [prevOccurrences, period],
  );
  const taskStats = useMemo(
    () => computeTaskStats(tasks, period.window, now, timeZone),
    [tasks, period, now, timeZone],
  );
  const prevTaskStats = useMemo(
    () => computeTaskStats(tasks, period.prevWindow, now, timeZone),
    [tasks, period, now, timeZone],
  );

  const total = usage.summary.totalMs;
  const ctx = tz(timeZone);

  const perDayData = useMemo(() => {
    const avg = rollingAverage(usage.perDay, 7);
    return usage.perDay.map((d, i) => ({
      key: String(d.dayMs),
      ms: d.ms,
      avg: avg[i].avgMs,
      full: formatWeekdayDayMonth(d.dayMs, timeZone),
    }));
  }, [usage.perDay, timeZone]);

  const donutData = useMemo(() => {
    const rows = usage.byCategory.map((c) => {
      const meta = seriesMeta(c.categoryId ?? "__uncategorized__", data.categories);
      return { id: c.categoryId ?? "uncategorized", ...meta, ms: c.ms };
    });
    if (rows.length <= TOP_CATEGORIES) return rows;
    const head = rows.slice(0, TOP_CATEGORIES);
    const restMs = rows.slice(TOP_CATEGORIES).reduce((s, r) => s + r.ms, 0);
    return [...head, { id: "other", name: "Other", color: NEUTRAL, ms: restMs }];
  }, [usage.byCategory, data.categories]);

  // Biggest share shifts vs the previous period (only meaningful with data on
  // both sides).
  const shiftChips = useMemo(() => {
    if (total === 0 || prevUsage.summary.totalMs === 0) return [];
    return categoryShares(
      occurrences,
      prevOccurrences,
      period.window,
      period.prevWindow,
    )
      .filter((s) => Math.abs(s.deltaShare) >= 0.02)
      .sort((a, b) => Math.abs(b.deltaShare) - Math.abs(a.deltaShare))
      .slice(0, 3);
  }, [occurrences, prevOccurrences, period, total, prevUsage.summary.totalMs]);

  const perDayConfig: ChartConfig = {
    ms: { label: "Tracked", color: "var(--chart-1)" },
    avg: { label: "7-day avg", color: "var(--chart-2)" },
  };

  return (
    <div className="space-y-5">
      <StatGrid>
        <StatCard
          label="Total"
          value={formatDuration(total)}
          delta={delta(total, prevUsage.summary.totalMs)}
          emphasis
          className="col-span-2"
        />
        <StatCard
          label="Daily avg"
          value={formatDuration(usage.summary.dailyAverageMs)}
          delta={delta(usage.summary.dailyAverageMs, prevUsage.summary.dailyAverageMs)}
        />
        <StatCard
          label="Busiest day"
          value={
            usage.summary.busiestDay ? formatDuration(usage.summary.busiestDay.ms) : "—"
          }
          hint={
            usage.summary.busiestDay
              ? format(usage.summary.busiestDay.dayMs, "EEE d MMM", { in: ctx })
              : undefined
          }
        />
        <StatCard
          label="Active days"
          value={`${usage.summary.activeDays}/${period.days.length}`}
        />
        <StatCard
          label="Tasks done"
          value={String(taskStats.completedCount)}
          delta={delta(taskStats.completedCount, prevTaskStats.completedCount)}
        />
        <StatCard
          label="On time"
          value={
            taskStats.adherenceRate === null
              ? "—"
              : `${Math.round(taskStats.adherenceRate * 100)}%`
          }
          hint={taskStats.dueCount > 0 ? `${taskStats.dueCount} due` : "nothing due"}
        />
        <StatCard
          label="Overdue"
          value={String(taskStats.overdueOpenCount)}
          warning={taskStats.overdueOpenCount > 0}
          hint="open past their due day"
        />
      </StatGrid>

      {total === 0 ? (
        <InsightsEmpty />
      ) : (
        <>
          <p className="sr-only">
            {formatDuration(total)} tracked in {period.label}.
            {usage.summary.busiestDay
              ? ` Busiest day ${format(usage.summary.busiestDay.dayMs, "EEEE d MMMM", { in: ctx })} with ${formatDuration(usage.summary.busiestDay.ms)}.`
              : ""}
            {donutData[0] ? ` Most time went to ${donutData[0].name}.` : ""}
          </p>

          <section className="space-y-1.5">
            <SectionLabel>Per day</SectionLabel>
            <ChartContainer
              config={perDayConfig}
              className={`aspect-auto ${CHART_H.compact} w-full`}
              aria-label={`Tracked time per day, ${period.label}`}
            >
              <ComposedChart
                data={perDayData}
                margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
              >
                <XAxis
                  dataKey="key"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  minTickGap={24}
                  interval="preserveStartEnd"
                  tickFormatter={(value: string) =>
                    format(Number(value), "d", { in: ctx })
                  }
                />
                <YAxis hide domain={[0, "dataMax"]} />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_label, payload) =>
                        (payload?.[0]?.payload as { full?: string } | undefined)
                          ?.full ?? ""
                      }
                      formatter={(value, name, item) => (
                        <div className="flex w-full items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="size-2 shrink-0 rounded-[2px]"
                              style={{ background: item.color }}
                            />
                            {perDayConfig[name as string]?.label ?? name}
                          </span>
                          <span className="font-mono tabular-nums">
                            {formatDuration(Number(value))}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Bar
                  dataKey="ms"
                  fill="var(--color-ms)"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={!reduced}
                />
                <Line
                  dataKey="avg"
                  type="monotone"
                  stroke="var(--color-avg)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={!reduced}
                />
              </ComposedChart>
            </ChartContainer>
            <p className="text-[11px] text-muted-foreground">
              Bars: tracked time · line: trailing 7-day average
            </p>
          </section>

          <section className="space-y-2">
            <SectionLabel>By context</SectionLabel>
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <div className="relative mx-auto h-[170px] w-[170px] shrink-0 sm:mx-0">
                <ChartContainer
                  config={{}}
                  className="aspect-square h-[170px] w-full"
                  aria-label="Share of tracked time per context"
                >
                  <PieChart>
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          hideLabel
                          formatter={(value, _name, item) => {
                            const p = item.payload as { name: string; color: string };
                            return (
                              <div className="flex w-full items-center justify-between gap-3">
                                <span className="flex items-center gap-1.5">
                                  <span
                                    className="size-2 shrink-0 rounded-[2px]"
                                    style={{ background: p.color }}
                                  />
                                  {p.name}
                                </span>
                                <span className="font-mono tabular-nums">
                                  {formatDuration(Number(value))}
                                </span>
                              </div>
                            );
                          }}
                        />
                      }
                    />
                    <Pie
                      data={donutData}
                      dataKey="ms"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={80}
                      strokeWidth={2}
                      isAnimationActive={!reduced}
                    >
                      {donutData.map((d) => (
                        <Cell key={d.id} fill={d.color} stroke="var(--card)" />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-base leading-none font-semibold tabular-nums">
                    {formatDuration(total)}
                  </span>
                  <span className="mt-0.5 text-[11px] text-muted-foreground">
                    tracked
                  </span>
                </div>
              </div>
              <ul className="w-full min-w-0 flex-1 space-y-1">
                {donutData.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 text-xs">
                    <span
                      className="size-2.5 shrink-0 rounded-[3px]"
                      style={{ background: d.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {formatDuration(d.ms)}
                    </span>
                    <span className="w-9 text-right font-mono tabular-nums text-muted-foreground/70">
                      {srPercent(d.ms, total)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {shiftChips.length > 0 && (
            <section className="space-y-1.5">
              <SectionLabel>Shifts vs previous period</SectionLabel>
              <ul className="flex flex-wrap gap-1.5">
                {shiftChips.map((s) => {
                  const meta = seriesMeta(
                    s.categoryId ?? "__uncategorized__",
                    data.categories,
                  );
                  const pts = Math.round(s.deltaShare * 100);
                  return (
                    <li
                      key={s.categoryId ?? "uncategorized"}
                      className="flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs"
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: meta.color }}
                        aria-hidden
                      />
                      <span className="max-w-32 truncate">{meta.name}</span>
                      <span
                        className="font-mono tabular-nums text-muted-foreground"
                        aria-label={`${meta.name}: share ${pts > 0 ? "up" : "down"} ${Math.abs(pts)} points vs previous period`}
                      >
                        {pts > 0 ? "▲" : "▼"} {Math.abs(pts)} pts
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
