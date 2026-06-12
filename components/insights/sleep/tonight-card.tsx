"use client";

import { useMemo } from "react";
import { CircleAlert, MoonStar, Sunrise } from "lucide-react";

import { useWindowEvents } from "@/lib/hooks/use-window-events";
import { dayStartOffset } from "@/lib/datetime/local";
import { formatDuration, formatTime } from "@/lib/datetime/format";
import { recommendTonight, type SleepPrefs } from "@/lib/sleep/cycles";
import type { HabitualPhase } from "@/lib/sleep/circadian";

/**
 * Tonight's single safe bedtime + wake window, anchored to tomorrow's first
 * commitment AND the viewer's habitual circadian phase. Fetches its own 1-day
 * window (day-aligned → stable query key) so it works whatever period the rest
 * of the tab shows; the habitual phase and recent debt are passed in from the
 * tab (computed once from the trailing-30-day history).
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

  return (
    <section aria-label="Tonight" className="rounded-lg border bg-card p-3 shadow-soft">
      <div className="flex items-center gap-2">
        <MoonStar aria-hidden className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Tonight</h3>
      </div>

      {rec === null ? (
        <p className="mt-1 text-xs text-muted-foreground">
          No commitment tomorrow yet. Log a few nights and this will suggest a
          bedtime that fits your rhythm — or pick a wake time in the calculator
          below.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            {firstEvent ? (
              <>
                “{firstEvent.title}” starts at{" "}
                <span className="tabular-nums">
                  {formatTime(firstEvent.start, timeZone)}
                </span>{" "}
                tomorrow.
              </>
            ) : (
              "No timed commitments tomorrow — this keeps your usual rhythm."
            )}
          </p>

          {/* Primary recommendation: a bedtime + a wake window, framed in hours. */}
          <div className="mt-2 rounded-md border-2 border-primary/50 px-2.5 py-2">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-sm">Go to bed by</span>
              <span className="text-base font-semibold tabular-nums">
                {formatTime(rec.bedtimeMs, timeZone)}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                ~{formatDuration(rec.durationMs)} sleep · ≈ {rec.cyclesApprox}{" "}
                {rec.cyclesApprox === 1 ? "cycle" : "cycles"}
              </span>
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sunrise aria-hidden className="size-3.5" />
              Be up between{" "}
              <span className="tabular-nums">
                {formatTime(rec.wakeWindow.start, timeZone)}
              </span>{" "}
              and{" "}
              <span className="tabular-nums">
                {formatTime(rec.wakeWindow.end, timeZone)}
              </span>
              .
            </p>
          </div>

          {rec.conflict && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
              <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Tomorrow starts earlier than your body clock (usually around{" "}
                <span className="tabular-nums">
                  {formatTime(rec.conflict.habitualBedtimeMs, timeZone)}
                </span>
                ). Tonight&apos;s bedtime is as early as is healthy to shift in
                one night — about {formatDuration(rec.conflict.shortfallMs)} under
                your target. Move ~30 min earlier each night to fully adjust over
                ~{rec.conflict.glideNights} nights.
              </span>
            </p>
          )}

          {rec.tooLate && (
            <p className="mt-2 text-xs text-muted-foreground">
              That bedtime has already passed —{" "}
              {rec.cyclesFromNow >= 1
                ? `going to bed now still fits about ${rec.cyclesFromNow} ${
                    rec.cyclesFromNow === 1 ? "cycle" : "cycles"
                  }.`
                : "less than one full cycle fits before your wake time."}
            </p>
          )}
        </>
      )}
    </section>
  );
}
