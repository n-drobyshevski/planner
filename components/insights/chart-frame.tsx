// One chart language for every Insights time-series chart. Recharts identifies
// axes and grids by element TYPE while walking its children, so a wrapper
// component (`<InsightsXAxis/>`) would not be recognised — these helpers return
// the real <XAxis>/<CartesianGrid> ELEMENT instead, kept as a direct child of
// the chart. The shared margin, the faint warm baseline grid, and the tooltip
// row keep bars, ticks, and hovers consistent across Overview / Trends / Tasks
// instead of drifting per copy-paste.

import { CartesianGrid, XAxis, YAxis } from "recharts";

/** Shared plot margin. A little top room so the tallest bar/point never clips. */
export const INSIGHTS_CHART_MARGIN = { top: 8, right: 4, left: 4, bottom: 0 } as const;

/**
 * The bucketed category-time X axis shared by the per-day / per-bucket charts:
 * no axis line, sparse ticks that keep the first and last, a caller-supplied
 * formatter for the tick label.
 */
export function insightsXAxis(opts: {
  dataKey?: string;
  tickFormatter: (value: string) => string;
}) {
  return (
    <XAxis
      dataKey={opts.dataKey ?? "key"}
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      minTickGap={24}
      interval="preserveStartEnd"
      tickFormatter={opts.tickFormatter}
    />
  );
}

/**
 * A hidden Y axis that still establishes the 0→max scale (so bars/lines have a
 * baseline) and pins the tick count the grid draws against. `tickCount` 3 gives
 * the faint grid a baseline, a midline, and a top line — a sense of scale
 * without a wall of rules.
 */
export function insightsYAxis(opts?: { tickCount?: number }) {
  return <YAxis hide domain={[0, "dataMax"]} tickCount={opts?.tickCount ?? 3} />;
}

/**
 * Faint horizontal gridlines so a bar's height reads against a scale instead of
 * floating. Horizontal only (vertical rules would fight the time axis); the
 * default `#ccc` stroke is remapped to the warm `border/50` by ChartContainer.
 */
export function insightsGrid() {
  return <CartesianGrid vertical={false} strokeOpacity={0.7} />;
}

/**
 * A single tooltip row: color swatch + series label on the left, a mono tabular
 * value on the right. Used inside ChartTooltipContent's `formatter` (a plain
 * render helper, not a Recharts child) so every chart's hover reads the same.
 */
export function TooltipRow({
  color,
  label,
  value,
}: {
  color?: string;
  label: React.ReactNode;
  value: string;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <span className="flex items-center gap-1.5">
        {color !== undefined && (
          <span
            className="size-2 shrink-0 rounded-[2px]"
            style={{ background: color }}
            aria-hidden
          />
        )}
        {label}
      </span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}
