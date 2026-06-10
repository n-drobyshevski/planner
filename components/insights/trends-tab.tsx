"use client";

import { useMemo } from "react";
import { Bar, ComposedChart, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { bucketUsage, categoryTrends, rollingAverage } from "@/lib/analytics/trends";
import { formatDuration } from "@/lib/datetime/format";
import { usePrefersReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { InsightsEmpty } from "./insights-empty";
import { bucketLabel, bucketTick, seriesMeta } from "./series";
import { SectionLabel, srPercent } from "./tab-bits";
import type { InsightsTabData } from "./insights-shell";

export function TrendsTab({ data }: { data: InsightsTabData }) {
  const reduced = usePrefersReducedMotion();
  const { period, occurrences, timeZone } = data;
  const { granularity } = period;

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

  if (total === 0) return <InsightsEmpty />;

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
  const tickInterval =
    period.buckets.length <= 14 ? 0 : Math.ceil(period.buckets.length / 7) - 1;

  const busiest = rows.reduce((a, b) => (b.ms > a.ms ? b : a), rows[0]);

  return (
    <div className="space-y-6">
      <p className="sr-only">
        {formatDuration(total)} tracked across {rows.length} {granularity} buckets.
        Busiest: {busiest.full} with {formatDuration(busiest.ms)}.
      </p>

      <section className="space-y-1.5">
        <SectionLabel>Tracked time per {granularity}</SectionLabel>
        <ChartContainer
          config={totalConfig}
          className="aspect-auto h-[200px] w-full"
          aria-label={`Tracked time per ${granularity}, ${period.label}`}
        >
          <ComposedChart data={rows} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <XAxis
              dataKey="key"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              minTickGap={8}
              interval={tickInterval}
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
            <Bar
              dataKey="ms"
              fill="var(--color-ms)"
              radius={[3, 3, 0, 0]}
              isAnimationActive={!reduced}
            />
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
          </ComposedChart>
        </ChartContainer>
        {granularity === "day" && (
          <p className="text-[11px] text-muted-foreground">
            Bars: tracked time · line: trailing 7-day average
          </p>
        )}
      </section>

      {catTrend.seriesKeys.length > 0 && (
        <section className="space-y-2">
          <SectionLabel>By context over time</SectionLabel>
          <ChartContainer
            config={catConfig}
            className="aspect-auto h-[220px] w-full"
            aria-label={`Tracked time per context per ${granularity}, top ${Math.min(5, catTrend.seriesKeys.length)} contexts`}
          >
            <LineChart data={catRows} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <XAxis
                dataKey="key"
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                minTickGap={8}
                interval={tickInterval}
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
              <ChartLegend content={<ChartLegendContent />} />
              {catTrend.seriesKeys.map((k) => (
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

          {/* Accessible/table alternative to the line chart. */}
          <table className="w-full text-xs">
            <caption className="sr-only">
              Total tracked time per context for {period.label}
            </caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="py-1.5 font-medium">
                  Context
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Time
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Share
                </th>
              </tr>
            </thead>
            <tbody>
              {catTrend.seriesKeys.map((k) => {
                const meta = seriesMeta(k, data.categories);
                const ms = catTotals.get(k) ?? 0;
                return (
                  <tr key={k} className="border-b border-border/60">
                    <td className="flex items-center gap-2 py-1.5">
                      <span
                        className="size-2.5 shrink-0 rounded-[3px]"
                        style={{ background: meta.color }}
                        aria-hidden
                      />
                      <span className="truncate">{meta.name}</span>
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums">
                      {formatDuration(ms)}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                      {srPercent(ms, total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
