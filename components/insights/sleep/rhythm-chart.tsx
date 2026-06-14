"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { format } from "date-fns";
import { tz } from "@date-fns/tz";

import { fromNoon } from "@/lib/sleep/clock";
import { formatDuration, formatTime } from "@/lib/datetime/format";
import { dateFnsLocale } from "@/lib/datetime/date-locale";
import type { HabitualPhase } from "@/lib/sleep/circadian";
import { buildNightViews } from "@/lib/sleep/nights-view";
import type { DerivedNight } from "@/lib/sleep/derive";
import type { SleepLog } from "@/lib/types";
import { SectionLabel } from "../tab-bits";

/**
 * The Sleep tab's signature view: one row per night, a bar spanning bedtime →
 * wake, laid over a soft band marking the viewer's usual sleep window. Aligned
 * left edges read as a steady bedtime; ragged edges as drift — the rhythm is
 * SEEN, not read off a number. Hand-rolled CSS (not recharts) because the night
 * axis is a continuous minutes-since-noon scale (lib/sleep/clock), not a
 * cartesian time series, and a per-night row list is content-sized by design.
 *
 * Geometry comes from minutes-since-noon (bedMin/wakeMin); every DURATION shown
 * reads from durationMs (the truthful elapsed time) — the two can disagree by up
 * to an hour across a DST transition, so they're sourced separately on purpose.
 */
export function RhythmChart({
  nights,
  logs,
  habitualPhase,
  timeZone,
  windowStartHour = 20,
  windowEndHour = 12,
  action,
}: {
  nights: DerivedNight[];
  logs: SleepLog[];
  habitualPhase: HabitualPhase | null;
  timeZone: string;
  /** night-window evening start hour (wall, default 20:00) */
  windowStartHour?: number;
  /** night-window morning end hour (wall, default 12:00) */
  windowEndHour?: number;
  /** header-right slot — the backfill entry point lives with the rhythm it edits */
  action?: React.ReactNode;
}) {
  const t = useTranslations("sleep");
  const locale = useLocale();
  const dfLocale = dateFnsLocale(locale);
  const views = useMemo(
    () => buildNightViews(nights, logs, timeZone),
    [nights, logs, timeZone],
  );

  // Display domain in minutes-since-noon: 20:00 → 480; the wake-day noon → 1440.
  // (evening hour ≥12 → (h−12)·60; morning hour → (h+12)·60, so 12 → 1440.)
  const domStart = (windowStartHour >= 12 ? windowStartHour - 12 : windowStartHour + 12) * 60;
  const domEnd = (windowEndHour + 12) * 60;
  const span = Math.max(1, domEnd - domStart);
  const pct = (min: number) =>
    Math.max(0, Math.min(100, ((min - domStart) / span) * 100));
  const hourMin = (h: number) => (h >= 12 ? h - 12 : h + 12) * 60;

  const ticks = [21, 0, 3, 6, 9]
    .map((h) => ({ h, min: hourMin(h) }))
    .filter((t) => t.min >= domStart && t.min <= domEnd);

  const withData = views.filter((v) => v.bedMin !== null && v.wakeMin !== null);

  // The "usual night" band + bedtime marker — only once there's enough history
  // to trust a habitual phase (computeHabitualPhase returns null below that).
  const bandLeft = habitualPhase ? pct(habitualPhase.bedtimeMinSinceNoon) : null;
  const bandRight =
    habitualPhase?.wakeMinSinceNoon != null
      ? pct(habitualPhase.wakeMinSinceNoon)
      : null;

  const ROW = "h-5"; // 20px rows — airy, scannable, and compact over a month

  const srSummary = (() => {
    if (withData.length === 0) return t("rhythm.srNoData");
    const usual =
      habitualPhase && habitualPhase.wakeMinSinceNoon != null
        ? t("rhythm.srUsualWindow", {
            start: fromNoon(habitualPhase.bedtimeMinSinceNoon),
            end: fromNoon(habitualPhase.wakeMinSinceNoon),
          })
        : "";
    return t("rhythm.srSummary", { count: withData.length, usual });
  })();

  return (
    <section className="space-y-3" aria-label={t("rhythm.ariaLabel")}>
      <div className="flex min-h-8 items-center justify-between gap-2">
        <SectionLabel>{t("rhythm.label")}</SectionLabel>
        {action}
      </div>

      <p className="sr-only">{srSummary}</p>

      {withData.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("rhythm.empty")}
        </p>
      ) : (
        <>
          {/* The visual is decorative; the sr-only summary + table below carry
              the data (same split as the Overview share bar). */}
          <div className="flex gap-2" aria-hidden>
            {/* date gutter */}
            <div className="shrink-0">
              {views.map((v) => (
                <div
                  key={v.dateKey}
                  className={`flex ${ROW} items-center text-[10px] tabular-nums text-muted-foreground`}
                >
                  {format(v.dayStartMs, "EEE d", { in: tz(timeZone), locale: dfLocale })}
                </div>
              ))}
              <div className="h-4" />
            </div>

            {/* tracks + overlays */}
            <div className="min-w-0 flex-1">
              <div className="relative">
                {/* usual-window band (soft wash, no text sits over it) */}
                {bandLeft !== null && bandRight !== null && (
                  <div
                    className="absolute inset-y-0 rounded-sm bg-primary/10"
                    style={{ left: `${bandLeft}%`, width: `${bandRight - bandLeft}%` }}
                  />
                )}
                {/* usual bedtime — the one terracotta accent */}
                {bandLeft !== null && (
                  <div
                    className="absolute inset-y-0 border-l border-dashed border-primary/60"
                    style={{ left: `${bandLeft}%` }}
                  />
                )}

                {views.map((v) => {
                  const has = v.bedMin !== null && v.wakeMin !== null;
                  const left = has ? pct(v.bedMin as number) : 0;
                  const right = has ? pct(v.wakeMin as number) : 0;
                  return (
                    <div
                      key={v.dateKey}
                      className={`relative ${ROW}`}
                      title={
                        has
                          ? t("rhythm.rowTitle", {
                              date: format(v.dayStartMs, "EEE d MMM", { in: tz(timeZone), locale: dfLocale }),
                              bedtime: formatTime(v.bedAt as number, timeZone),
                              wake: formatTime(v.wakeAt as number, timeZone),
                              duration: formatDuration(v.durationMs, locale),
                              source: v.source === "logged" ? t("rhythm.sourceLogged") : t("rhythm.sourceCalendar"),
                            })
                          : undefined
                      }
                    >
                      {/* hairline rail grounds every night, so a missing one
                          reads as a gap in the rhythm rather than nothing */}
                      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/70" />
                      {has && (
                        <div
                          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full"
                          style={{
                            left: `${left}%`,
                            width: `${right - left}%`,
                            minWidth: "3px",
                            background:
                              v.source === "logged"
                                ? "var(--chart-1)"
                                : "repeating-linear-gradient(45deg, var(--chart-1) 0 1.5px, transparent 1.5px 4px)",
                          }}
                        />
                      )}
                    </div>
                  );
                })}

                {/* hour axis */}
                <div className="relative mt-1 h-4">
                  {ticks.map((t) => (
                    <span
                      key={t.h}
                      className="absolute -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground"
                      style={{ left: `${pct(t.min)}%` }}
                    >
                      {fromNoon(t.min)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("rhythm.legend", {
              band: bandLeft !== null ? t("rhythm.legendBand") : "",
            })}
          </p>

          {/* accessible detail */}
          <table className="sr-only">
            <caption>{t("rhythm.tableCaption")}</caption>
            <thead>
              <tr>
                <th>{t("rhythm.tableNight")}</th>
                <th>{t("rhythm.tableBedtime")}</th>
                <th>{t("rhythm.tableWake")}</th>
                <th>{t("rhythm.tableInBed")}</th>
                <th>{t("rhythm.tableSource")}</th>
              </tr>
            </thead>
            <tbody>
              {withData.map((v) => (
                <tr key={v.dateKey}>
                  <td>{format(v.dayStartMs, "EEE d MMM", { in: tz(timeZone), locale: dfLocale })}</td>
                  <td>{formatTime(v.bedAt as number, timeZone)}</td>
                  <td>{formatTime(v.wakeAt as number, timeZone)}</td>
                  <td>{formatDuration(v.durationMs, locale)}</td>
                  <td>{v.source === "logged" ? t("rhythm.sourceLogged") : t("rhythm.sourceCalendar")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
