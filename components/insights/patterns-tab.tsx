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
import {
  deepWorkShare,
  energyLoadPerDay,
  satisfactionByDaypart,
  type Daypart,
} from "@/lib/analytics/correlations";
import { formatDuration } from "@/lib/datetime/format";
import { usePrefersReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { StatCard, StatGrid } from "./stat-card";
import { InsightsEmpty, SectionEmpty } from "./insights-empty";
import { HourHeatmap } from "./hour-heatmap";
import { SectionLabel, TabGrid } from "./tab-bits";
import type { InsightsTabData } from "./insights-shell";

const DAYPART_LABELS: Record<Daypart, string> = {
  morning: "Morning (5–12)",
  midday: "Midday (12–17)",
  evening: "Evening (17–22)",
  night: "Night (22–5)",
};

/** Minimum rated occurrences before a daypart verdict is worth showing. */
const MIN_DAYPART_RATINGS = 5;

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

  // Attribute lenses: focus mode split, satisfaction by time of day, energy
  // coverage. All gated on sample size in the analytics layer or below.
  const focusSplit = useMemo(
    () => deepWorkShare(occurrences, period.window),
    [occurrences, period.window],
  );
  const dayparts = useMemo(
    () => satisfactionByDaypart(occurrences, period.window, timeZone),
    [occurrences, period.window, timeZone],
  );
  const energyDays = useMemo(
    () => energyLoadPerDay(occurrences, period.days, period.window),
    [occurrences, period.days, period.window],
  );

  if (total === 0)
    return (
      <InsightsEmpty
        title="No patterns yet"
        description="Weekday and hour-of-day patterns need at least one timed event in this period."
      />
    );

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
    <div className="space-y-4">
      <p className="sr-only">
        Average tracked time peaks on {top.full} at {formatDuration(top.avg)} per day.
        {frag.blockCount > 0
          ? ` The period splits into ${frag.blockCount} busy blocks, typically ${formatDuration(frag.medianBlockMs ?? 0)} long.`
          : ""}
      </p>

      <TabGrid>
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

      <AttributesSection
        focusSplit={focusSplit}
        dayparts={dayparts}
        energyDays={energyDays}
      />

      <section className="space-y-1.5 xl:col-span-2">
        <SectionLabel>By hour of day</SectionLabel>
        <HourHeatmap
          occurrences={occurrences}
          window={period.window}
          timeZone={timeZone}
        />
      </section>

      <section className="space-y-1.5 xl:col-span-2">
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
      </TabGrid>
    </div>
  );
}

function AttributesSection({
  focusSplit,
  dayparts,
  energyDays,
}: {
  focusSplit: ReturnType<typeof deepWorkShare>;
  dayparts: ReturnType<typeof satisfactionByDaypart>;
  energyDays: ReturnType<typeof energyLoadPerDay>;
}) {
  const ratedParts = dayparts.filter((d) => d.agg.n >= MIN_DAYPART_RATINGS);
  const best = ratedParts.length
    ? ratedParts.reduce((a, b) => (b.agg.mean > a.agg.mean ? b : a))
    : null;
  const worst =
    ratedParts.length >= 2
      ? ratedParts.reduce((a, b) => (b.agg.mean < a.agg.mean ? b : a))
      : null;

  const energyRatedMs = energyDays.reduce((s, d) => s + d.ratedMs, 0);
  const energyWeightedMs = energyDays.reduce((s, d) => s + d.weightedMs, 0);
  const energyTotalMs = energyDays.reduce((s, d) => s + d.totalMs, 0);
  // weighted / rated = duration-weighted mean energy on the 1..3 scale.
  const meanEnergy = energyRatedMs > 0 ? energyWeightedMs / energyRatedMs : null;

  const hasAnything =
    focusSplit.share !== null || best !== null || meanEnergy !== null;

  return (
    <section className="space-y-1.5">
      <SectionLabel>Attributes</SectionLabel>
      {!hasAnything ? (
        <SectionEmpty actionLabel="Open the calendar" actionHref="/calendar">
          Set focus, energy or satisfaction on events to unlock attribute
          patterns — deep-work share, your best time of day, and how demanding
          your days run.
        </SectionEmpty>
      ) : (
        <StatGrid>
          <StatCard
            label="Deep work"
            value={
              focusSplit.share !== null
                ? `${Math.round(focusSplit.share * 100)}%`
                : "—"
            }
            hint={
              focusSplit.share !== null
                ? `of ${formatDuration(focusSplit.deepMs + focusSplit.shallowMs)} focus-rated time`
                : "rate focus on events to track this"
            }
          />
          <StatCard
            label="Best time of day"
            value={best ? DAYPART_LABELS[best.daypart].split(" ")[0] : "—"}
            hint={
              best
                ? `satisfaction ${best.agg.mean.toFixed(1)}/5 · n ${best.agg.n}`
                : `needs ${MIN_DAYPART_RATINGS}+ rated items`
            }
          />
          {worst && worst.daypart !== best?.daypart && (
            <StatCard
              label="Toughest time of day"
              value={DAYPART_LABELS[worst.daypart].split(" ")[0]}
              hint={`satisfaction ${worst.agg.mean.toFixed(1)}/5 · n ${worst.agg.n}`}
            />
          )}
          <StatCard
            label="Energy level"
            value={meanEnergy !== null ? `${meanEnergy.toFixed(1)}/3` : "—"}
            hint={
              meanEnergy !== null && energyTotalMs > 0
                ? `rated on ${Math.round((energyRatedMs / energyTotalMs) * 100)}% of tracked time`
                : "rate energy on events to track this"
            }
          />
        </StatGrid>
      )}
    </section>
  );
}
