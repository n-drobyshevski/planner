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
 * A tab's root layout: a single column up to `lg`, two columns at `lg`+ so a
 * laptop (1024px+) already uses the widened desktop surface (insights-shell
 * caps content at 1600px) instead of running one narrow column. `items-start`
 * keeps rows ragged — a short card never stretches to a tall neighbour's
 * height. Items opt into the full width with `lg:col-span-2` (primary charts,
 * stat rows, the hour heatmap); everything else flows two-up. The old per-tab
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
    <div className={cn("grid grid-cols-1 items-start gap-4 lg:grid-cols-2", className)}>
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
 * The reading's structural spacing. A tab is three "movements" — the answer,
 * the evidence, what to do — set apart by a wider gap than the sections inside
 * each. `Reading` stacks them; `Movement` groups a labelled run of sections.
 * Grouping comes from rhythm, never from extra chrome (no eyebrows, no nested
 * cards) — the warm paper carries the structure.
 */
export function Reading({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-6", className)}>{children}</div>;
}

/**
 * One lead figure — a bigger sibling of `Figure` for the 2–3 headline numbers
 * that sit under a tab's answer sentence. Still a label-over-value on the paper,
 * NOT a bordered KPI card: the value is a step up (text-base) so the answer's
 * supporting numbers read first, without becoming a hero metric.
 */
export function LeadFigures({
  items,
  className,
}: {
  items: { label: string; value: string; hint?: string }[];
  className?: string;
}) {
  return (
    <dl className={cn("flex flex-wrap gap-x-7 gap-y-2", className)}>
      {items.map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{f.label}</dt>
          <dd className="text-base leading-tight font-semibold tabular-nums">
            {f.value}
          </dd>
          {f.hint && (
            <dd className="text-[11px] text-muted-foreground">{f.hint}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}

/**
 * A compact inline statistic — a small label over a tabular value — for the
 * secondary numbers that would over-weight a view as a grid of StatCards now
 * that the lede carries the lead metric. Group several inside a
 * `<dl className="flex flex-wrap gap-x-6 gap-y-2">` for a quiet figure row that
 * reads differently from the dashboard stat grids.
 */
export function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-[11px] text-muted-foreground">{hint}</dd>}
    </div>
  );
}

/** "42%" of a total, "0%" when the total is empty (never NaN). */
export function srPercent(ms: number, total: number): string {
  return `${total > 0 ? Math.round((ms / total) * 100) : 0}%`;
}
