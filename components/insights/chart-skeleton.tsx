import { cn } from "@/lib/utils";

/**
 * Fixed-height placeholder while a lazy chart chunk or its data loads.
 * Reserves the chart's height (no layout jump) and pulses only when motion
 * is allowed.
 */
export function ChartSkeleton({
  className,
  height = 200,
}: {
  className?: string;
  height?: number;
}) {
  return (
    <div
      aria-hidden
      style={{ height }}
      className={cn("w-full rounded-lg bg-muted/60 motion-safe:animate-pulse", className)}
    />
  );
}
