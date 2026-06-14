"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import {
  Area,
  Bar,
  ComposedChart,
  Line,
  ReferenceLine,
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
import { dateFnsLocale } from "@/lib/datetime/date-locale";
import { usePrefersReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { deriveOverviewLede } from "@/lib/insights/ledes";
import { StatCard, StatGrid } from "./stat-card";
import { ChartCard } from "./chart-card";
import {
  INSIGHTS_CHART_MARGIN,
  TooltipRow,
  insightsGrid,
  insightsXAxis,
  insightsYAxis,
} from "./chart-frame";
import { InsightLede } from "./insight-lede";
import { CustomizeDashboardSheet } from "./customize-dashboard-sheet";
import { DayDetailSheet } from "./day-detail-sheet";
import { GoalsSection } from "./goals/goals-section";
import { OptimizeTab } from "./optimize-tab";
import { InsightsEmpty } from "./insights-empty";
import { NEUTRAL, seriesFallbackLabels, seriesMeta } from "./series";
import { CHART_H, Reading, SectionLabel, TabGrid, srPercent } from "./tab-bits";
import type { InsightsTabData } from "./insights-shell";

/** Categories shown individually in the share bar before collapsing into "Other". */
const TOP_CATEGORIES = 6;

/**
 * The three headline numbers are permanent lead figures in the answer zone, so
 * they never render as dashboard cards (that would duplicate them). The
 * customize sheet hides them too.
 */
const LEAD_STAT_IDS: DashboardCardId[] = ["total", "daily-avg", "active-days"];

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
 * The Overview is a customizable dashboard read as a three-movement "reading":
 * the answer (the lede sentence + its lead figures), the evidence (a registry
 * of cards — lib/insights/dashboard.ts — in the member's stored order, hidden
 * cards skipped, stat cards de-cardified into borderless figures), and what to
 * do (the folded-in Optimize suggestions, subordinate at the foot). No stored
 * prefs reproduces the classic layout exactly.
 */
export function OverviewTab({ data }: { data: InsightsTabData }) {
  const t = useTranslations("insights");
  const locale = useLocale();
  const dfLocale = dateFnsLocale(locale);
  const seriesLabels = useMemo(() => seriesFallbackLabels(t), [t]);
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
      full: formatWeekdayDayMonth(d.dayMs, timeZone, locale),
    }));
  }, [usage.perDay, prevUsage.perDay, timeZone, locale]);

  // "Typical day" baseline: median nonzero day across both windows — the same
  // baseline the Optimize overload rule judges against.
  const typicalDayMs = useMemo(
    () =>
      median(
        [...usage.perDay, ...prevUsage.perDay].map((d) => d.ms).filter((ms) => ms > 0),
      ),
    [usage.perDay, prevUsage.perDay],
  );

  const shareData = useMemo(() => {
    const rows = usage.byCategory.map((c) => {
      const meta = seriesMeta(c.categoryId ?? "__uncategorized__", data.categories, seriesLabels);
      return { id: c.categoryId ?? "uncategorized", ...meta, ms: c.ms };
    });
    if (rows.length <= TOP_CATEGORIES) return rows;
    const head = rows.slice(0, TOP_CATEGORIES);
    const restMs = rows.slice(TOP_CATEGORIES).reduce((s, r) => s + r.ms, 0);
    return [...head, { id: "other", name: t("overview.other"), color: NEUTRAL, ms: restMs }];
  }, [usage.byCategory, data.categories, seriesLabels, t]);

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
    ms: { label: t("overview.seriesTracked"), color: "var(--chart-1)" },
    avg: { label: t("overview.seriesAvg"), color: "var(--chart-2)" },
    prevMs: { label: t("overview.seriesPrev"), color: COMPARISON_COLOR },
  };

  // Takeaway headline: total + direction vs the previous period.
  const totalDelta = delta(total, prevUsage.summary.totalMs);
  const perDayHeadline = t("overview.perDayHeadline", {
    trend:
      totalDelta.deltaPct === null
        ? "none"
        : totalDelta.deltaPct === 0
          ? "level"
          : totalDelta.deltaPct > 0
            ? "up"
            : "down",
    total: formatDuration(total, locale),
    pct:
      totalDelta.deltaPct === null
        ? 0
        : Math.round(Math.abs(totalDelta.deltaPct) * 100),
  });

  const shareHeadline = shareData[0]
    ? t("overview.shareHeadline", {
        name: shareData[0].name,
        pct: srPercent(shareData[0].ms, total),
      })
    : undefined;

  // The tab lede: the period's answer in one sentence, above everything.
  const topCat = usage.byCategory[0];
  const lede = deriveOverviewLede({
    usage,
    prevUsage,
    preset: data.preset,
    topContext: topCat
      ? {
          name: seriesMeta(topCat.categoryId ?? "__uncategorized__", data.categories, seriesLabels)
            .name,
          ms: topCat.ms,
        }
      : null,
    t,
    locale,
  });

  // The lead figures under the answer sentence — the three numbers that frame
  // the period, on the paper rather than in a wall of KPI cards.
  const leadFigures =
    total > 0
      ? [
          { label: t("overview.leadTotal"), value: formatDuration(total, locale) },
          {
            label: t("overview.leadDailyAvg"),
            value: formatDuration(usage.summary.dailyAverageMs, locale),
          },
          {
            label: t("overview.leadActiveDays"),
            value: `${usage.summary.activeDays}/${period.days.length}`,
          },
        ]
      : undefined;

  // --- Card registry: every dashboard id renders through these two maps. ----
  // The three lead figures are intentionally absent (they live in the answer
  // zone); stat cards render flat — borderless figures, not boxes.

  const statCards: Partial<Record<DashboardCardId, React.ReactNode>> = {
    events: (
      <StatCard
        key="events"
        flat
        label={t("overview.events")}
        value={String(usage.summary.eventCount)}
        delta={delta(usage.summary.eventCount, prevUsage.summary.eventCount)}
        hint={t("overview.eventsHint")}
      />
    ),
    "avg-session": (
      <StatCard
        key="avg-session"
        flat
        label={t("overview.avgSession")}
        value={
          usage.summary.eventCount > 0
            ? formatDuration(total / usage.summary.eventCount, locale)
            : "—"
        }
        hint={t("overview.avgSessionHint")}
      />
    ),
    "busiest-day": (
      <StatCard
        key="busiest-day"
        flat
        label={t("overview.busiestDay")}
        value={
          usage.summary.busiestDay
            ? formatDuration(usage.summary.busiestDay.ms, locale)
            : "—"
        }
        hint={
          usage.summary.busiestDay
            ? format(usage.summary.busiestDay.dayMs, "EEE d MMM", { in: ctx, locale: dfLocale })
            : undefined
        }
      />
    ),
    "tasks-done": (
      <StatCard
        key="tasks-done"
        flat
        label={t("overview.tasksDone")}
        value={String(taskStats.completedCount)}
        delta={delta(taskStats.completedCount, prevTaskStats.completedCount)}
      />
    ),
    "on-time": (
      <StatCard
        key="on-time"
        flat
        label={t("overview.onTime")}
        value={
          taskStats.adherenceRate === null
            ? "—"
            : `${Math.round(taskStats.adherenceRate * 100)}%`
        }
        hint={
          taskStats.dueCount > 0
            ? t("overview.onTimeDue", { count: taskStats.dueCount })
            : t("overview.onTimeNothing")
        }
      />
    ),
    overdue: (
      <StatCard
        key="overdue"
        flat
        label={t("overview.overdue")}
        value={String(taskStats.overdueOpenCount)}
        warning={taskStats.overdueOpenCount > 0}
        hint={t("overview.overdueHint")}
      />
    ),
  };

  const sections: Partial<Record<DashboardCardId, React.ReactNode>> = {
    "per-day": (
      <ChartCard
        key="per-day"
        id="overview-per-day"
        viewerId={viewerId}
        title={t("overview.perDay")}
        headline={perDayHeadline}
        chartTypes={["bar", "line", "area"]}
        comparison
        footnote={
          typicalDayMs > 0
            ? t("overview.perDayFootnoteTypical", {
                typical: formatDuration(typicalDayMs, locale),
              })
            : t("overview.perDayFootnote")
        }
      >
        {(settings) => (
          <ChartContainer
            config={perDayConfig}
            className={`aspect-auto ${CHART_H.compact} w-full`}
            aria-label={t("overview.perDayAria", { label: period.label })}
          >
            <ComposedChart
              data={perDayData}
              margin={INSIGHTS_CHART_MARGIN}
              onClick={(state) => {
                const label = (state as { activeLabel?: string } | null)
                  ?.activeLabel;
                if (label) setDetailDay(Number(label));
              }}
            >
              {insightsGrid()}
              {insightsXAxis({
                tickFormatter: (value) => format(Number(value), "d", { in: ctx }),
              })}
              {insightsYAxis({ tickCount: 3 })}
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_label, payload) =>
                      (payload?.[0]?.payload as { full?: string } | undefined)
                        ?.full ?? ""
                    }
                    formatter={(value, name, item) => (
                      <TooltipRow
                        color={item.color}
                        label={perDayConfig[name as string]?.label ?? name}
                        value={formatDuration(Number(value), locale)}
                      />
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
      <section key="by-context" className="space-y-3">
        <div className="space-y-0.5">
          <SectionLabel>{t("overview.byContext")}</SectionLabel>
          {shareHeadline && <p className="text-sm font-medium">{shareHeadline}</p>}
        </div>
        {/* A 100% share bar — quieter than a donut and a more direct read of
            proportion. The list below carries the accessible detail; the bar is
            decorative, so it's aria-hidden. */}
        <div
          className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
          aria-hidden
        >
          {shareData.map((d) => (
            <div
              key={d.id}
              className="h-full min-w-px"
              style={{
                width: `${total > 0 ? (d.ms / total) * 100 : 0}%`,
                background: d.color,
              }}
            />
          ))}
        </div>
        <ul className="space-y-1">
          {shareData.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-xs">
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ background: d.color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {formatDuration(d.ms, locale)}
              </span>
              <span className="w-9 text-right font-mono tabular-nums text-muted-foreground">
                {srPercent(d.ms, total)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    ),
    shifts:
      shiftChips.length > 0 ? (
        <section key="shifts" className="space-y-1.5">
          <SectionLabel>{t("overview.shifts")}</SectionLabel>
          <ul className="flex flex-wrap gap-1.5">
            {shiftChips.map((s) => {
              const meta = seriesMeta(
                s.categoryId ?? "__uncategorized__",
                data.categories,
                seriesLabels,
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
                    aria-label={t("overview.shiftPoints", {
                      name: meta.name,
                      direction: pts > 0 ? "up" : "down",
                      points: Math.abs(pts),
                    })}
                  >
                    {pts > 0 ? "▲" : "▼"} {t("overview.shiftPts", { points: Math.abs(pts) })}
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
    <Reading>
      <div className="flex items-start justify-between gap-3">
        {lede ? (
          <InsightLede lede={lede} figures={leadFigures} className="min-w-0 flex-1" />
        ) : (
          <div className="min-w-0 flex-1" />
        )}
        <CustomizeDashboardSheet
          layout={layout}
          lockedIds={LEAD_STAT_IDS}
          onChange={(next) => void updatePrefs({ dashboard: next }).catch(() => {})}
        />
      </div>

      {total > 0 && (
        <p className="sr-only">
          {t("overview.srSummary", {
            total: formatDuration(total, locale),
            label: period.label,
          })}
          {usage.summary.busiestDay
            ? t("overview.srBusiest", {
                day: format(usage.summary.busiestDay.dayMs, "EEEE d MMMM", { in: ctx, locale: dfLocale }),
                ms: formatDuration(usage.summary.busiestDay.ms, locale),
              })
            : ""}
          {shareData[0] ? t("overview.srTopContext", { name: shareData[0].name }) : ""}
        </p>
      )}

      {total > 0 && (
        // Movement 2 — the evidence. Stat rows and the wide per-day chart take
        // the full width; the share bar, shift chips and goals flow two-up.
        <TabGrid>
          {runs.map((run, i) => {
            if (run.type === "stats") {
              const cards = run.ids
                .map((id) => statCards[id])
                .filter((node): node is React.ReactNode => node != null);
              return cards.length > 0 ? (
                <StatGrid key={`stats-${i}`} className="lg:col-span-2">
                  {cards}
                </StatGrid>
              ) : null;
            }
            // Sections other than goals need tracked time; goals shows its own
            // empty/progress state regardless (a budget can be "on track" at 0h).
            const node = sections[run.id];
            if (node == null) return null;
            return (
              <div
                key={run.id}
                className={
                  FULL_WIDTH_SECTIONS.has(run.id) ? "lg:col-span-2" : undefined
                }
              >
                {node}
              </div>
            );
          })}
        </TabGrid>
      )}

      {/* Goals can stand alone at 0h tracked (a budget is meaningful empty). */}
      {total === 0 &&
        workspaceId &&
        viewerId &&
        !layout.hidden.has("goals") && (
          <GoalsSection data={data} actualByCategory={actualByCategory} />
        )}

      {/* Movement 3 — what to do: the actionable layer folded in from the former
          Optimize tab, subordinate beneath the answer + evidence. */}
      {total > 0 && (
        <section className="space-y-2 border-t pt-5">
          <SectionLabel>{t("overview.whatToDo")}</SectionLabel>
          <OptimizeTab data={data} />
        </section>
      )}

      {total === 0 && <InsightsEmpty />}

      <DayDetailSheet dayMs={detailDay} onClose={() => setDetailDay(null)} data={data} />
    </Reading>
  );
}
