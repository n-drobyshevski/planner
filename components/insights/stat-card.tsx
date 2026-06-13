"use client";

import { CircleAlert, CircleCheck, Minus, TriangleAlert, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MetricInfo } from "./insight-card";
import type { MetricKey } from "@/lib/insights/metric-defs";
import type { Delta } from "@/lib/analytics/trends";

/**
 * Compact change indicator vs the previous period, as a shadcn Badge. Direction
 * is carried by the arrow glyph + aria-label (never color alone); the tone stays
 * neutral — more or less time isn't inherently good or bad on a calendar. A null
 * pct with movement means the previous period was empty → "new".
 */
export function DeltaBadge({ delta, className }: { delta: Delta; className?: string }) {
  let glyph: string;
  let text: string;
  let srText: string;
  if (delta.deltaPct === null) {
    if (delta.delta === 0) {
      glyph = "–";
      text = "";
      srText = "no change vs previous period";
    } else {
      glyph = "▲";
      text = "new";
      srText = "new — nothing in the previous period";
    }
  } else {
    const pct = Math.round(Math.abs(delta.deltaPct) * 100);
    glyph = delta.deltaPct > 0 ? "▲" : delta.deltaPct < 0 ? "▼" : "–";
    text = `${pct}%`;
    srText =
      delta.deltaPct === 0
        ? "no change vs previous period"
        : `${delta.deltaPct > 0 ? "up" : "down"} ${pct}% vs previous period`;
  }
  return (
    <Badge
      variant="secondary"
      aria-label={srText}
      className={cn(
        "gap-0.5 px-1.5 font-normal text-muted-foreground tabular-nums",
        className,
      )}
    >
      <span aria-hidden className="text-[9px] leading-none">
        {glyph}
      </span>
      {text && <span aria-hidden>{text}</span>}
    </Badge>
  );
}

// --- Judgment (good / neutral / attention), the dashboard pattern of judging a
// value against a target/baseline instead of leaving a bare number. Always icon
// + text + color, never color alone; the tone stays calm (no red alarms for
// personal data). Moved here from the former kpi-strip so the KPI card is the
// single place that owns it.

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
        <span className="sr-only">
          {judgment.tone === "attention" ? "needs attention: " : ""}
        </span>
        {judgment.text}
      </span>
    </div>
  );
}

/**
 * The unified KPI tile (shadcn Card): label + optional explainer, a big tabular
 * value with an optional delta badge, then either a judgment line or a plain
 * hint, and an optional decorative sparkline. `emphasis` makes it the tab's lead
 * metric; `warning` tints the value for hard attention (e.g. overdue > 0).
 */
export function StatCard({
  label,
  value,
  delta,
  hint,
  judgment,
  metric,
  sparkline,
  warning = false,
  emphasis = false,
  className,
}: {
  label: string;
  value: string;
  delta?: Delta;
  hint?: string;
  /** judged reading (good/neutral/attention) — shown instead of the hint */
  judgment?: Judgment;
  /** wires a MetricInfo explainer beside the label */
  metric?: MetricKey;
  /** a <Sparkline/> node (kept as a node so this module stays recharts-free) */
  sparkline?: React.ReactNode;
  /** icon + tint the value for attention (e.g. overdue count > 0) */
  warning?: boolean;
  /** the tab's lead metric — bigger value, slightly roomier card */
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <Card size="sm" className={cn("justify-between gap-1.5 px-3 py-3", className)}>
      <div className="flex items-start justify-between gap-1.5">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        {metric && <MetricInfo metric={metric} label={label} />}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "leading-tight font-semibold tabular-nums",
            emphasis ? "text-2xl" : "text-base",
            warning && "text-destructive",
          )}
        >
          {warning && (
            <>
              <TriangleAlert
                aria-hidden
                className="mr-1 inline size-3.5 align-[-0.125em]"
              />
              <span className="sr-only">needs attention: </span>
            </>
          )}
          {value}
        </span>
        {delta && <DeltaBadge delta={delta} />}
      </div>
      {judgment ? (
        <JudgmentLine judgment={judgment} />
      ) : hint ? (
        <div className="truncate text-[11px] text-muted-foreground">{hint}</div>
      ) : null}
      {sparkline}
    </Card>
  );
}

/**
 * Responsive KPI grid: 2-up on phones, denser as space allows. Density keys off
 * the grid's OWN width via a container query — so the same component reads right
 * whether it spans the full insights column or sits in a half-width cell. Tiles
 * carry more now (explainer, judgment, sparkline), so the ceiling is 4-up.
 */
export function StatGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("@container", className)}>
      <div className="grid grid-cols-2 gap-2 @md:grid-cols-3 @2xl:grid-cols-4">
        {children}
      </div>
    </div>
  );
}
