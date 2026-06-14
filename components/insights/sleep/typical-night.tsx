"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";

import { formatDuration } from "@/lib/datetime/format";
import { fromNoon } from "@/lib/sleep/clock";
import type { DerivedNight } from "@/lib/sleep/derive";
import type { SleepPrefs } from "@/lib/sleep/cycles";
import { summarizeNights } from "@/lib/sleep/nights-view";
import type { SleepLog } from "@/lib/types";
import { Figure, SectionLabel } from "../tab-bits";

/**
 * The descriptive companion to the Tonight recommendation: what the viewer's
 * recent nights actually look like (avg per night, avg bedtime, bedtime spread,
 * debt vs target). Quiet label-over-value figures on the paper — NOT KPI cards
 * — so they support the answer beside them without competing with it. Stats
 * come from `summarizeNights`, the same per-night source as the rhythm strip.
 */
export function TypicalNight({
  nights,
  logs,
  prefs,
  timeZone,
}: {
  nights: DerivedNight[];
  logs: SleepLog[];
  prefs: SleepPrefs;
  timeZone: string;
}) {
  const t = useTranslations("sleep");
  const locale = useLocale();
  const s = useMemo(
    () => summarizeNights(nights, logs, prefs, timeZone),
    [nights, logs, prefs, timeZone],
  );

  return (
    <section className="space-y-2" aria-label={t("typicalNight.ariaLabel")}>
      <SectionLabel>{t("typicalNight.label")}</SectionLabel>
      <p className="sr-only">
        {s.nightsWithData > 0
          ? t("typicalNight.srWithData", {
              count: s.nightsWithData,
              avg:
                s.avgMs !== null
                  ? t("typicalNight.srAvgClause", {
                      duration: formatDuration(Math.round(s.avgMs), locale),
                    })
                  : "",
            })
          : t("typicalNight.srNoData")}
      </p>
      <dl className="flex flex-wrap gap-x-7 gap-y-3">
        <Figure
          label={t("typicalNight.avgPerNight")}
          value={s.avgMs !== null ? formatDuration(Math.round(s.avgMs), locale) : "—"}
          hint={t("typicalNight.avgPerNightHint", { count: s.nightsWithData })}
        />
        <Figure
          label={t("typicalNight.avgBedtime")}
          value={s.avgBedtime !== null ? fromNoon(s.avgBedtime) : "—"}
        />
        <Figure
          label={t("typicalNight.bedtimeSpread")}
          value={s.spread !== null ? t("typicalNight.bedtimeSpreadValue", { minutes: Math.round(s.spread) }) : "—"}
          hint={t("typicalNight.bedtimeSpreadHint")}
        />
        <Figure
          label={t("typicalNight.debtVsTarget")}
          value={s.nightsWithData > 0 ? formatDuration(Math.round(s.debtMs), locale) : "—"}
          hint={t("typicalNight.debtVsTargetHint", { duration: formatDuration(s.targetMs, locale) })}
        />
      </dl>
    </section>
  );
}
