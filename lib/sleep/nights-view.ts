// One per-night view shared by the Sleep tab's history stats and the rhythm
// strip — a single source so the two never disagree about what a night was.
// Logged check-in times win over the calendar-derived night; a night with BOTH
// logged times reads "logged" (drawn solid), otherwise "derived" (drawn
// hatched — shape, never color). Bedtime/wake are also pre-encoded as
// minutes-since-noon (lib/sleep/clock) so the strip can plot them on a
// continuous, wrap-free night axis without re-deriving the mapping.

import { minutesSinceNoon } from "@/lib/sleep/clock";
import type { DerivedNight } from "@/lib/sleep/derive";
import type { SleepPrefs } from "@/lib/sleep/cycles";
import type { SleepLog } from "@/lib/types";

const MIN_MS = 60_000;

/**
 * Target TIME IN BED for a night: the asleep target (cycles × cycle length)
 * plus the time to fall asleep. The history bars and the rhythm strip both plot
 * in-bed spans, so the target reference must include onset latency to line up.
 */
export function targetInBedMs(prefs: SleepPrefs): number {
  return (prefs.targetCycles * prefs.cycleLengthMin + prefs.onsetLatencyMin) * MIN_MS;
}

export interface NightView {
  dateKey: string;
  /** the wake day's local day-start (chart key + row label) */
  dayStartMs: number;
  /** bedtime instant — logged check-in wins over the derived start; null = none */
  bedAt: number | null;
  /** wake instant — logged check-in wins over the derived end; null = none */
  wakeAt: number | null;
  /** bedtime as minutes since the previous local noon (continuous); null = none */
  bedMin: number | null;
  /** wake as minutes since the previous local noon; null = none */
  wakeMin: number | null;
  /**
   * in-bed duration: logged (wokeAt − bedtimeAt) wins, else the derived sum;
   * 0 = missing night. The TRUTHFUL elapsed time — geometry on the strip comes
   * from bedMin/wakeMin, but every displayed duration reads from here (the two
   * can disagree by up to an hour across a DST transition).
   */
  durationMs: number;
  /** solid (both times logged) vs hatched (any part derived) — shape, not color */
  source: "logged" | "derived";
}

/**
 * Merge derived nights with logged check-ins into one per-night view. Logged
 * times win; a night is "logged" only when both bedtime and wake were entered,
 * matching the history chart's fill rule exactly.
 */
export function buildNightViews(
  nights: DerivedNight[],
  logs: SleepLog[],
  timeZone: string,
): NightView[] {
  const logByKey = new Map(logs.map((l) => [l.date, l]));
  return nights.map((n) => {
    const log = logByKey.get(n.dateKey);
    const bedAt = log?.bedtimeAt ?? n.start;
    const wakeAt = log?.wokeAt ?? n.end;
    const loggedMs =
      log && log.bedtimeAt !== null && log.wokeAt !== null
        ? log.wokeAt - log.bedtimeAt
        : null;
    return {
      dateKey: n.dateKey,
      dayStartMs: n.dayStartMs,
      bedAt,
      wakeAt,
      bedMin: bedAt !== null ? minutesSinceNoon(bedAt, timeZone) : null,
      wakeMin: wakeAt !== null ? minutesSinceNoon(wakeAt, timeZone) : null,
      durationMs: loggedMs ?? n.durationMs,
      source: loggedMs !== null ? "logged" : "derived",
    };
  });
}
