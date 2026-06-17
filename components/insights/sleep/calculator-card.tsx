"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Calculator } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { TimeField } from "@/components/ui/time-field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDuration, formatTime } from "@/lib/datetime/format";
import {
  bedtimesForWake,
  wakesForBedtime,
  type SleepPrefs,
} from "@/lib/sleep/cycles";

type Mode = "wake" | "bed";

/**
 * Bidirectional cycle calculator: wake time → bedtimes, or bedtime → wake
 * times. Pure client state over wall-clock "HH:mm" — the cycle math is
 * deliberately offset-based (lib/sleep/cycles), so results are shown as wall
 * times directly; a DST-transition night shifts real durations by the
 * skipped/repeated hour, which matches what people expect from "count back
 * 7.5 hours".
 */
export function CalculatorCard({ prefs }: { prefs: SleepPrefs }) {
  const t = useTranslations("sleep");
  const locale = useLocale();
  const [mode, setMode] = useState<Mode>("wake");
  const [time, setTime] = useState("07:00");

  // Anchor at an arbitrary midnight: only the wall-clock arithmetic matters
  // for display, and rendering hh:mm from a fixed UTC day keeps it pure.
  const [h, m] = time.split(":").map(Number);
  const anchor = Date.UTC(2026, 0, 5, h, m); // any Monday works
  const rows =
    mode === "wake"
      ? bedtimesForWake(anchor, prefs).map((o) => ({
          cycles: o.cycles,
          ms: o.bedtimeMs,
          durationMs: o.durationMs,
        }))
      : wakesForBedtime(anchor, prefs).map((o) => ({
          cycles: o.cycles,
          ms: o.wakeMs,
          durationMs: o.durationMs,
        }));

  return (
    <section
      aria-label={t("calculator.ariaLabel")}
      className="rounded-lg border bg-card p-3 shadow-soft"
    >
      <div className="flex items-center gap-2">
        <Calculator aria-hidden className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">{t("calculator.title")}</h3>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <Field className="min-w-0">
          <FieldLabel htmlFor="sleep-calc-mode">{t("calculator.iKnowMy")}</FieldLabel>
          <ToggleGroup
            id="sleep-calc-mode"
            type="single"
            variant="outline"
            aria-label={t("calculator.directionAriaLabel")}
            value={mode}
            onValueChange={(v) => {
              if (v === "wake" || v === "bed") setMode(v);
            }}
          >
            <ToggleGroupItem value="wake" className="min-h-11 px-3 pointer-fine:min-h-9">
              {t("calculator.wakeTime")}
            </ToggleGroupItem>
            <ToggleGroupItem value="bed" className="min-h-11 px-3 pointer-fine:min-h-9">
              {t("calculator.bedtime")}
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Field className="w-28">
          <FieldLabel htmlFor="sleep-calc-time">
            {mode === "wake" ? t("calculator.wakeAt") : t("calculator.inBedAt")}
          </FieldLabel>
          <TimeField
            id="sleep-calc-time"
            value={time}
            onChange={setTime}
            aria-label={mode === "wake" ? t("calculator.wakeTime") : t("calculator.bedtime")}
          />
        </Field>
      </div>
      <ul role="list" className="mt-3 flex flex-col gap-1">
        {rows.map((r) => (
          <li
            key={r.cycles}
            className="flex items-center gap-2 rounded-md border px-2.5 py-1.5"
          >
            <span className="text-sm font-semibold tabular-nums">
              {/* anchor is UTC, so format in UTC to read the wall offsets back */}
              {formatTime(r.ms, "UTC")}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {mode === "wake" ? t("calculator.goToBed") : t("calculator.wakeUp")} ·{" "}
              {t("calculator.rowDetail", {
                duration: formatDuration(r.durationMs, locale),
                cycles: r.cycles,
              })}
            </span>
          </li>
        ))}
      </ul>
      <FieldDescription className="mt-2">
        {t.rich("calculator.description", {
          cycle: prefs.cycleLengthMin,
          onset: prefs.onsetLatencyMin,
          link: (chunks) => (
            <Link
              href="/settings?section=sleep"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {chunks}
            </Link>
          ),
        })}
      </FieldDescription>
    </section>
  );
}
