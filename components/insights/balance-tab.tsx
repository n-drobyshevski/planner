"use client";

import { useMemo } from "react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
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
import { categoryShares, categoryByBucket, memberByBucket } from "@/lib/analytics/balance";
import { MIN_CATEGORY_RATINGS, satisfactionByCategory } from "@/lib/analytics/correlations";
import { formatDuration } from "@/lib/datetime/format";
import { usePrefersReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { toPaletteColor } from "@/lib/theme/appearance";
import { GoalsSection } from "./goals/goals-section";
import { InsightsEmpty, SectionEmpty } from "./insights-empty";
import { NEUTRAL, bucketLabel, bucketTick, seriesMeta } from "./series";
import { CHART_H, SectionLabel, TabGrid, srPercent } from "./tab-bits";
import type { InsightsTabData } from "./insights-shell";

export function BalanceTab({ data }: { data: InsightsTabData }) {
  const reduced = usePrefersReducedMotion();
  const { period, occurrences, prevOccurrences, timeZone, memberFilter } = data;
  const { granularity } = period;

  const stacked = useMemo(
    () => categoryByBucket(occurrences, period.buckets, 5),
    [occurrences, period.buckets],
  );
  const shares = useMemo(
    () =>
      categoryShares(occurrences, prevOccurrences, period.window, period.prevWindow),
    [occurrences, prevOccurrences, period],
  );
  const memberSplit = useMemo(
    () => memberByBucket(occurrences, period.buckets),
    [occurrences, period.buckets],
  );
  // Satisfaction lens: duration-weighted mean per category, gated on n in the
  // analytics layer so a single 5-star outing can't crown a context.
  const satisfaction = useMemo(
    () => satisfactionByCategory(occurrences, period.window),
    [occurrences, period.window],
  );

  const total = useMemo(
    () => shares.reduce((s, r) => s + r.ms, 0),
    [shares],
  );
  // Tracked ms per category over the focused window, for the goals section.
  const actualByCategory = useMemo(
    () => new Map<string | null, number>(shares.map((s) => [s.categoryId, s.ms])),
    [shares],
  );
  if (total === 0)
    return (
      <InsightsEmpty
        title="Nothing to compare"
        description="Context and member balance appear once this period has tracked time."
      />
    );

  const stackedRows = stacked.rows.map((r) => ({
    key: String(r.start),
    full: bucketLabel({ start: r.start, end: r.end }, granularity, timeZone),
    ...r.byKey,
  }));
  const stackedConfig: ChartConfig = Object.fromEntries(
    stacked.seriesKeys.map((k) => {
      const meta = seriesMeta(k, data.categories);
      return [k, { label: meta.name, color: meta.color }];
    }),
  );

  const showMembers = data.members.size > 1 && memberFilter === "both";
  const memberRows = memberSplit.rows.map((r) => ({
    key: String(r.start),
    full: bucketLabel({ start: r.start, end: r.end }, granularity, timeZone),
    ...r.byMember,
  }));
  const memberConfig: ChartConfig = Object.fromEntries(
    memberSplit.memberIds.map((id) => {
      const m = data.members.get(id);
      return [
        id,
        {
          label: m?.name ?? "Unknown",
          color: m ? (toPaletteColor(m.color) ?? NEUTRAL) : NEUTRAL,
        },
      ];
    }),
  );

  const topShare = shares[0];

  const tooltipContent = (config: ChartConfig) => (
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
            {config[name as string]?.label ?? name}
          </span>
          <span className="font-mono tabular-nums">
            {formatDuration(Number(value))}
          </span>
        </div>
      )}
    />
  );

  return (
    <div className="space-y-4">
      <p className="sr-only">
        {topShare
          ? `${seriesMeta(topShare.categoryId ?? "__uncategorized__", data.categories).name} takes the largest share at ${srPercent(topShare.ms, total)} of tracked time.`
          : ""}
      </p>

      <TabGrid>
      <section className="space-y-1.5 xl:col-span-2">
        <SectionLabel>Context mix per {granularity}</SectionLabel>
        <ChartContainer
          config={stackedConfig}
          className={`aspect-auto ${CHART_H.standard} w-full`}
          aria-label={`Stacked tracked time per context per ${granularity}, ${period.label}`}
        >
          <BarChart data={stackedRows} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
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
            <ChartTooltip cursor={false} content={tooltipContent(stackedConfig)} />
            <ChartLegend content={<ChartLegendContent />} />
            {stacked.seriesKeys.map((k, i) => (
              <Bar
                key={k}
                dataKey={k}
                stackId="mix"
                fill={`var(--color-${k})`}
                radius={i === stacked.seriesKeys.length - 1 ? [3, 3, 0, 0] : 0}
                isAnimationActive={!reduced}
              />
            ))}
          </BarChart>
        </ChartContainer>
      </section>

      <section className="space-y-1.5">
        <SectionLabel>Share shifts vs previous period</SectionLabel>
        <Table className="text-xs">
          <TableCaption className="sr-only">
            Context shares of tracked time, this period vs the previous one
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
              <TableHead
                scope="col"
                className="hidden h-auto px-0 py-1.5 text-right text-muted-foreground sm:table-cell"
              >
                Prev
              </TableHead>
              <TableHead scope="col" className="h-auto px-0 py-1.5 text-right text-muted-foreground">
                Δ
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shares.map((s) => {
              const meta = seriesMeta(
                s.categoryId ?? "__uncategorized__",
                data.categories,
              );
              const pts = Math.round(s.deltaShare * 100);
              return (
                <TableRow key={s.categoryId ?? "uncategorized"} className="border-border/60">
                  <TableCell className="flex items-center gap-2 px-0 py-1.5">
                    <span
                      className="size-2.5 shrink-0 rounded-[3px]"
                      style={{ background: meta.color }}
                      aria-hidden
                    />
                    <span className="truncate">{meta.name}</span>
                  </TableCell>
                  <TableCell className="px-0 py-1.5 text-right font-mono tabular-nums">
                    {formatDuration(s.ms)}
                  </TableCell>
                  <TableCell className="px-0 py-1.5 text-right font-mono tabular-nums">
                    {Math.round(s.share * 100)}%
                  </TableCell>
                  <TableCell className="hidden px-0 py-1.5 text-right font-mono tabular-nums text-muted-foreground sm:table-cell">
                    {Math.round(s.prevShare * 100)}%
                  </TableCell>
                  <TableCell
                    className="px-0 py-1.5 text-right font-mono tabular-nums text-muted-foreground"
                    aria-label={
                      pts === 0
                        ? "no change"
                        : `${pts > 0 ? "up" : "down"} ${Math.abs(pts)} share points`
                    }
                  >
                    <span aria-hidden>
                      {pts > 0 ? "▲" : pts < 0 ? "▼" : "–"}{" "}
                      {pts === 0 ? "" : `${Math.abs(pts)} pts`}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      {data.workspaceId && data.viewerId && (
        <GoalsSection data={data} actualByCategory={actualByCategory} />
      )}

      <section className="space-y-1.5">
        <SectionLabel>Satisfaction by context</SectionLabel>
        {satisfaction.length === 0 ? (
          <SectionEmpty actionLabel="Open the calendar" actionHref="/calendar">
            Rate satisfaction on at least {MIN_CATEGORY_RATINGS} events in a
            context to see which parts of your time feel best, looking back.
          </SectionEmpty>
        ) : (
          <ul className="space-y-1.5" role="list">
            {satisfaction.map(({ categoryId, agg }) => {
              const meta = seriesMeta(categoryId ?? "__uncategorized__", data.categories);
              const pct = (agg.mean / 5) * 100;
              return (
                <li key={categoryId ?? "uncategorized"} className="flex items-center gap-2 text-xs">
                  <span
                    className="size-2.5 shrink-0 rounded-[3px]"
                    style={{ background: meta.color }}
                    aria-hidden
                  />
                  <span className="w-28 min-w-0 truncate sm:w-36">{meta.name}</span>
                  <span
                    className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                    role="img"
                    aria-label={`${meta.name}: mean satisfaction ${agg.mean.toFixed(1)} of 5, from ${agg.n} rated items`}
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${pct}%`, background: meta.color }}
                    />
                  </span>
                  <span className="w-12 text-right font-mono tabular-nums">
                    {agg.mean.toFixed(1)}/5
                  </span>
                  <span className="w-10 text-right font-mono tabular-nums text-muted-foreground/70">
                    n {agg.n}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {showMembers && memberSplit.memberIds.length > 1 && (
        <section className="space-y-1.5 xl:col-span-2">
          <SectionLabel>Who tracked it, per {granularity}</SectionLabel>
          <ChartContainer
            config={memberConfig}
            className={`aspect-auto ${CHART_H.compact} w-full`}
            aria-label={`Tracked time per member per ${granularity}`}
          >
            <BarChart
              data={memberRows}
              margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
            >
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
              <ChartTooltip cursor={false} content={tooltipContent(memberConfig)} />
              <ChartLegend content={<ChartLegendContent />} />
              {memberSplit.memberIds.map((id) => (
                <Bar
                  key={id}
                  dataKey={id}
                  fill={`var(--color-${id})`}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={!reduced}
                />
              ))}
            </BarChart>
          </ChartContainer>
          <p className="text-[11px] text-muted-foreground">
            Joint events count for their owner&apos;s calendar.
          </p>
        </section>
      )}
      </TabGrid>
    </div>
  );
}
