"use client";

// A tiny, axis-free trend drawn inside a KPI card — the per-day (or per-night,
// per-bucket) shape behind a single number, at a glance. Decorative by design:
// the card's value and explainer carry the meaning, so the chart is aria-hidden.
// Imports recharts, so it lives in its own module that only the lazy tab chunks
// pull in — never the route bundle (mirrors the chart-card split).

import { Area, AreaChart, Line, LineChart, ResponsiveContainer } from "recharts";
import { usePrefersReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

export function Sparkline({
  data,
  kind = "area",
  color = "var(--chart-1)",
  className,
}: {
  data: number[];
  kind?: "area" | "line";
  color?: string;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  // One point can't draw a trend; let the card stand on its number alone.
  if (data.length < 2) return null;
  const rows = data.map((v, i) => ({ i, v }));

  return (
    <div aria-hidden className={cn("h-8 w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        {kind === "area" ? (
          <AreaChart data={rows} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <Area
              dataKey="v"
              type="monotone"
              stroke={color}
              strokeWidth={1.5}
              fill={color}
              fillOpacity={0.15}
              dot={false}
              isAnimationActive={!reduced}
            />
          </AreaChart>
        ) : (
          <LineChart data={rows} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <Line
              dataKey="v"
              type="monotone"
              stroke={color}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={!reduced}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
