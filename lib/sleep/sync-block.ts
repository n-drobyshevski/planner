// Decide how a sleep check-in should adjust the calendar for one night.
//
// When a member logs a check-in carrying both a bedtime and a wake time, the
// corresponding calendar sleep block should reflect the night that actually
// happened. This pure resolver looks at the viewer's existing sleep occurrences
// for the night and returns ONE plan:
//
//   - no block yet            → "create" a single sleep event at the logged times
//   - a one-off block         → "update-single" that event's start/end
//   - a recurring routine      → "override" just this night (never shift the series)
//
// The night is bounded by the SAME window math as deriveNights (nightWindowFor),
// so the block the chart attributes to a night is the block this snaps. The
// caller pre-filters to the viewer's own sleep occurrences (isViewerSleep) and
// only invokes this when both times are present.

import { nightWindowFor } from "@/lib/sleep/derive";
import type { Occurrence } from "@/lib/types";

export type SleepBlockPlan =
  | { action: "create"; start: number; end: number }
  | { action: "update-single"; eventId: string; start: number; end: number }
  | {
      action: "override";
      eventId: string;
      /** the recurring occurrence's original start — the override key */
      occurrenceMs: number;
      start: number;
      end: number;
    };

export interface SleepBlockSyncArgs {
  /** wake date "yyyy-MM-dd" in `timeZone` */
  date: string;
  /** logged bedtime / wake, epoch ms (both required) */
  bedtimeAt: number;
  wokeAt: number;
  /** the viewer's own sleep occurrences (isViewerSleep), from any window */
  viewerSleepOccurrences: Occurrence[];
  timeZone: string;
  /** night window bounds, wall hours (the member's prefs) */
  startHour: number;
  endHour: number;
}

export function planSleepBlockSync(args: SleepBlockSyncArgs): SleepBlockPlan {
  const { date, bedtimeAt, wokeAt, viewerSleepOccurrences, timeZone, startHour, endHour } = args;
  const { winStart, winEnd } = nightWindowFor(date, timeZone, startHour, endHour);

  // The night's block is the occurrence with the most in-window time; ties go to
  // the earlier start (mirrors deriveNights' "most sleep, earlier on tie"). This
  // is order-independent, so the input need not be sorted.
  let best: { o: Occurrence; overlap: number } | null = null;
  for (const o of viewerSleepOccurrences) {
    const overlap = Math.min(o.end, winEnd) - Math.max(o.start, winStart);
    if (overlap <= 0) continue; // outside this night
    if (
      best === null ||
      overlap > best.overlap ||
      (overlap === best.overlap && o.start < best.o.start)
    ) {
      best = { o, overlap };
    }
  }

  if (best === null) {
    return { action: "create", start: bedtimeAt, end: wokeAt };
  }
  const o = best.o;
  if (o.isRecurring) {
    return {
      action: "override",
      eventId: o.eventId,
      occurrenceMs: o.occurrenceDate,
      start: bedtimeAt,
      end: wokeAt,
    };
  }
  return { action: "update-single", eventId: o.eventId, start: bedtimeAt, end: wokeAt };
}
