"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { Delta } from "@/lib/analytics/trends";

/**
 * Compact change indicator vs the previous period. Direction is carried by
 * the arrow glyph + aria-label (never color alone); the tone stays neutral —
 * more or less time isn't inherently good or bad on a calendar. A null pct
 * with movement means the previous period was empty → "new".
 */
export function DeltaBadge({ delta, className }: { delta: Delta; className?: string }) {
  const t = useTranslations("insights");
  let glyph: string;
  let text: string;
  let srText: string;
  if (delta.deltaPct === null) {
    if (delta.delta === 0) {
      glyph = "–";
      text = "";
      srText = t("delta.noChange");
    } else {
      glyph = "▲";
      text = t("delta.new");
      srText = t("delta.newSr");
    }
  } else {
    const pct = Math.round(Math.abs(delta.deltaPct) * 100);
    glyph = delta.deltaPct > 0 ? "▲" : delta.deltaPct < 0 ? "▼" : "–";
    text = `${pct}%`;
    srText =
      delta.deltaPct === 0
        ? t("delta.noChange")
        : delta.deltaPct > 0
          ? t("delta.up", { pct })
          : t("delta.down", { pct });
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
  emphasis = false,
  flat = false,
  className,
}: {
  label: string;
  value: string;
  delta?: Delta;
  hint?: string;
  /** icon + tint the value for attention (e.g. overdue count > 0) */
  warning?: boolean;
  /** slightly larger value + roomier card; the InsightLede sentence, not a
   *  StatCard, owns the tab's lead metric now */
  emphasis?: boolean;
  /** drop the card frame — a borderless figure on the paper (the de-cardified
   *  default for insights grids; warm paper carries the grouping, not a box) */
  flat?: boolean;
  className?: string;
}) {
  const t = useTranslations("insights");
  return (
    <div
      className={cn(
        flat
          ? "min-w-0"
          : cn("rounded-lg border bg-card shadow-soft", emphasis ? "p-3" : "p-2.5"),
        className,
      )}
    >
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span
          className={cn(
            "leading-tight font-semibold tabular-nums",
            emphasis ? "text-lg" : "text-base",
            warning && "text-destructive",
          )}
        >
          {warning && (
            <>
              <TriangleAlert
                aria-hidden
                className="mr-1 inline size-3.5 align-[-0.125em]"
              />
              <span className="sr-only">{t("stat.needsAttention")}</span>
            </>
          )}
          {value}
        </span>
        {delta && <DeltaBadge delta={delta} />}
      </div>
      {hint && <div className="truncate text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/**
 * Responsive stat grid: 2-up on phones, denser as space allows. Density keys
 * off the grid's OWN width via a container query — so the same component reads
 * right whether it spans the full insights column (6–7 up) or sits in a
 * half-width dashboard cell (~4 up), without the caller knowing where it lives.
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
      <div className="grid grid-cols-2 gap-2 @sm:grid-cols-3 @lg:grid-cols-4 @3xl:grid-cols-6 @5xl:grid-cols-7">
        {children}
      </div>
    </div>
  );
}
