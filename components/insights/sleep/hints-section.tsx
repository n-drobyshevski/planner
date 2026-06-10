"use client";

import {
  BedDouble,
  CircleAlert,
  Info,
  Repeat,
  Waves,
  type LucideIcon,
} from "lucide-react";

import { HINTS_MIN_LOGGED, type SleepHint } from "@/lib/sleep/adaptive";
import { SectionLabel } from "../tab-bits";

const KIND_ICONS: Record<SleepHint["kind"], LucideIcon> = {
  duration: BedDouble,
  regularity: Repeat,
  "cycle-alignment": Waves,
};

/**
 * Adaptive hints from logged check-ins. The engine stays silent below
 * HINTS_MIN_LOGGED scored mornings — surface that honestly instead of
 * implying the data says nothing.
 */
export function HintsSection({
  hints,
  scoredCount,
}: {
  hints: SleepHint[];
  /** check-ins with a quality or sleepiness score in this period */
  scoredCount: number;
}) {
  return (
    <section className="space-y-2">
      <SectionLabel>Hints</SectionLabel>
      {scoredCount < HINTS_MIN_LOGGED ? (
        <p className="text-xs text-muted-foreground">
          Log {HINTS_MIN_LOGGED - scoredCount} more morning
          {HINTS_MIN_LOGGED - scoredCount === 1 ? "" : "s"} in this period to
          unlock sleep hints — they compare how you score after different kinds
          of nights.
        </p>
      ) : hints.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No patterns stand out yet — your scores don&apos;t differ much across
          night lengths or bedtimes in this period.
        </p>
      ) : (
        <ul role="list" className="flex flex-col gap-2">
          {hints.map((h) => (
            <HintCard key={h.id} hint={h} />
          ))}
        </ul>
      )}
    </section>
  );
}

function HintCard({ hint }: { hint: SleepHint }) {
  const KindIcon = KIND_ICONS[hint.kind];
  const SeverityIcon = hint.severity === "attention" ? CircleAlert : Info;
  return (
    <li className="flex items-start gap-3 rounded-lg border bg-card p-3 shadow-soft">
      <KindIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium">{hint.title}</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <SeverityIcon aria-hidden className="size-3" />
            {hint.severity === "attention" ? "Worth a look" : "FYI"}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{hint.body}</p>
        {hint.meta && hint.meta.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            {hint.meta.join(" · ")}
          </p>
        )}
      </div>
    </li>
  );
}
