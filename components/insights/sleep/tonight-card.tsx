"use client";

import { useMemo } from "react";
import { CircleAlert, MoonStar } from "lucide-react";

import { useWindowEvents } from "@/lib/hooks/use-window-events";
import { dayStartOffset } from "@/lib/datetime/local";
import { formatDuration, formatTime } from "@/lib/datetime/format";
import { recommendTonight, type SleepPrefs } from "@/lib/sleep/cycles";
import type { HabitualPhase } from "@/lib/sleep/circadian";
import { LeadFigures } from "../tab-bits";

/**
 * The Sleep tab's answer: tonight's single safe bedtime + wake window, anchored
 * to tomorrow's first commitment AND the viewer's habitual circadian phase.
 * Rendered flat on the paper as the lead "reading" (like the Overview lede) —
 * prominence from position + weight, never a bordered hero card. Fetches its
 * own 1-day window (day-aligned → stable query key) so it works whatever period
 * the rest of the tab shows.
 */
export function TonightCard({
  workspaceId,
  viewerId,
  sharedCategoryIds,
  prefs,
  habitualPhase,
  recentDebtMs,
  timeZone,
  now,
}: {
  workspaceId: string | undefined;
  viewerId: string;
  sharedCategoryIds: ReadonlySet<string>;
  prefs: SleepPrefs;
  habitualPhase: HabitualPhase | null;
  recentDebtMs: number;
  timeZone: string;
  now: number;
}) {
  const win = useMemo(
    () => ({
      start: dayStartOffset(now, 1, timeZone),
      end: dayStartOffset(now, 2, timeZone),
    }),
    [now, timeZone],
  );
  const tomorrow = useWindowEvents(workspaceId, win, sharedCategoryIds);

  // Tomorrow's first timed commitment that concerns the viewer: their own or
  // a joint/shared one (the partner's private plans don't set your alarm).
  const firstEvent = useMemo(() => {
    let first = null;
    for (const o of tomorrow.occurrences) {
      if (o.inactive || o.allDay || o.kind !== "event") continue;
      if (o.status === "cancelled") continue;
      if (!(o.ownerId === viewerId || o.isShared)) continue;
      if (o.start < win.start) continue; // overlap spilling in from today
      if (first === null || o.start < first.start) first = o;
    }
    return first;
  }, [tomorrow.occurrences, viewerId, win.start]);

  const rec = useMemo(
    () =>
      recommendTonight({
        tomorrowFirstEventStart: firstEvent?.start ?? null,
        prefs,
        habitualPhase,
        recentDebtMs,
        now,
        timeZone,
      }),
    [firstEvent, prefs, habitualPhase, recentDebtMs, now, timeZone],
  );

  if (rec === null) {
    return (
      <section aria-label="Tonight" className="flex items-start gap-2.5 px-0.5">
        <MoonStar aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-base leading-snug font-semibold">
            No bedtime to suggest tonight yet.
          </p>
          <p className="text-sm leading-snug text-muted-foreground text-pretty">
            Log a few nights and this will suggest a bedtime that fits your
            rhythm — or pick a wake time in the calculator below.
          </p>
        </div>
      </section>
    );
  }

  // One support clause: the "why". Conflict (the body-clock guardrail held the
  // bedtime later than the schedule wanted) is the more important read when
  // present, so it wins the clause; otherwise the commitment context.
  const support = rec.conflict
    ? `Tomorrow starts earlier than your body clock (usually around ${formatTime(rec.conflict.habitualBedtimeMs, timeZone)}). This is as early as is healthy to shift in one night; move ~30 min earlier each night to fully adjust over ~${rec.conflict.glideNights} nights.`
    : firstEvent
      ? `“${firstEvent.title}” starts at ${formatTime(firstEvent.start, timeZone)} tomorrow.`
      : "No timed commitments tomorrow — this keeps your usual rhythm.";

  return (
    <section aria-label="Tonight" className="flex items-start gap-2.5 px-0.5">
      <MoonStar aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="space-y-1">
          <p className="text-base leading-snug font-semibold text-balance">
            Go to bed by{" "}
            <span className="tabular-nums">{formatTime(rec.bedtimeMs, timeZone)}</span>{" "}
            tonight.
          </p>
          <p className="text-sm leading-snug text-muted-foreground text-pretty">
            {support}
          </p>
        </div>

        <LeadFigures
          items={[
            {
              label: "Be up by",
              value: `${formatTime(rec.wakeWindow.start, timeZone)}–${formatTime(rec.wakeWindow.end, timeZone)}`,
            },
            { label: "Sleep", value: `~${formatDuration(rec.durationMs)}` },
            {
              label: "Cycles",
              value: `≈ ${rec.cyclesApprox}`,
            },
          ]}
        />

        {rec.tooLate && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>
              That bedtime has already passed —{" "}
              {rec.cyclesFromNow >= 1
                ? `going to bed now still fits about ${rec.cyclesFromNow} ${
                    rec.cyclesFromNow === 1 ? "cycle" : "cycles"
                  }.`
                : "less than one full cycle fits before your wake time."}
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
