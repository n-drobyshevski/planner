"use client";

import { useEffect, useState } from "react";
import { msToY, HOUR_PX } from "@/lib/datetime/grid-math";

const DAY_MS = 86_400_000;

/** Minute-ticking current-time indicator for the today column. */
export function NowLine({ dayStart, hourPx = HOUR_PX }: { dayStart: number; hourPx?: number }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (now == null || now < dayStart || now >= dayStart + DAY_MS) return null;

  // The indicator color is a token (defaults to --destructive, the app's red) so
  // surfaces can neutralize it without touching error-state red: the public share
  // overrides --now-line to warm stone (see [data-accent="stone"] in globals.css).
  const color = "var(--now-line, var(--destructive))";

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-30 animate-in fade-in duration-150"
      style={{ top: msToY(now, dayStart, hourPx) }}
      aria-hidden
    >
      <div className="relative h-px w-full" style={{ backgroundColor: color }}>
        <span
          className="absolute -left-1 -top-[3px] size-2 rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}
