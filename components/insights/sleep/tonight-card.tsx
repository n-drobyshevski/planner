"use client";

import { useMemo } from "react";
import { BadgeCheck, MoonStar } from "lucide-react";

import { useWindowEvents } from "@/lib/hooks/use-window-events";
import { dayStartOffset } from "@/lib/datetime/local";
import { formatDuration, formatTime } from "@/lib/datetime/format";
import {
  recommendTonight,
  type CycleOption,
  type SleepPrefs,
} from "@/lib/sleep/cycles";

/**
 * Bedtime options for tonight, anchored to tomorrow's first commitment.
 * Fetches its own 1-day window (day-aligned → stable query key; realtime
 * updates ride the existing events-key predicate) so the card works whatever
 * period the rest of the tab is showing.
 */
export function TonightCard({
  workspaceId,
  viewerId,
  sharedCategoryIds,
  prefs,
  timeZone,
  now,
}: {
  workspaceId: string | undefined;
  viewerId: string;
  sharedCategoryIds: ReadonlySet<string>;
  prefs: SleepPrefs;
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
      firstEvent
        ? recommendTonight({ tomorrowFirstEventStart: firstEvent.start, prefs, now })
        : null,
    [firstEvent, prefs, now],
  );

  return (
    <section aria-label="Tonight" className="rounded-lg border bg-card p-3 shadow-soft">
      <div className="flex items-center gap-2">
        <MoonStar aria-hidden className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Tonight</h3>
      </div>
      {rec && firstEvent ? (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            “{firstEvent.title}” starts at {formatTime(firstEvent.start, timeZone)}{" "}
            tomorrow — waking by{" "}
            <span className="tabular-nums">{formatTime(rec.wakeMs, timeZone)}</span>{" "}
            leaves time to get ready.
          </p>
          <ul role="list" className="mt-2 flex flex-col gap-1">
            {rec.options.map((opt) => (
              <BedtimeOption
                key={opt.cycles}
                option={opt}
                recommended={opt.cycles === rec.recommended.cycles}
                timeZone={timeZone}
              />
            ))}
          </ul>
          {rec.tooLate && rec.bestFeasible && (
            <p className="mt-2 text-xs text-muted-foreground">
              The recommended bedtime has already passed —{" "}
              <span className="tabular-nums">
                {formatTime(rec.bestFeasible.bedtimeMs, timeZone)}
              </span>{" "}
              still fits {rec.bestFeasible.cycles} cycles.
            </p>
          )}
          {rec.tooLate && !rec.bestFeasible && (
            <p className="mt-2 text-xs text-muted-foreground">
              All cycle bedtimes have passed —{" "}
              {rec.cyclesFromNow >= 1
                ? `going to bed now still fits ${rec.cyclesFromNow} full ${
                    rec.cyclesFromNow === 1 ? "cycle" : "cycles"
                  }.`
                : "less than one full cycle fits before your wake time."}
            </p>
          )}
        </>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          No timed commitments tomorrow — pick a wake time in the calculator
          below.
        </p>
      )}
    </section>
  );
}

function BedtimeOption({
  option,
  recommended,
  timeZone,
}: {
  option: CycleOption;
  recommended: boolean;
  timeZone: string;
}) {
  return (
    <li
      className={
        recommended
          ? "flex items-center gap-2 rounded-md border-2 border-primary/50 px-2.5 py-1.5"
          : "flex items-center gap-2 rounded-md border px-2.5 py-1.5"
      }
    >
      <span className="text-sm font-semibold tabular-nums">
        {formatTime(option.bedtimeMs, timeZone)}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {option.cycles} cycles · {formatDuration(option.durationMs)} asleep
      </span>
      {recommended && (
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <BadgeCheck aria-hidden className="size-3.5" />
          Recommended
        </span>
      )}
    </li>
  );
}
