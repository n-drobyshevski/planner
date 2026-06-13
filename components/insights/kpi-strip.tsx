"use client";

// KPI cards with an explicit judgment line — the dashboard pattern of judging
// a value against a target/baseline (good / neutral / attention) instead of
// showing a bare number. The judgment is always icon + text + color, never
// color alone, and the tone stays calm (no red alarms for personal data).

import { CircleAlert, CircleCheck, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DeltaBadge } from "./stat-card";
import type { Delta } from "@/lib/analytics/trends";

export type JudgmentTone = "good" | "neutral" | "attention";

export interface Judgment {
  tone: JudgmentTone;
  /** Short clause, e.g. "above your typical week", "on track". */
  text: string;
}

const JUDGMENT_ICONS: Record<JudgmentTone, LucideIcon> = {
  good: CircleCheck,
  neutral: Minus,
  attention: CircleAlert,
};

const JUDGMENT_CLASSES: Record<JudgmentTone, string> = {
  good: "text-[var(--swatch-green)]",
  neutral: "text-muted-foreground",
  attention: "text-destructive",
};

export function JudgmentLine({
  judgment,
  className,
}: {
  judgment: Judgment;
  className?: string;
}) {
  const Icon = JUDGMENT_ICONS[judgment.tone];
  return (
    <div
      className={cn(
        "flex items-center gap-1 text-[11px]",
        JUDGMENT_CLASSES[judgment.tone],
        className,
      )}
    >
      <Icon aria-hidden className="size-3 shrink-0" />
      <span className="truncate">
        <span className="sr-only">{judgment.tone === "attention" ? "needs attention: " : ""}</span>
        {judgment.text}
      </span>
    </div>
  );
}

/** StatCard variant with the judgment line; same visual family. */
export function KpiCard({
  label,
  value,
  delta,
  judgment,
  hint,
  emphasis = false,
  className,
}: {
  label: string;
  value: string;
  delta?: Delta;
  judgment?: Judgment;
  hint?: string;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card shadow-soft",
        emphasis ? "p-3" : "p-2.5",
        className,
      )}
    >
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span
          className={cn(
            "leading-tight font-semibold tabular-nums",
            emphasis ? "text-lg" : "text-base",
          )}
        >
          {value}
        </span>
        {delta && <DeltaBadge delta={delta} />}
      </div>
      {judgment && <JudgmentLine judgment={judgment} className="mt-0.5" />}
      {hint && !judgment && (
        <div className="truncate text-[11px] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}
