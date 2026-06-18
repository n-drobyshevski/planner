"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Line, LineChart, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { usePrefersReducedMotion } from "@/lib/hooks/use-reduced-motion";
import type { DerivedNight } from "@/lib/sleep/derive";
import type { SleepLog } from "@/lib/types";
import {
  INSIGHTS_CHART_MARGIN,
  insightsGrid,
  insightsXAxis,
} from "../chart-frame";
import { bucketTick } from "../series";
import { SectionLabel } from "../tab-bits";
import { SectionEmpty } from "../insights-empty";

/**
 * Morning check-in trends: quality (higher is better) and sleepiness (lower is
 * better) per night, one of the Sleep tab's evidence blocks. Logged vs derived
 * lives in the rhythm strip and the per-night summary; this block is purely the
 * subjective scores, so it coaches to log more when there are none yet rather
 * than showing an empty axis.
 */
export function HistorySection({
  nights,
  logs,
  timeZone,
}: {
  nights: DerivedNight[];
  logs: SleepLog[];
  timeZone: string;
}) {
  const t = useTranslations("sleep");
  const locale = useLocale();
  const reduced = usePrefersReducedMotion();
  const logByKey = useMemo(() => new Map(logs.map((l) => [l.date, l])), [logs]);

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

  // Screen-reader summary for the scores chart (the lines are visual-only).
  const qualityScores = scoreRows.filter((r) => r.quality !== null);
  const fatigueScores = scoreRows.filter((r) => r.fatigue !== null);
  const scoresSummary = [
    qualityScores.length > 0
      ? t("history.srAvgQuality", {
          value: (
            qualityScores.reduce((s, r) => s + (r.quality as number), 0) /
            qualityScores.length
          ).toFixed(1),
          count: qualityScores.length,
        })
      : null,
    fatigueScores.length > 0
      ? t("history.srAvgSleepiness", {
          value: (
            fatigueScores.reduce((s, r) => s + (r.fatigue as number), 0) /
            fatigueScores.length
          ).toFixed(1),
          count: fatigueScores.length,
        })
      : null,
  ]
    .filter(Boolean)
    .join("; ");

  const scoreConfig: ChartConfig = {
    quality: { label: t("history.qualityLabel"), color: "var(--chart-2)" },
    fatigue: { label: t("history.sleepinessLabel"), color: "var(--chart-4)" },
  };

  return (
    <section className="space-y-2">
      <SectionLabel>{t("history.label")}</SectionLabel>
      {hasScores ? (
        <div className="space-y-1.5">
          <p className="sr-only">{scoresSummary}.</p>
          <ChartContainer
            config={scoreConfig}
            className="aspect-auto h-[140px] w-full"
            aria-label={t("history.chartAriaLabel")}
          >
            <LineChart data={scoreRows} accessibilityLayer margin={INSIGHTS_CHART_MARGIN}>
              {insightsGrid()}
              {insightsXAxis({
                tickFormatter: (v) => bucketTick(Number(v), "day", timeZone, locale),
              })}
              <YAxis hide domain={[0, 4]} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_l, payload) => {
                      const k = (payload?.[0]?.payload as { key?: string })?.key;
                      return k ? bucketTick(Number(k), "day", timeZone, locale) : "";
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
            {t("history.legend")}
          </p>
        </div>
      ) : (
        <SectionEmpty>{t("history.empty")}</SectionEmpty>
      )}
    </section>
  );
}
