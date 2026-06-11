import { ChartSkeleton } from "./chart-skeleton";
import { StatGrid } from "./stat-card";

/**
 * Content-shaped placeholder for the whole tab area on first load (before any
 * insights data exists). Mirrors the shared tab anatomy — stat row, primary
 * chart, supporting chart — so real content lands without a layout jump.
 * Chunk-level loading keeps using ChartSkeleton directly.
 */
export function InsightsTabSkeleton() {
  return (
    <div aria-hidden className="space-y-5">
      <StatGrid>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-lg border bg-card p-2.5 shadow-soft">
            <div className="h-3 w-16 rounded bg-muted/60 motion-safe:animate-pulse" />
            <div className="mt-1.5 h-5 w-12 rounded bg-muted/60 motion-safe:animate-pulse" />
          </div>
        ))}
      </StatGrid>
      <ChartSkeleton height={220} />
      <ChartSkeleton height={180} />
    </div>
  );
}
