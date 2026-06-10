"use client";

import { useMemo } from "react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { byWeekday, fragmentation } from "@/lib/analytics/patterns";
import { formatDuration } from "@/lib/datetime/format";
import { usePrefersReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { StatCard, StatGrid } from "./stat-card";
import { InsightsEmpty } from "./insights-empty";
import { HourHeatmap } from "./hour-heatmap";
import { SectionLabel } from "./tab-bits";
import type { InsightsTabData } from "./insights-shell";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_FULL = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function PatternsTab({ data }: { data: InsightsTabData }) {
  const reduced = usePrefersReducedMotion();
  const { period, occurrences, timeZone } = data;

  const weekdays = useMemo(
    () => byWeekday(occurrences, period.days, period.window, timeZone),
    [occurrences, period, timeZone],
  );
  const frag = useMemo(
    () => fragmentation(occurrences, period.window, timeZone),
    [occurrences, period.window, timeZone],
  );
  const total = useMemo(
    () => weekdays.reduce((s, w) => s + w.totalMs, 0),
    [weekdays],
  );

  if (total === 0) return <InsightsEmpty />;

  const rows = weekdays.map((w) => ({
    name: WEEKDAYS[w.weekday],
    full: WEEKDAYS_FULL[w.weekday],
    avg: w.avgMs,
    total: w.totalMs,
    days: w.dayCount,
  }));
  const top = rows.reduce((a, b) => (b.avg > a.avg ? b : a), rows[0]);

  const config: ChartConfig = {
    avg: { label: "Avg per day", color: "var(--chart-1)" },
  };

  return (
    <div className="space-y-6">
      <p className="sr-only">
        Average tracked time peaks on {top.full} at {formatDuration(top.avg)} per day.
        {frag.blockCount > 0
          ? ` The period splits into ${frag.blockCount} busy blocks, typically ${formatDuration(frag.medianBlockMs ?? 0)} long.`
          : ""}
      </p>

      <section className="space-y-1.5">
        <SectionLabel>By weekday</SectionLabel>
        <ChartContainer
          config={config}
          className="aspect-auto w-full"
          style={{ height: 7 * 30 + 8 }}
          aria-label={`Average tracked time per weekday, ${period.label}`}
        >
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          >
            <XAxis type="number" hide domain={[0, "dataMax"]} />
            <YAxis
              dataKey="name"
              type="category"
              tickLine={false}
              axisLine={false}
              width={34}
              tickMargin={4}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideIndicator
                  labelFormatter={(_l, payload) =>
                    (payload?.[0]?.payload as { full?: string } | undefined)?.full ?? ""
                  }
                  formatter={(value, _name, item) => {
                    const p = item.payload as { total: number; days: number };
                    return (
                      <div className="flex w-full flex-col gap-0.5">
                        <span className="font-mono font-medium tabular-nums">
                          {formatDuration(Number(value))} avg per day
                        </span>
                        <span className="text-muted-foreground">
                          {formatDuration(p.total)} total over {p.days}{" "}
                          {p.days === 1 ? "day" : "days"}
                        </span>
                      </div>
                    );
                  }}
                />
              }
            />
            <Bar
              dataKey="avg"
              fill="var(--color-avg)"
              radius={[0, 3, 3, 0]}
              isAnimationActive={!reduced}
            />
          </BarChart>
        </ChartContainer>
      </section>

      <section className="space-y-1.5">
        <SectionLabel>By hour of day</SectionLabel>
        <HourHeatmap
          occurrences={occurrences}
          window={period.window}
          timeZone={timeZone}
        />
      </section>

      <section className="space-y-1.5">
        <SectionLabel>Fragmentation</SectionLabel>
        <StatGrid>
          <StatCard
            label="Busy blocks"
            value={String(frag.blockCount)}
            hint="back-to-back events count as one"
          />
          <StatCard
            label="Typical block"
            value={frag.medianBlockMs !== null ? formatDuration(frag.medianBlockMs) : "—"}
            hint="median length"
          />
          <StatCard
            label="Longest block"
            value={
              frag.longestBlockMs !== null ? formatDuration(frag.longestBlockMs) : "—"
            }
          />
          <StatCard
            label="Short blocks"
            value={
              frag.shortBlockShare !== null
                ? `${Math.round(frag.shortBlockShare * 100)}%`
                : "—"
            }
            hint="under 30 minutes"
          />
          <StatCard
            label="Typical gap"
            value={frag.avgGapMs !== null ? formatDuration(frag.avgGapMs) : "—"}
            hint="between blocks, same day"
          />
        </StatGrid>
      </section>
    </div>
  );
}
