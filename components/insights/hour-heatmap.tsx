"use client";

import { useMemo } from "react";
import { hourHeatmap } from "@/lib/analytics/patterns";
import { formatDuration } from "@/lib/datetime/format";
import { cn } from "@/lib/utils";
import type { Occurrence, TimeWindow } from "@/lib/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_FULL = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/** Quantize a cell to one of 5 steps: 0 · <30m · <1h · <2h · 2h+. */
function stepOf(ms: number): number {
  if (ms <= 0) return 0;
  if (ms < 30 * 60_000) return 1;
  if (ms < 60 * 60_000) return 2;
  if (ms < 120 * 60_000) return 3;
  return 4;
}

const STEP_LABELS = ["0", "<30m", "<1h", "<2h", "2h+"];
/** Alpha of --chart-1 per step (step 0 renders the muted track instead). */
const STEP_ALPHA = [0, 25, 45, 70, 100];

function cellStyle(step: number): React.CSSProperties | undefined {
  if (step === 0) return undefined;
  return {
    backgroundColor: `color-mix(in oklab, var(--chart-1) ${STEP_ALPHA[step]}%, transparent)`,
  };
}

/**
 * Weekday × hour grid of tracked time as a real table (each cell labelled for
 * assistive tech), tinted in 5 quantized steps of the chart accent. Below `sm`
 * the 24 hour columns collapse into six 4-hour bands.
 */
export function HourHeatmap({
  occurrences,
  window,
  timeZone,
}: {
  occurrences: Occurrence[];
  window: TimeWindow;
  timeZone: string;
}) {
  const { cells } = useMemo(
    () => hourHeatmap(occurrences, window, timeZone),
    [occurrences, window, timeZone],
  );

  const bands = useMemo(() => {
    const out: number[] = Array.from({ length: 7 * 6 }, () => 0);
    for (const c of cells) {
      out[c.weekday * 6 + Math.floor(c.hour / 4)] += c.ms;
    }
    return out;
  }, [cells]);

  return (
    <div className="space-y-2">
      {/* Full 24-column grid (≥ sm). */}
      <table className="hidden w-full table-fixed border-separate border-spacing-px sm:table">
        <caption className="sr-only">
          Tracked time by weekday and hour of day
        </caption>
        <thead>
          <tr>
            <th scope="col" className="w-8" aria-label="Weekday" />
            {Array.from({ length: 24 }, (_, h) => (
              <th
                key={h}
                scope="col"
                className="pb-0.5 text-[10px] font-normal text-muted-foreground"
              >
                {h % 6 === 0 ? String(h).padStart(2, "0") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEEKDAYS.map((day, w) => (
            <tr key={day}>
              <th
                scope="row"
                className="pr-1.5 text-right text-[10px] font-normal text-muted-foreground"
              >
                {day}
              </th>
              {Array.from({ length: 24 }, (_, h) => {
                const ms = cells[w * 24 + h].ms;
                return (
                  <td
                    key={h}
                    aria-label={`${WEEKDAYS_FULL[w]} ${String(h).padStart(2, "0")}:00 — ${ms > 0 ? formatDuration(ms) : "nothing"}`}
                    title={`${WEEKDAYS_FULL[w]} ${String(h).padStart(2, "0")}:00 — ${formatDuration(ms)}`}
                    className={cn(
                      "h-4 rounded-[2px]",
                      stepOf(ms) === 0 && "bg-muted/50",
                      // a slightly wider seam every 6 hours so a cell's hour
                      // can be read against the 00/06/12/18 header ticks
                      h % 6 === 0 && h > 0 && "border-l-2 border-l-transparent bg-clip-padding",
                    )}
                    style={cellStyle(stepOf(ms))}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* 4-hour bands (< sm). */}
      <table className="w-full table-fixed border-separate border-spacing-px sm:hidden">
        <caption className="sr-only">
          Tracked time by weekday in 4-hour bands
        </caption>
        <thead>
          <tr>
            <th scope="col" className="w-8" aria-label="Weekday" />
            {Array.from({ length: 6 }, (_, b) => (
              <th
                key={b}
                scope="col"
                className="pb-0.5 text-[10px] font-normal text-muted-foreground"
              >
                {b * 4}–{b * 4 + 4}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEEKDAYS.map((day, w) => (
            <tr key={day}>
              <th
                scope="row"
                className="pr-1.5 text-right text-[10px] font-normal text-muted-foreground"
              >
                {day}
              </th>
              {Array.from({ length: 6 }, (_, b) => {
                const ms = bands[w * 6 + b];
                return (
                  <td
                    key={b}
                    aria-label={`${WEEKDAYS_FULL[w]} ${b * 4}:00–${b * 4 + 4}:00 — ${ms > 0 ? formatDuration(ms) : "nothing"}`}
                    className={cn("h-6 rounded-[2px]", stepOf(ms) === 0 && "bg-muted/50")}
                    style={cellStyle(stepOf(ms))}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Step legend — the scale is absolute, not relative to the busiest cell. */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        {STEP_LABELS.map((label, step) => (
          <span key={label} className="flex items-center gap-1">
            <span
              aria-hidden
              className={cn("size-2.5 rounded-[2px]", step === 0 && "bg-muted/50")}
              style={cellStyle(step)}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
