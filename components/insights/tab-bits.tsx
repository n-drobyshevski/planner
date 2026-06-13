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
    <h3 className="px-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

/** "42%" of a total, "0%" when the total is empty (never NaN). */
export function srPercent(ms: number, total: number): string {
  return `${total > 0 ? Math.round((ms / total) * 100) : 0}%`;
}
