"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";

import { formatDayMonthToken, formatDuration } from "@/lib/datetime/format";
import type { SleepLog } from "@/lib/types";
import { SectionLabel } from "../tab-bits";

const MIN_MS = 60_000;
/** The most recent nights listed; older ones live in the rhythm strip. */
const MAX_ROWS = 7;

type StageKey = "deep" | "light" | "rem" | "awake";

/**
 * Stage order and colour. Hue is never the only cue: the bar keeps this order
 * on every row, the legend names it, and each row carries a text summary for
 * screen readers. Light sleep and awake stay neutral, so the two stages people
 * look for (deep, REM) are the only coloured ones.
 */
const STAGES: { key: StageKey; color: string }[] = [
  { key: "deep", color: "var(--chart-4)" },
  { key: "light", color: "color-mix(in oklab, var(--chart-1) 45%, transparent)" },
  { key: "rem", color: "var(--chart-5)" },
  { key: "awake", color: "color-mix(in oklab, var(--muted-foreground) 30%, transparent)" },
];

export interface StageNight {
  date: string;
  asleepMin: number | null;
  minutes: Record<StageKey, number>;
  fromDevice: boolean;
}

/** The nights in [logs] that carry stage minutes, newest first. */
export function stageNights(logs: SleepLog[], max = MAX_ROWS): StageNight[] {
  return logs
    .filter((l) => l.deepMin !== null || l.lightMin !== null || l.remMin !== null)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, max)
    .map((l) => ({
      date: l.date,
      asleepMin: l.asleepMin,
      minutes: {
        deep: l.deepMin ?? 0,
        light: l.lightMin ?? 0,
        rem: l.remMin ?? 0,
        awake: l.awakeMin ?? 0,
      },
      fromDevice: l.timesSource === "health_connect",
    }));
}

/**
 * Sleep stages per night, from a tracker synced through Health Connect on
 * Android. Renders nothing when no night in the period has stages, so members
 * without a tracker never see an empty block.
 */
export function StagesSection({ logs }: { logs: SleepLog[] }) {
  const t = useTranslations("sleep");
  const locale = useLocale();
  const rows = useMemo(() => stageNights(logs), [logs]);
  if (rows.length === 0) return null;

  return (
    <section className="space-y-2">
      <SectionLabel>{t("stages.label")}</SectionLabel>
      <ul className="space-y-2.5">
        {rows.map((night) => {
          const total = STAGES.reduce((s, st) => s + night.minutes[st.key], 0);
          const day = formatDayMonthToken(night.date, locale);
          const asleep =
            night.asleepMin !== null ? formatDuration(night.asleepMin * MIN_MS, locale) : null;
          const summary = STAGES.map((st) =>
            t(`stages.sr.${st.key}`, {
              duration: formatDuration(night.minutes[st.key] * MIN_MS, locale),
            }),
          ).join(", ");
          return (
            <li key={night.date} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-muted-foreground">{day}</span>
                <span className="tabular-nums">
                  {asleep !== null ? t("stages.asleep", { duration: asleep }) : null}
                </span>
              </div>
              <div
                aria-hidden
                className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
              >
                {total > 0 &&
                  STAGES.map((st) =>
                    night.minutes[st.key] > 0 ? (
                      <span
                        key={st.key}
                        data-stage={st.key}
                        className="h-full"
                        style={{
                          width: `${(night.minutes[st.key] / total) * 100}%`,
                          background: st.color,
                        }}
                      />
                    ) : null,
                  )}
              </div>
              <p className="sr-only">{t("stages.srNight", { day, summary })}</p>
            </li>
          );
        })}
      </ul>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {STAGES.map((st) => (
          <span key={st.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: st.color }}
            />
            {t(`stages.legend.${st.key}`)}
          </span>
        ))}
        {rows.some((r) => r.fromDevice) && <span>· {t("stages.fromHealthConnect")}</span>}
      </p>
    </section>
  );
}
