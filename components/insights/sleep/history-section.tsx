"use client";

import { useMemo } from "react";
import { Bar, BarChart, Cell, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDuration, formatTime } from "@/lib/datetime/format";
import { usePrefersReducedMotion } from "@/lib/hooks/use-reduced-motion";
import type { DerivedNight } from "@/lib/sleep/derive";
import type { SleepPrefs } from "@/lib/sleep/cycles";
import type { SleepLog } from "@/lib/types";
import { StatCard, StatGrid } from "../stat-card";
import { InsightCard } from "../insight-card";
import { bucketTick } from "../series";
import { CHART_H, SectionLabel } from "../tab-bits";

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;

interface NightRow {
  key: string;
  dateKey: string;
  hours: number;
  ms: number;
  source: "logged" | "derived";
}

/**
 * Per-night duration history (logged check-in times win over the
 * calendar-derived night), summary stats, and quality/fatigue trends.
 * Logged vs derived is carried by fill pattern (solid vs hatched) plus a
 * text legend — never color alone.
 */
export function HistorySection({
  nights,
  logs,
  prefs,
  timeZone,
  action,
}: {
  nights: DerivedNight[];
  logs: SleepLog[];
  prefs: SleepPrefs;
  timeZone: string;
  /** header-right slot — the backfill entry point lives with the data */
  action?: React.ReactNode;
}) {
  const reduced = usePrefersReducedMotion();
  const logByKey = useMemo(() => new Map(logs.map((l) => [l.date, l])), [logs]);

  const rows = useMemo<NightRow[]>(() => {
    return nights.map((n) => {
      const log = logByKey.get(n.dateKey);
      const loggedMs =
        log && log.bedtimeAt !== null && log.wokeAt !== null
          ? log.wokeAt - log.bedtimeAt
          : null;
      const ms = loggedMs ?? n.durationMs;
      return {
        key: String(n.dayStartMs),
        dateKey: n.dateKey,
        hours: ms / HOUR_MS,
        ms,
        source: loggedMs !== null ? ("logged" as const) : ("derived" as const),
      };
    });
  }, [nights, logByKey]);

  const withData = rows.filter((r) => r.ms > 0);

  // Bedtimes (logged preferred, else derived start) as minutes since the
  // previous local noon — continuous over the night span, no midnight wrap.
  const bedtimes = useMemo(() => {
    const out: number[] = [];
    for (const n of nights) {
      const log = logByKey.get(n.dateKey);
      const at = log?.bedtimeAt ?? n.start;
      if (at == null) continue;
      const [hh, mm] = formatTime(at, timeZone).split(":").map(Number);
      out.push(hh >= 12 ? (hh - 12) * 60 + mm : (hh + 12) * 60 + mm);
    }
    return out;
  }, [nights, logByKey, timeZone]);

  const targetMs =
    (prefs.targetCycles * prefs.cycleLengthMin + prefs.onsetLatencyMin) * MIN_MS;

  const avgMs =
    withData.length > 0
      ? withData.reduce((s, r) => s + r.ms, 0) / withData.length
      : null;
  const avgBedtime =
    bedtimes.length > 0
      ? bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length
      : null;
  // Sample σ (n−1), matching the regularity hint in lib/sleep/adaptive.ts.
  const spread =
    avgBedtime !== null && bedtimes.length > 1
      ? Math.sqrt(
          bedtimes.reduce((s, b) => s + (b - avgBedtime) ** 2, 0) /
            (bedtimes.length - 1),
        )
      : null;
  const debtMs = withData.reduce((s, r) => s + Math.max(0, targetMs - r.ms), 0);

  const scoreRows = useMemo(
    () =>
      nights.map((n) => {
        const log = logByKey.get(n.dateKey);
        return {
          key: String(n.dayStartMs),
          quality: log?.quality ?? null,
          fatigue: log?.fatigue ?? null,
        };
      }),
    [nights, logByKey],
  );
  const hasScores = scoreRows.some((r) => r.quality !== null || r.fatigue !== null);
  // Screen-reader summary for the scores chart (the bars/lines are visual-only).
  const qualityScores = scoreRows.filter((r) => r.quality !== null);
  const fatigueScores = scoreRows.filter((r) => r.fatigue !== null);
  const mornings = (n: number) => `${n} morning${n === 1 ? "" : "s"}`;
  const scoresSummary = [
    qualityScores.length > 0
      ? `Average sleep quality ${(
          qualityScores.reduce((s, r) => s + (r.quality as number), 0) /
          qualityScores.length
        ).toFixed(1)} of 5 across ${mornings(qualityScores.length)}`
      : null,
    fatigueScores.length > 0
      ? `average sleepiness ${(
          fatigueScores.reduce((s, r) => s + (r.fatigue as number), 0) /
          fatigueScores.length
        ).toFixed(1)} of 9 across ${mornings(fatigueScores.length)}`
      : null,
  ]
    .filter(Boolean)
    .join("; ");

  const durationConfig: ChartConfig = {
    hours: { label: "In bed", color: "var(--chart-1)" },
  };
  const scoreConfig: ChartConfig = {
    quality: { label: "Quality (1–5)", color: "var(--chart-2)" },
    fatigue: { label: "Sleepiness (1–9)", color: "var(--chart-4)" },
  };

  /** Format minutes-since-noon back to a wall clock "HH:mm". */
  const fromNoon = (min: number) => {
    const h = (Math.floor(min / 60) + 12) % 24;
    const m = Math.round(min % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  return (
    <InsightCard title="Sleep history" action={action} contentClassName="space-y-3">
      <StatGrid>
        <StatCard
          label="Avg per night"
          metric="avg-per-night"
          value={avgMs !== null ? formatDuration(Math.round(avgMs)) : "—"}
          hint={`${withData.length} night${withData.length === 1 ? "" : "s"} with data`}
        />
        <StatCard
          label="Avg bedtime"
          metric="avg-bedtime"
          value={avgBedtime !== null ? fromNoon(avgBedtime) : "—"}
        />
        <StatCard
          label="Bedtime spread"
          metric="bedtime-spread"
          value={spread !== null ? `±${Math.round(spread)} min` : "—"}
          hint="lower is steadier"
        />
        <StatCard
          label="Debt vs target"
          metric="debt-vs-target"
          value={withData.length > 0 ? formatDuration(Math.round(debtMs)) : "—"}
          hint={`target ${formatDuration(targetMs)} in bed`}
        />
      </StatGrid>

      <p className="sr-only">
        {withData.length} of {rows.length} nights have sleep data
        {avgMs !== null
          ? `, averaging ${formatDuration(Math.round(avgMs))} in bed`
          : ""}
        .
      </p>

      {withData.length > 0 && (
        <div className="space-y-1.5">
          <ChartContainer
            config={durationConfig}
            className={`aspect-auto ${CHART_H.compact} w-full`}
            aria-label="Time in bed per night"
          >
            <BarChart
              data={rows}
              accessibilityLayer
              margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
            >
              <defs>
                {/* hatched fill marks calendar-derived nights (shape, not color) */}
                <pattern
                  id="sleep-derived-hatch"
                  patternUnits="userSpaceOnUse"
                  width="5"
                  height="5"
                  patternTransform="rotate(45)"
                >
                  <line x1="0" y1="0" x2="0" y2="5" stroke="var(--chart-1)" strokeWidth="2.5" opacity="0.55" />
                </pattern>
              </defs>
              <XAxis
                dataKey="key"
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                minTickGap={24}
                interval="preserveStartEnd"
                tickFormatter={(v: string) => bucketTick(Number(v), "day", timeZone)}
              />
              <YAxis hide domain={[0, "dataMax"]} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_l, payload) => {
                      const row = payload?.[0]?.payload as NightRow | undefined;
                      return row
                        ? `${bucketTick(Number(row.key), "day", timeZone)} — ${
                            row.source === "logged" ? "logged" : "from calendar"
                          }`
                        : "";
                    }}
                    formatter={(_value, _name, item) => {
                      const row = item.payload as NightRow;
                      return (
                        <span className="font-mono tabular-nums">
                          {row.ms > 0 ? formatDuration(row.ms) : "no data"}
                        </span>
                      );
                    }}
                  />
                }
              />
              <ReferenceLine
                y={targetMs / HOUR_MS}
                stroke="var(--chart-2)"
                strokeDasharray="4 3"
                ifOverflow="extendDomain"
              />
              <Bar dataKey="hours" radius={[3, 3, 0, 0]} isAnimationActive={!reduced}>
                {rows.map((r) => (
                  <Cell
                    key={r.key}
                    fill={
                      r.source === "logged"
                        ? "var(--chart-1)"
                        : "url(#sleep-derived-hatch)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
          <p className="text-xs text-muted-foreground">
            Solid bars: logged check-ins · hatched: derived from inactive calendar
            events · dashed line: your target
          </p>
        </div>
      )}

      {hasScores && (
        <div className="space-y-1.5">
          <SectionLabel>Morning check-ins</SectionLabel>
          <p className="sr-only">{scoresSummary}.</p>
          <ChartContainer
            config={scoreConfig}
            className="aspect-auto h-[140px] w-full"
            aria-label="Sleep quality and morning sleepiness per night"
          >
            <LineChart
              data={scoreRows}
              accessibilityLayer
              margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
            >
              <XAxis
                dataKey="key"
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                minTickGap={24}
                interval="preserveStartEnd"
                tickFormatter={(v: string) => bucketTick(Number(v), "day", timeZone)}
              />
              <YAxis hide domain={[0, 9]} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_l, payload) => {
                      const k = (payload?.[0]?.payload as { key?: string })?.key;
                      return k ? bucketTick(Number(k), "day", timeZone) : "";
                    }}
                  />
                }
              />
              <Line
                dataKey="quality"
                type="monotone"
                stroke="var(--color-quality)"
                strokeWidth={2}
                connectNulls
                isAnimationActive={!reduced}
              />
              <Line
                dataKey="fatigue"
                type="monotone"
                stroke="var(--color-fatigue)"
                strokeWidth={2}
                strokeDasharray="5 3"
                connectNulls
                isAnimationActive={!reduced}
              />
            </LineChart>
          </ChartContainer>
          <p className="text-xs text-muted-foreground">
            Solid line: quality (higher is better) · dashed: sleepiness (lower is
            better)
          </p>
        </div>
      )}
    </InsightCard>
  );
}
