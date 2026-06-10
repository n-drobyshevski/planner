"use client";

import { cn } from "@/lib/utils";
import type { Delta } from "@/lib/analytics/trends";

/**
 * Compact change indicator vs the previous period. Direction is carried by
 * the arrow glyph + aria-label (never color alone); the tone stays neutral —
 * more or less time isn't inherently good or bad on a calendar. A null pct
 * with movement means the previous period was empty → "new".
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
    <span
      aria-label={srText}
      className={cn(
        "inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums text-muted-foreground",
        className,
      )}
    >
      <span aria-hidden className="text-[9px] leading-none">
        {glyph}
      </span>
      <span aria-hidden>{text}</span>
    </span>
  );
}

/** Label / big tabular value / optional delta + hint, insights flavor. */
export function StatCard({
  label,
  value,
  delta,
  hint,
  warning = false,
}: {
  label: string;
  value: string;
  delta?: Delta;
  hint?: string;
  /** tint the value for attention (e.g. overdue count > 0) */
  warning?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-2.5 shadow-soft">
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span
          className={cn(
            "text-base leading-tight font-semibold tabular-nums",
            warning && "text-destructive",
          )}
        >
          {value}
        </span>
        {delta && <DeltaBadge delta={delta} />}
      </div>
      {hint && <div className="truncate text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Responsive stat grid: 2-up on phones, denser as space allows. */
export function StatGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4", className)}>
      {children}
    </div>
  );
}
