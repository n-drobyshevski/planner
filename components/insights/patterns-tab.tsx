"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
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
import { derivePatternsLede } from "@/lib/insights/ledes";
import { usePrefersReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { StatCard, StatGrid } from "./stat-card";
import { InsightLede } from "./insight-lede";
import { BalanceSections } from "./balance-tab";
import { InsightsEmpty, SectionEmpty } from "./insights-empty";
import { HourHeatmap } from "./hour-heatmap";
import { Figure, Reading, SectionLabel, TabGrid } from "./tab-bits";
import type { InsightsTabData } from "./insights-shell";

const DAYPART_KEYS: Record<Daypart, string> = {
  morning: "patterns.morning",
  midday: "patterns.midday",
  evening: "patterns.evening",
  night: "patterns.night",
};

/** Minimum rated occurrences before a daypart verdict is worth showing. */
const MIN_DAYPART_RATINGS = 5;

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function PatternsTab({ data }: { data: InsightsTabData }) {
  const t = useTranslations("insights");
  const locale = useLocale();
  const reduced = usePrefersReducedMotion();
  const { period, occurrences, timeZone } = data;
  const weekdaysShort = WEEKDAY_KEYS.map((k) => t(`heatmap.weekdays.${k}`));
  const weekdaysFull = WEEKDAY_KEYS.map((k) => t(`heatmap.weekdaysFull.${k}`));

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
        title={t("patterns.emptyTitle")}
        description={t("patterns.emptyDescription")}
      />
    );

  const rows = weekdays.map((w) => ({
    name: weekdaysShort[w.weekday],
    full: weekdaysFull[w.weekday],
    avg: w.avgMs,
    total: w.totalMs,
    days: w.dayCount,
  }));
  const top = rows.reduce((a, b) => (b.avg > a.avg ? b : a), rows[0]);

  const ratedParts = dayparts.filter((d) => d.agg.n >= MIN_DAYPART_RATINGS);
  const bestPart = ratedParts.length
    ? ratedParts.reduce((a, b) => (b.agg.mean > a.agg.mean ? b : a))
    : null;
  const lede = derivePatternsLede({
    topWeekday: { full: top.full, avgMs: top.avg },
    bestDaypart: bestPart ? t(DAYPART_KEYS[bestPart.daypart]).split(" ")[0] : null,
    frag,
    t,
    locale,
  });

  const leadFigures = [
    { label: t("patterns.heaviestWeekday"), value: formatDuration(top.avg, locale), hint: top.full },
    ...(frag.medianBlockMs !== null
      ? [{ label: t("patterns.typicalBlock"), value: formatDuration(frag.medianBlockMs, locale) }]
      : []),
  ];

  const config: ChartConfig = {
    avg: { label: t("patterns.avgPerDay"), color: "var(--chart-1)" },
  };

  return (
    <Reading>
      <p className="sr-only">
        {t("patterns.srPeak", { day: top.full, ms: formatDuration(top.avg, locale) })}
        {frag.blockCount > 0
          ? t("patterns.srBlocks", {
              count: frag.blockCount,
              ms: formatDuration(frag.medianBlockMs ?? 0, locale),
            })
          : ""}
      </p>

      {lede && <InsightLede lede={lede} figures={leadFigures} />}

      <TabGrid>
      <section className="space-y-1.5">
        <SectionLabel>{t("patterns.byWeekday")}</SectionLabel>
        <ChartContainer
          config={config}
          className="aspect-auto w-full"
          style={{ height: 7 * 30 + 8 }}
          aria-label={t("patterns.byWeekdayAria", { label: period.label })}
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
                          {t("patterns.tooltipAvgPerDay", { ms: formatDuration(Number(value), locale) })}
                        </span>
                        <span className="text-muted-foreground">
                          {t("patterns.tooltipTotal", {
                            total: formatDuration(p.total, locale),
                            count: p.days,
                          })}
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

      <section className="space-y-1.5 lg:col-span-2">
        <SectionLabel>{t("patterns.byHour")}</SectionLabel>
        <HourHeatmap
          occurrences={occurrences}
          window={period.window}
          timeZone={timeZone}
        />
      </section>

      <section className="space-y-1.5 lg:col-span-2">
        <SectionLabel>{t("patterns.fragmentation")}</SectionLabel>
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          <Figure label={t("patterns.busyBlocks")} value={String(frag.blockCount)} />
          <Figure
            label={t("patterns.typicalBlock")}
            value={frag.medianBlockMs !== null ? formatDuration(frag.medianBlockMs, locale) : "—"}
          />
          <Figure
            label={t("patterns.longestBlock")}
            value={frag.longestBlockMs !== null ? formatDuration(frag.longestBlockMs, locale) : "—"}
          />
          <Figure
            label={t("patterns.shortBlocks")}
            value={
              frag.shortBlockShare !== null
                ? `${Math.round(frag.shortBlockShare * 100)}%`
                : "—"
            }
          />
          <Figure
            label={t("patterns.typicalGap")}
            value={frag.avgGapMs !== null ? formatDuration(frag.avgGapMs, locale) : "—"}
          />
        </dl>
      </section>

      {/* Second half: how that time splits across contexts and the two of you
          (folded in from the former Balance tab). */}
      <div className="border-t border-border/60 lg:col-span-2" aria-hidden />
      <BalanceSections data={data} />
      </TabGrid>
    </Reading>
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
  const t = useTranslations("insights");
  const locale = useLocale();
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
      <SectionLabel>{t("patterns.attributes")}</SectionLabel>
      {!hasAnything ? (
        <SectionEmpty actionLabel={t("empty.openCalendar")} actionHref="/calendar">
          {t("patterns.attributesEmpty")}
        </SectionEmpty>
      ) : (
        <StatGrid>
          <StatCard
            flat
            label={t("patterns.deepWork")}
            value={
              focusSplit.share !== null
                ? `${Math.round(focusSplit.share * 100)}%`
                : "—"
            }
            hint={
              focusSplit.share !== null
                ? t("patterns.deepWorkHint", {
                    ms: formatDuration(focusSplit.deepMs + focusSplit.shallowMs, locale),
                  })
                : t("patterns.deepWorkEmptyHint")
            }
          />
          <StatCard
            flat
            label={t("patterns.bestTimeOfDay")}
            value={best ? t(DAYPART_KEYS[best.daypart]).split(" ")[0] : "—"}
            hint={
              best
                ? t("patterns.bestTimeHint", { mean: best.agg.mean.toFixed(1), n: best.agg.n })
                : t("patterns.needsRatings", { min: MIN_DAYPART_RATINGS })
            }
          />
          {worst && worst.daypart !== best?.daypart && (
            <StatCard
              flat
              label={t("patterns.toughestTimeOfDay")}
              value={t(DAYPART_KEYS[worst.daypart]).split(" ")[0]}
              hint={t("patterns.bestTimeHint", { mean: worst.agg.mean.toFixed(1), n: worst.agg.n })}
            />
          )}
          <StatCard
            flat
            label={t("patterns.energyLevel")}
            value={meanEnergy !== null ? `${meanEnergy.toFixed(1)}/3` : "—"}
            hint={
              meanEnergy !== null && energyTotalMs > 0
                ? t("patterns.energyHint", {
                    pct: Math.round((energyRatedMs / energyTotalMs) * 100),
                  })
                : t("patterns.energyEmptyHint")
            }
          />
        </StatGrid>
      )}
    </section>
  );
}
