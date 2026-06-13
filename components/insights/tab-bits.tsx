// Tiny shared pieces used across the insights tabs.

import { cn } from "@/lib/utils";

/**
 * The two chart heights used across tabs: `standard` for a tab's primary
 * chart, `compact` for supporting ones. Literal class strings so Tailwind
 * sees them. Content-sized charts (donut, weekday rows, sleep quality strip)
 * stay bespoke on purpose.
 */
export const CHART_H = {
  compact: "h-[180px]",
  standard: "h-[220px]",
} as const;

/**
 * A tab's root layout: a single column up to `lg`, two columns at `xl`+ so the
 * widened desktop surface (insights-shell caps content at 1600px) actually
 * fills out instead of leaving big side margins. `items-start` keeps rows
 * ragged — a short card never stretches to a tall neighbour's height. Items
 * opt into the full width with `xl:col-span-2` (primary charts, stat rows,
 * the hour heatmap); everything else flows two-up. The old per-tab
 * `space-y-6` rhythm becomes this grid's `gap-4`.
 */
export function TabGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 items-start gap-4 xl:grid-cols-2", className)}>
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-0.5 text-sm font-semibold text-foreground">{children}</h3>
  );
}

/**
 * A compact inline statistic — a small label over a tabular value — for the
 * secondary numbers that would over-weight a view as a grid of StatCards now
 * that the lede carries the lead metric. Group several inside a
 * `<dl className="flex flex-wrap gap-x-6 gap-y-2">` for a quiet figure row that
 * reads differently from the dashboard stat grids.
 */
export function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** "42%" of a total, "0%" when the total is empty (never NaN). */
export function srPercent(ms: number, total: number): string {
  return `${total > 0 ? Math.round((ms / total) * 100) : 0}%`;
}
