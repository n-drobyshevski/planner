"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bar, BarChart } from "recharts";
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
import {
  INSIGHTS_CHART_MARGIN,
  TooltipRow,
  insightsGrid,
  insightsXAxis,
  insightsYAxis,
} from "./chart-frame";
import { GoalsSection } from "./goals/goals-section";
import { SectionEmpty } from "./insights-empty";
import { NEUTRAL, bucketLabel, bucketTick, seriesFallbackLabels, seriesMeta } from "./series";
import { CHART_H, SectionLabel, srPercent } from "./tab-bits";
import type { InsightsTabData } from "./insights-shell";

/**
 * Context + member balance, as a set of sections (not a standalone tab). The
 * 7→5 consolidation folds Balance into the Patterns tab, which renders these
 * inside its own grid and owns the empty state. Returns a fragment so each
 * section becomes a direct grid child (the col-span classes still apply).
 */
export function BalanceSections({ data }: { data: InsightsTabData }) {
  const t = useTranslations("insights");
  const locale = useLocale();
  const seriesLabels = seriesFallbackLabels(t);
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
  // The host tab (Patterns) owns the empty state; when Patterns has tracked
  // time these always do too, so there's simply nothing to add at zero.
  if (total === 0) return null;

  const stackedRows = stacked.rows.map((r) => ({
    key: String(r.start),
    full: bucketLabel({ start: r.start, end: r.end }, granularity, timeZone, locale),
    ...r.byKey,
  }));
  const stackedConfig: ChartConfig = Object.fromEntries(
    stacked.seriesKeys.map((k) => {
      const meta = seriesMeta(k, data.categories, seriesLabels);
      return [k, { label: meta.name, color: meta.color }];
    }),
  );

  const showMembers = data.members.size > 1 && memberFilter === "both";
  const memberRows = memberSplit.rows.map((r) => ({
    key: String(r.start),
    full: bucketLabel({ start: r.start, end: r.end }, granularity, timeZone, locale),
    ...r.byMember,
  }));
  const memberConfig: ChartConfig = Object.fromEntries(
    memberSplit.memberIds.map((id) => {
      const m = data.members.get(id);
      return [
        id,
        {
          label: m?.name ?? t("balance.unknownMember"),
          color: m ? (toPaletteColor(m.color) ?? NEUTRAL) : NEUTRAL,
        },
      ];
    }),
  );

  const tooltipContent = (config: ChartConfig) => (
    <ChartTooltipContent
      labelFormatter={(_l, payload) =>
        (payload?.[0]?.payload as { full?: string } | undefined)?.full ?? ""
      }
      formatter={(value, name, item) => (
        <TooltipRow
          color={item.color}
          label={config[name as string]?.label ?? name}
          value={formatDuration(Number(value), locale)}
        />
      )}
    />
  );

  // The two-of-you read: each member's share of the shared + visible time on
  // screen (privacy holds — a partner's private time is never in `occurrences`,
  // so it's never counted or shown). The viewer reads as "You".
  const memberTotals = memberSplit.memberIds
    .map((id) => ({
      id,
      ms: memberRows.reduce((s, r) => s + (Number((r as Record<string, unknown>)[id]) || 0), 0),
    }))
    .sort((a, b) => (a.id === data.viewerId ? -1 : b.id === data.viewerId ? 1 : b.ms - a.ms));
  const memberTotalMs = memberTotals.reduce((s, m) => s + m.ms, 0);

  return (
    <>
      <section className="space-y-1.5 lg:col-span-2">
        <SectionLabel>{t("balance.contextMix", { granularity })}</SectionLabel>
        <ChartContainer
          config={stackedConfig}
          className={`aspect-auto ${CHART_H.standard} w-full`}
          aria-label={t("balance.contextMixAria", { granularity, label: period.label })}
        >
          <BarChart data={stackedRows} margin={INSIGHTS_CHART_MARGIN}>
            {insightsGrid()}
            {insightsXAxis({
              tickFormatter: (v) => bucketTick(Number(v), granularity, timeZone, locale),
            })}
            {insightsYAxis({ tickCount: 3 })}
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
        <SectionLabel>{t("balance.shareShifts")}</SectionLabel>
        <Table className="text-xs">
          <TableCaption className="sr-only">
            {t("balance.shareShiftsCaption")}
          </TableCaption>
          <TableHeader>
            <TableRow className="text-muted-foreground hover:bg-transparent">
              <TableHead scope="col" className="h-auto px-0 py-1.5 text-muted-foreground">
                {t("balance.colContext")}
              </TableHead>
              <TableHead scope="col" className="h-auto px-0 py-1.5 text-right text-muted-foreground">
                {t("balance.colTime")}
              </TableHead>
              <TableHead scope="col" className="h-auto px-0 py-1.5 text-right text-muted-foreground">
                {t("balance.colShare")}
              </TableHead>
              <TableHead
                scope="col"
                className="hidden h-auto px-0 py-1.5 text-right text-muted-foreground sm:table-cell"
              >
                {t("balance.colPrev")}
              </TableHead>
              <TableHead scope="col" className="h-auto px-0 py-1.5 text-right text-muted-foreground">
                {t("balance.colDelta")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shares.map((s) => {
              const meta = seriesMeta(
                s.categoryId ?? "__uncategorized__",
                data.categories,
                seriesLabels,
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
                    {formatDuration(s.ms, locale)}
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
                        ? t("balance.deltaNoChange")
                        : t("balance.deltaPoints", {
                            direction: pts > 0 ? "up" : "down",
                            points: Math.abs(pts),
                          })
                    }
                  >
                    <span aria-hidden>
                      {pts > 0 ? "▲" : pts < 0 ? "▼" : "–"}{" "}
                      {pts === 0 ? "" : t("balance.pts", { points: Math.abs(pts) })}
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
        <SectionLabel>{t("balance.satisfactionByContext")}</SectionLabel>
        {satisfaction.length === 0 ? (
          <SectionEmpty actionLabel={t("empty.openCalendar")} actionHref="/calendar">
            {t("balance.satisfactionEmpty", { min: MIN_CATEGORY_RATINGS })}
          </SectionEmpty>
        ) : (
          <ul className="space-y-1.5" role="list">
            {satisfaction.map(({ categoryId, agg }) => {
              const meta = seriesMeta(categoryId ?? "__uncategorized__", data.categories, seriesLabels);
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
                    aria-label={t("balance.satisfactionAria", {
                      name: meta.name,
                      mean: agg.mean.toFixed(1),
                      n: agg.n,
                    })}
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
        <section className="space-y-2 lg:col-span-2">
          <SectionLabel>{t("balance.twoOfYou", { granularity })}</SectionLabel>
          {memberTotalMs > 0 && (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {memberTotals.map((m) => {
                const label =
                  m.id === data.viewerId
                    ? t("balance.you")
                    : (data.members.get(m.id)?.name ?? t("balance.partner"));
                const color = (memberConfig[m.id]?.color as string) ?? NEUTRAL;
                return (
                  <span key={m.id} className="flex items-center gap-1.5">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: color }}
                      aria-hidden
                    />
                    <span className="font-medium">{label}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {srPercent(m.ms, memberTotalMs)} · {formatDuration(m.ms, locale)}
                    </span>
                  </span>
                );
              })}
            </p>
          )}
          <ChartContainer
            config={memberConfig}
            className={`aspect-auto ${CHART_H.compact} w-full`}
            aria-label={t("balance.twoOfYouAria", { granularity })}
          >
            <BarChart data={memberRows} margin={INSIGHTS_CHART_MARGIN}>
              {insightsGrid()}
              {insightsXAxis({
                tickFormatter: (v) => bucketTick(Number(v), granularity, timeZone, locale),
              })}
              {insightsYAxis({ tickCount: 3 })}
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
            {t("balance.privacyNote")}
          </p>
        </section>
      )}
    </>
  );
}
