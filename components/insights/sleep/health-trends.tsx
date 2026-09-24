"use client";

import { useTranslations } from "next-intl";

import type { HealthDaily } from "@/lib/types";
import { SectionLabel } from "../tab-bits";

/**
 * A bare, single-series trend line — no axes, no legend (one series needs
 * none per the dataviz skill), just direction. Renders nothing below 2
 * plottable points rather than a single dot.
 */
function Sparkline({ values, color }: { values: (number | null)[]; color: string }) {
  const pts = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length < 2 || values.length < 2) return null;

  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const span = max - min || 1;
  const W = 96;
  const H = 28;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - 2 - ((v - min) / span) * (H - 4);
  const d = pts
    .map((p, idx) => `${idx === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="presentation"
      aria-hidden
      className="shrink-0"
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const STAGE_KEYS = ["minutesDeep", "minutesRem", "minutesLight", "minutesAwake"] as const;
const STAGE_COLORS: Record<(typeof STAGE_KEYS)[number], string> = {
  minutesDeep: "var(--chart-1)",
  minutesRem: "var(--chart-2)",
  minutesLight: "var(--chart-3)",
  minutesAwake: "var(--chart-4)",
};
const STAGE_LABEL_KEYS: Record<(typeof STAGE_KEYS)[number], string> = {
  minutesDeep: "sleep.health.stageDeep",
  minutesRem: "sleep.health.stageRem",
  minutesLight: "sleep.health.stageLight",
  minutesAwake: "sleep.health.stageAwake",
};

/**
 * Fitbit Air trends: a calm HRV + resting-heart-rate sparkline pair (last
 * synced value beside a bare trend line, no chart chrome), plus last night's
 * sleep-stage split as one thin stacked bar with direct-labeled minutes
 * underneath. Renders nothing when there's no synced data at all — this is a
 * bonus signal, not a thing the tab depends on.
 */
export function HealthTrendsSection({ days }: { days: HealthDaily[] }) {
  const t = useTranslations("insights");

  const hasAny = days.some(
    (d) => d.hrvMs != null || d.restingHr != null || d.minutesAsleep != null,
  );
  if (!hasAny) return null;

  const hrvSeries = days.map((d) => d.hrvMs);
  const rhrSeries = days.map((d) => d.restingHr);
  const lastHrv = [...hrvSeries].reverse().find((v): v is number => v != null) ?? null;
  const lastRhr = [...rhrSeries].reverse().find((v): v is number => v != null) ?? null;

  const lastNight =
    [...days].reverse().find((d) => STAGE_KEYS.some((k) => d[k] != null)) ?? null;
  const stageTotal = lastNight
    ? STAGE_KEYS.reduce((sum, k) => sum + (lastNight[k] ?? 0), 0)
    : 0;

  return (
    <section className="space-y-3">
      <SectionLabel>{t("sleep.health.title")}</SectionLabel>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t("sleep.health.hrv")}</p>
            <p className="text-sm font-semibold tabular-nums">
              {lastHrv != null ? t("sleep.health.hrvValue", { ms: Math.round(lastHrv) }) : "—"}
            </p>
          </div>
          <Sparkline values={hrvSeries} color="var(--chart-1)" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t("sleep.health.restingHr")}</p>
            <p className="text-sm font-semibold tabular-nums">
              {lastRhr != null ? t("sleep.health.restingHrValue", { bpm: Math.round(lastRhr) }) : "—"}
            </p>
          </div>
          <Sparkline values={rhrSeries} color="var(--chart-2)" />
        </div>
      </div>

      {lastNight && stageTotal > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{t("sleep.health.stagesLastNight")}</p>
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
            {STAGE_KEYS.map((key) => {
              const minutes = lastNight[key] ?? 0;
              if (minutes <= 0) return null;
              return (
                <div
                  key={key}
                  style={{
                    width: `${(minutes / stageTotal) * 100}%`,
                    backgroundColor: STAGE_COLORS[key],
                  }}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {STAGE_KEYS.map((key) => {
              const minutes = lastNight[key];
              if (minutes == null) return null;
              return (
                <span key={key} className="inline-flex items-center gap-1">
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: STAGE_COLORS[key] }}
                  />
                  {t(STAGE_LABEL_KEYS[key], { minutes })}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
