"use client";

import Link from "next/link";
import {
  BedDouble,
  CircleAlert,
  Info,
  Repeat,
  Waves,
  type LucideIcon,
} from "lucide-react";

import {
  HINTS_MIN_LOGGED,
  HINTS_WINDOW_DAYS,
  type SleepHint,
} from "@/lib/sleep/adaptive";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { InsightCard } from "../insight-card";

const KIND_ICONS: Record<SleepHint["kind"], LucideIcon> = {
  duration: BedDouble,
  regularity: Repeat,
  "cycle-alignment": Waves,
};

/**
 * Adaptive hints from logged check-ins over a fixed trailing window
 * (period-independent, so switching to a short period can't silence them).
 * The engine stays silent below HINTS_MIN_LOGGED scored mornings — surface
 * that honestly instead of implying the data says nothing.
 */
export function HintsSection({
  hints,
  scoredCount,
}: {
  hints: SleepHint[];
  /** check-ins with a quality or sleepiness score in the trailing window */
  scoredCount: number;
}) {
  return (
    <InsightCard title={`Hints · last ${HINTS_WINDOW_DAYS} days`}>
      {scoredCount < HINTS_MIN_LOGGED ? (
        <p className="text-xs text-muted-foreground">
          Log {HINTS_MIN_LOGGED - scoredCount} more morning
          {HINTS_MIN_LOGGED - scoredCount === 1 ? "" : "s"} to unlock sleep
          hints — they compare how you score after different kinds of nights,
          against your{" "}
          <Link
            href="/settings#sleep"
            className="underline underline-offset-2 hover:text-foreground"
          >
            sleep settings
          </Link>
          .
        </p>
      ) : hints.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No patterns stand out yet — your scores don&apos;t differ much across
          night lengths or bedtimes in the last {HINTS_WINDOW_DAYS} days.
        </p>
      ) : (
        <ul role="list" className="flex flex-col gap-2">
          {hints.map((h) => (
            <HintCard key={h.id} hint={h} />
          ))}
        </ul>
      )}
    </InsightCard>
  );
}

function HintCard({ hint }: { hint: SleepHint }) {
  const KindIcon = KIND_ICONS[hint.kind];
  const SeverityIcon = hint.severity === "attention" ? CircleAlert : Info;
  return (
    <li>
      <Card size="sm" className="flex-row items-start gap-3 px-3 py-3">
        <KindIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium">{hint.title}</span>
            <Badge
              variant={hint.severity === "attention" ? "destructive" : "secondary"}
              className="gap-1 font-normal"
            >
              <SeverityIcon aria-hidden className="size-3" />
              {hint.severity === "attention" ? "Worth a look" : "FYI"}
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{hint.body}</p>
          {hint.meta && hint.meta.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              {hint.meta.join(" · ")}
            </p>
          )}
        </div>
      </Card>
    </li>
  );
}
