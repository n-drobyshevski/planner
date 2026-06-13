"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import {
  Area,
  Bar,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
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
import { COMPARISON_COLOR, COMPARISON_OPACITY } from "@/lib/insights/palette";
import {
  layoutRuns,
  normalizeLayout,
  type DashboardCardId,
} from "@/lib/insights/dashboard";
import {
  DEFAULT_INSIGHTS_PREFS,
  useInsightsPrefs,
  useUpdateInsightsPrefs,
} from "@/lib/hooks/use-insights-prefs";
import { formatDuration, formatWeekdayDayMonth } from "@/lib/datetime/format";
import { usePrefersReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { StatCard, StatGrid } from "./stat-card";
import { ChartCard } from "./chart-card";
import { CustomizeDashboardSheet } from "./customize-dashboard-sheet";
import { DayDetailSheet } from "./day-detail-sheet";
import { GoalsSection } from "./goals/goals-section";
import { InsightsEmpty } from "./insights-empty";
import { NEUTRAL, seriesMeta } from "./series";
import { CHART_H, SectionLabel, TabGrid, srPercent } from "./tab-bits";
import type { InsightsTabData } from "./insights-shell";

/** Categories shown individually in the donut before collapsing into "Other". */
const TOP_CATEGORIES = 6;

/**
 * Section cards that earn the full grid width on desktop (their content reads
 * better wide); everything else flows two-up under TabGrid. The per-day chart
 * is the period's centrepiece — a half-width strip would crush its day ticks.
 */
const FULL_WIDTH_SECTIONS = new Set<DashboardCardId>(["per-day"]);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The Overview is a customizable dashboard: a registry of cards
 * (lib/insights/dashboard.ts) rendered in the member's stored order, with
 * hidden cards skipped. No stored prefs reproduces the classic layout
 * exactly; consecutive stat cards share one StatGrid so the grid only
 * fragments when the member interleaves a section on purpose.
 */
export function OverviewTab({ data }: { data: InsightsTabData }) {
  const reduced = usePrefersReducedMotion();
  const {
    period,
    occurrences,
    prevOccurrences,
    tasks,
    timeZone,
    now,
    viewerId,
    workspaceId,
  } = data;
  const [detailDay, setDetailDay] = useState<number | null>(null);

  const { prefs } = useInsightsPrefs(workspaceId || undefined, viewerId || undefined);
  const updatePrefs = useUpdateInsightsPrefs(
    workspaceId || undefined,
    viewerId || undefined,
  );
  const layout = useMemo(
    () => normalizeLayout((prefs ?? DEFAULT_INSIGHTS_PREFS).dashboard),
    [prefs],
  );

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
      // Previous period aligned by position (day 1 vs day 1, …).
      prevMs: prevUsage.perDay[i]?.ms,
      full: formatWeekdayDayMonth(d.dayMs, timeZone),
    }));
  }, [usage.perDay, prevUsage.perDay, timeZone]);

  // "Typical day" baseline: median nonzero day across both windows — the same
  // baseline the Optimize overload rule judges against.
  const typicalDayMs = useMemo(
    () =>
      median(
        [...usage.perDay, ...prevUsage.perDay].map((d) => d.ms).filter((ms) => ms > 0),
      ),
    [usage.perDay, prevUsage.perDay],
  );

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

  // Tracked ms per category over the focused window, for the goals card.
  const actualByCategory = useMemo(
    () =>
      new Map<string | null, number>(
        usage.byCategory.map((c) => [c.categoryId, c.ms]),
      ),
    [usage.byCategory],
  );

  const perDayConfig: ChartConfig = {
    ms: { label: "Tracked", color: "var(--chart-1)" },
    avg: { label: "7-day avg", color: "var(--chart-2)" },
    prevMs: { label: "Previous period", color: COMPARISON_COLOR },
  };

  // Takeaway headline: total + direction vs the previous period.
  const totalDelta = delta(total, prevUsage.summary.totalMs);
  const perDayHeadline =
    totalDelta.deltaPct === null
      ? `${formatDuration(total)} tracked this period.`
      : totalDelta.deltaPct === 0
        ? `${formatDuration(total)} tracked — level with the previous period.`
        : `${formatDuration(total)} tracked — ${totalDelta.deltaPct > 0 ? "up" : "down"} ${Math.round(Math.abs(totalDelta.deltaPct) * 100)}% vs the previous period.`;

  const donutHeadline = donutData[0]
    ? `Most time went to ${donutData[0].name} (${srPercent(donutData[0].ms, total)}).`
    : undefined;

  // --- Card registry: every dashboard id renders through these two maps. ----

  const statCards: Record<string, React.ReactNode> = {
    total: (
      <StatCard
        key="total"
        label="Total"
        value={formatDuration(total)}
        delta={delta(total, prevUsage.summary.totalMs)}
        emphasis
        className="col-span-2"
      />
    ),
    "daily-avg": (
      <StatCard
        key="daily-avg"
        label="Daily avg"
        value={formatDuration(usage.summary.dailyAverageMs)}
        delta={delta(usage.summary.dailyAverageMs, prevUsage.summary.dailyAverageMs)}
      />
    ),
    events: (
      <StatCard
        key="events"
        label="Events"
        value={String(usage.summary.eventCount)}
        delta={delta(usage.summary.eventCount, prevUsage.summary.eventCount)}
        hint="tracked this period"
      />
    ),
    "avg-session": (
      <StatCard
        key="avg-session"
        label="Avg session"
        value={
          usage.summary.eventCount > 0
            ? formatDuration(total / usage.summary.eventCount)
            : "—"
        }
        hint="per tracked event"
      />
    ),
    "busiest-day": (
      <StatCard
        key="busiest-day"
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
    ),
    "active-days": (
      <StatCard
        key="active-days"
        label="Active days"
        value={`${usage.summary.activeDays}/${period.days.length}`}
      />
    ),
    "tasks-done": (
      <StatCard
        key="tasks-done"
        label="Tasks done"
        value={String(taskStats.completedCount)}
        delta={delta(taskStats.completedCount, prevTaskStats.completedCount)}
      />
    ),
    "on-time": (
      <StatCard
        key="on-time"
        label="On time"
        value={
          taskStats.adherenceRate === null
            ? "—"
            : `${Math.round(taskStats.adherenceRate * 100)}%`
        }
        hint={taskStats.dueCount > 0 ? `${taskStats.dueCount} due` : "nothing due"}
      />
    ),
    overdue: (
      <StatCard
        key="overdue"
        label="Overdue"
        value={String(taskStats.overdueOpenCount)}
        warning={taskStats.overdueOpenCount > 0}
        hint="open past their due day"
      />
    ),
  };

  const sections: Partial<Record<DashboardCardId, React.ReactNode>> = {
    "per-day": (
      <ChartCard
        key="per-day"
        id="overview-per-day"
        viewerId={viewerId}
        title="Per day"
        headline={perDayHeadline}
        chartTypes={["bar", "line", "area"]}
        comparison
        footnote={
          typicalDayMs > 0
            ? `Dashed line: typical day (${formatDuration(typicalDayMs)}) · curve: trailing 7-day average · tap a day for detail`
            : "Curve: trailing 7-day average · tap a day for detail"
        }
      >
        {(settings) => (
          <ChartContainer
            config={perDayConfig}
            className={`aspect-auto ${CHART_H.compact} w-full`}
            aria-label={`Tracked time per day, ${period.label}`}
          >
            <ComposedChart
              data={perDayData}
              margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
              onClick={(state) => {
                const label = (state as { activeLabel?: string } | null)
                  ?.activeLabel;
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
              {settings.showComparison && (
                <Bar
                  dataKey="prevMs"
                  fill="var(--color-prevMs)"
                  fillOpacity={COMPARISON_OPACITY}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={!reduced}
                />
              )}
              {settings.chartType === "bar" && (
                <Bar
                  dataKey="ms"
                  fill="var(--color-ms)"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={!reduced}
                  className="cursor-pointer"
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
              <Line
                dataKey="avg"
                type="monotone"
                stroke="var(--color-avg)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={!reduced}
              />
              {typicalDayMs > 0 && (
                <ReferenceLine
                  y={typicalDayMs}
                  stroke={COMPARISON_COLOR}
                  strokeDasharray="4 4"
                  strokeOpacity={0.7}
                />
              )}
            </ComposedChart>
          </ChartContainer>
        )}
      </ChartCard>
    ),
    "by-context": (
      <section key="by-context" className="space-y-2">
        <div className="space-y-0.5">
          <SectionLabel>By context</SectionLabel>
          {donutHeadline && <p className="text-sm font-medium">{donutHeadline}</p>}
        </div>
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
    ),
    shifts:
      shiftChips.length > 0 ? (
        <section key="shifts" className="space-y-1.5">
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
      ) : null,
    goals:
      workspaceId && viewerId ? (
        <GoalsSection key="goals" data={data} actualByCategory={actualByCategory} />
      ) : null,
  };

  const runs = layoutRuns(layout);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CustomizeDashboardSheet
          layout={layout}
          onChange={(next) => void updatePrefs({ dashboard: next }).catch(() => {})}
        />
      </div>

      {total > 0 && (
        <p className="sr-only">
          {formatDuration(total)} tracked in {period.label}.
          {usage.summary.busiestDay
            ? ` Busiest day ${format(usage.summary.busiestDay.dayMs, "EEEE d MMMM", { in: ctx })} with ${formatDuration(usage.summary.busiestDay.ms)}.`
            : ""}
          {donutData[0] ? ` Most time went to ${donutData[0].name}.` : ""}
        </p>
      )}

      {/* Stat rows and the wide per-day chart take the full width; the donut,
          shift chips and goals flow two-up on desktop. */}
      <TabGrid>
        {runs.map((run, i) => {
          if (run.type === "stats") {
            const cards = run.ids
              .map((id) => statCards[id])
              .filter((node): node is React.ReactNode => node != null);
            return cards.length > 0 ? (
              <StatGrid key={`stats-${i}`} className="xl:col-span-2">
                {cards}
              </StatGrid>
            ) : null;
          }
          // Sections other than goals need tracked time; goals shows its own
          // empty/progress state regardless (a budget can be "on track" at 0h).
          if (total === 0 && run.id !== "goals") return null;
          const node = sections[run.id];
          if (node == null) return null;
          return (
            <div
              key={run.id}
              className={FULL_WIDTH_SECTIONS.has(run.id) ? "xl:col-span-2" : undefined}
            >
              {node}
            </div>
          );
        })}
      </TabGrid>

      {total === 0 && <InsightsEmpty />}

      <DayDetailSheet dayMs={detailDay} onClose={() => setDetailDay(null)} data={data} />
    </div>
  );
}
