// Tiny shared pieces used across the insights tabs.

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
