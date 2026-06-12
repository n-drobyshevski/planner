"use client";

import { useState } from "react";
import Link from "next/link";
import { Calculator } from "lucide-react";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { TimeField } from "@/components/ui/time-field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDuration, formatTime } from "@/lib/datetime/format";
import {
  bedtimesForWake,
  wakesForBedtime,
  type SleepPrefs,
} from "@/lib/sleep/cycles";

type Mode = "wake" | "bed";

/**
 * Bidirectional cycle calculator: wake time → bedtimes, or bedtime → wake
 * times. Pure client state over wall-clock "HH:mm" — the cycle math is
 * deliberately offset-based (lib/sleep/cycles), so results are shown as wall
 * times directly; a DST-transition night shifts real durations by the
 * skipped/repeated hour, which matches what people expect from "count back
 * 7.5 hours".
 */
export function CalculatorCard({ prefs }: { prefs: SleepPrefs }) {
  const [mode, setMode] = useState<Mode>("wake");
  const [time, setTime] = useState("07:00");

  // Anchor at an arbitrary midnight: only the wall-clock arithmetic matters
  // for display, and rendering hh:mm from a fixed UTC day keeps it pure.
  const [h, m] = time.split(":").map(Number);
  const anchor = Date.UTC(2026, 0, 5, h, m); // any Monday works
  const rows =
    mode === "wake"
      ? bedtimesForWake(anchor, prefs).map((o) => ({
          cycles: o.cycles,
          ms: o.bedtimeMs,
          durationMs: o.durationMs,
        }))
      : wakesForBedtime(anchor, prefs).map((o) => ({
          cycles: o.cycles,
          ms: o.wakeMs,
          durationMs: o.durationMs,
        }));

  return (
    <section
      aria-label="Sleep cycle calculator"
      className="rounded-lg border bg-card p-3 shadow-soft"
    >
      <div className="flex items-center gap-2">
        <Calculator aria-hidden className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Cycle calculator</h3>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <Field className="min-w-0">
          <FieldLabel htmlFor="sleep-calc-mode">I know my…</FieldLabel>
          <ToggleGroup
            id="sleep-calc-mode"
            type="single"
            variant="outline"
            aria-label="Calculator direction"
            value={mode}
            onValueChange={(v) => {
              if (v === "wake" || v === "bed") setMode(v);
            }}
          >
            <ToggleGroupItem value="wake" className="min-h-11 px-3 pointer-fine:min-h-9">
              Wake time
            </ToggleGroupItem>
            <ToggleGroupItem value="bed" className="min-h-11 px-3 pointer-fine:min-h-9">
              Bedtime
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Field className="w-28">
          <FieldLabel htmlFor="sleep-calc-time">
            {mode === "wake" ? "Wake at" : "In bed at"}
          </FieldLabel>
          <TimeField
            id="sleep-calc-time"
            value={time}
            onChange={setTime}
            aria-label={mode === "wake" ? "Wake time" : "Bedtime"}
          />
        </Field>
      </div>
      <ul role="list" className="mt-3 flex flex-col gap-1">
        {rows.map((r) => (
          <li
            key={r.cycles}
            className="flex items-center gap-2 rounded-md border px-2.5 py-1.5"
          >
            <span className="text-sm font-semibold tabular-nums">
              {/* anchor is UTC, so format in UTC to read the wall offsets back */}
              {formatTime(r.ms, "UTC")}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {mode === "wake" ? "go to bed" : "wake up"} ·{" "}
              {formatDuration(r.durationMs)} asleep · ≈ {r.cycles} cycles
            </span>
          </li>
        ))}
      </ul>
      <FieldDescription className="mt-2">
        Sleep-cycle length varies night to night, so these are estimates — not
        exact wake moments. Uses your {prefs.cycleLengthMin}-minute cycles and{" "}
        {prefs.onsetLatencyMin} minutes to fall asleep —{" "}
        <Link
          href="/settings#sleep"
          className="underline underline-offset-2 hover:text-foreground"
        >
          adjust in Settings
        </Link>
        .
      </FieldDescription>
    </section>
  );
}
