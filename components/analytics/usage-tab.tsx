"use client";

import * as React from "react";
import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import { Bar, BarChart, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ChartColumnBig } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  formatDuration,
  formatRangeLabel,
  formatWeekdayDayMonth,
} from "@/lib/datetime/format";
import { computeUsage } from "@/lib/analytics/usage";
import { usePrefersReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { useViewerTimeZone } from "@/lib/datetime/timezone-context";
import { cn } from "@/lib/utils";
import { toPaletteColor } from "@/lib/theme/appearance";
import type {
  CalendarView,
  Category,
  Member,
  Occurrence,
  TimeWindow,
} from "@/lib/types";

/** Neutral fill for uncategorized / "Other" slices and tracks. */
const NEUTRAL = "var(--muted-foreground)";
/** Categories shown individually in the donut before collapsing into "Other". */
const TOP_CATEGORIES = 6;

export interface UsageTabProps {
  /** the calendar's already visibility-filtered occurrence set */
  occurrences: Occurrence[];
  view: CalendarView;
  focusedDate: number;
  /** start-of-day ms per visible day (getVisibleDays) */
  days: number[];
  /** the focused [start, end) window */
  window: TimeWindow;
  categories: Map<string, Category>;
  members: Map<string, Member>;
  /** true when another member's calendar is overlaid (enables the By-member split) */
  overlayActive: boolean;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="px-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </h4>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-2.5 shadow-soft">
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-0.5 text-base leading-tight font-semibold tabular-nums">
        {value}
      </div>
      {hint && <div className="truncate text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/**
 * Analytics for the calendar's currently selected timeframe, shown in the right
 * rail's "Insights" tab. Reports active scheduled time (see lib/analytics/usage)
 * as summary stats, a per-day bar chart, a category donut, and — when overlaying
 * other members — a per-member split. All numbers track the calendar's view +
 * date and its category/overlay filters automatically, since `occurrences` is the
 * shell's already-filtered `visible` set.
 */
export function UsageTab({
  occurrences,
  view,
  focusedDate,
  days,
  window,
  categories,
  members,
  overlayActive,
}: UsageTabProps) {
  const reduced = usePrefersReducedMotion();
  const timeZone = useViewerTimeZone();
  const usage = React.useMemo(
    () => computeUsage(occurrences, days, window),
    [occurrences, days, window],
  );

  const total = usage.summary.totalMs;
  const rangeLabel = formatRangeLabel(view, focusedDate, timeZone);

  const perDayData = React.useMemo(
    () =>
      usage.perDay.map((d) => ({
        key: String(d.dayMs),
        ms: d.ms,
        full: formatWeekdayDayMonth(d.dayMs, timeZone),
      })),
    [usage.perDay, timeZone],
  );
  // Thin out x-axis labels on dense windows (month=42, agenda=30) to ~7 ticks.
  const tickInterval = days.length <= 14 ? 0 : Math.ceil(days.length / 7) - 1;

  const categoryData = React.useMemo(() => {
    const rows = usage.byCategory.map((c) => ({
      id: c.categoryId ?? "uncategorized",
      name: c.categoryId
        ? (categories.get(c.categoryId)?.name ?? "Unknown")
        : "No context",
      color: c.categoryId
        ? (categories.get(c.categoryId)?.color ?? NEUTRAL)
        : NEUTRAL,
      ms: c.ms,
    }));
    if (rows.length <= TOP_CATEGORIES) return rows;
    const head = rows.slice(0, TOP_CATEGORIES);
    const restMs = rows.slice(TOP_CATEGORIES).reduce((s, r) => s + r.ms, 0);
    return [...head, { id: "other", name: "Other", color: NEUTRAL, ms: restMs }];
  }, [usage.byCategory, categories]);

  const showMembers = overlayActive && usage.byMember.length > 1;

  if (total === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <p className="mb-3 text-xs text-muted-foreground">{rangeLabel}</p>
        <Empty className="flex-1 border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChartColumnBig />
            </EmptyMedia>
            <EmptyTitle>No tracked time</EmptyTitle>
            <EmptyDescription>
              Schedule some events in this range to see where your time goes.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const perDayConfig: ChartConfig = {
    ms: { label: "Tracked", color: "var(--chart-1)" },
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
      <header>
        <h3 className="font-heading text-sm font-semibold">{rangeLabel}</h3>
        <p className="text-xs text-muted-foreground">Active scheduled time</p>
      </header>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Total" value={formatDuration(total)} />
        <StatCard label="Daily avg" value={formatDuration(usage.summary.dailyAverageMs)} />
        <StatCard
          label="Busiest day"
          value={usage.summary.busiestDay ? formatDuration(usage.summary.busiestDay.ms) : "—"}
          hint={
            usage.summary.busiestDay
              ? format(usage.summary.busiestDay.dayMs, "EEE d MMM", { in: tz(timeZone) })
              : undefined
          }
        />
        <StatCard
          label="Events"
          value={String(usage.summary.eventCount)}
          hint={`${usage.summary.activeDays}/${days.length} days active`}
        />
      </div>

      {/* Per-day */}
      <section className="flex flex-col gap-1.5">
        <SectionLabel>Per day</SectionLabel>
        <ChartContainer
          config={perDayConfig}
          className="aspect-auto h-[140px] w-full"
          aria-label={`Tracked time per day for ${rangeLabel}`}
        >
          <BarChart data={perDayData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <XAxis
              dataKey="key"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              minTickGap={8}
              interval={tickInterval}
              tickFormatter={(value: string) => format(Number(value), "d", { in: tz(timeZone) })}
            />
            <YAxis hide domain={[0, "dataMax"]} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideIndicator
                  labelFormatter={(_label, payload) =>
                    (payload?.[0]?.payload as { full?: string } | undefined)?.full ?? ""
                  }
                  formatter={(value) => (
                    <span className="font-mono font-medium tabular-nums">
                      {formatDuration(Number(value))}
                    </span>
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
          </BarChart>
        </ChartContainer>
      </section>

      {/* By context */}
      <section className="flex flex-col gap-2">
        <SectionLabel>By context</SectionLabel>
        <div className="relative mx-auto h-[150px] w-full">
          <ChartContainer config={{}} className="aspect-square h-[150px] w-full">
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
                              style={{ background: toPaletteColor(p.color) }}
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
                data={categoryData}
                dataKey="ms"
                nameKey="name"
                innerRadius={42}
                outerRadius={70}
                strokeWidth={2}
                isAnimationActive={!reduced}
              >
                {categoryData.map((d) => (
                  <Cell key={d.id} fill={toPaletteColor(d.color)} stroke="var(--card)" />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          {/* Center total (overlay; doesn't intercept hover) */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-base font-semibold tabular-nums leading-none">
              {formatDuration(total)}
            </span>
            <span className="mt-0.5 text-[11px] text-muted-foreground">tracked</span>
          </div>
        </div>
        <ul className="flex flex-col gap-1">
          {categoryData.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-xs">
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ background: toPaletteColor(d.color) }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {formatDuration(d.ms)}
              </span>
              <span className="w-9 text-right font-mono tabular-nums text-muted-foreground/70">
                {Math.round((d.ms / total) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* By member (only while overlaying others) */}
      {showMembers && (
        <section className="flex flex-col gap-2">
          <SectionLabel>By member</SectionLabel>
          <ul className="flex flex-col gap-2">
            {usage.byMember.map((m) => {
              const member = members.get(m.ownerId);
              const color = member?.color ?? NEUTRAL;
              const pct = total ? Math.round((m.ms / total) * 100) : 0;
              return (
                <li key={m.ownerId} className="flex flex-col gap-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate">
                      {member?.name ?? "Unknown"}
                    </span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {formatDuration(m.ms)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full")}
                      style={{ width: `${pct}%`, background: toPaletteColor(color) }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
