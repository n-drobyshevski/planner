// Circadian inputs for the Tonight recommendation: the user's habitual sleep
// phase (estimated from their own recent nights) and a bounded recent sleep
// debt. These let the recommendation respect an established biological clock
// instead of being driven purely by tomorrow's first commitment.
//
// Why this matters (primary literature): a person's recent bedtimes encode
// their entrained circadian phase (chronotype is a biological phenotype, not a
// free choice — MDPI Biology 8(3):54), and the clock moves slowly — even with
// bright light + melatonin, phase advances only ~1–2 h over several days
// (PMC4344919). So a behavioral app must assume only a fraction of an hour of
// advance per night and never recommend a large jump. Prior sleep/wake history
// also shifts sleep pressure (S2352721823002048), so recent debt nudges tonight.

import { TZDate } from "@date-fns/tz";

import { dateKeyInZone } from "@/lib/datetime/local";
import { minutesSinceNoon } from "@/lib/sleep/clock";
import type { DerivedNight } from "@/lib/sleep/derive";
import type { SleepLog } from "@/lib/types";

const MIN_MS = 60_000;
const HALF_DAY_MIN = 720; // minutes-since-noon value at midnight

/** Recent nights with a known bedtime required before we trust a habitual phase. */
export const MIN_PHASE_NIGHTS = 7;
/**
 * Conservative behavioral phase-advance limit per night (no light/melatonin
 * aids). Advancing — going to bed earlier than the body clock — is the hard,
 * risky direction; a behavioral nudge should not exceed this in one night.
 */
export const MAX_ADVANCE_PER_NIGHT_MS = 30 * MIN_MS;
/** Delaying the clock (later bedtime) is easier than advancing; rarely binds. */
export const MAX_DELAY_PER_NIGHT_MS = 60 * MIN_MS;
/** Width of the "be up between" wake window we present instead of one instant. */
export const WAKE_WINDOW_MS = 20 * MIN_MS;
/** AASM/SRS adult healthy sleep band — the ceiling for a debt-driven nudge. */
export const BAND_MAX_MS = 9 * 60 * MIN_MS;
/** Most a recent-debt nudge may add to the target in one night. */
export const DEBT_NUDGE_CAP_MS = 60 * MIN_MS;

export interface HabitualPhase {
  /** median bedtime, minutes since the previous local noon */
  bedtimeMinSinceNoon: number;
  /** median wake, minutes since the previous local noon; null with no wake data */
  wakeMinSinceNoon: number | null;
  /** sample σ (n−1) of bedtime in minutes — how regular the phase is */
  spreadMin: number;
  /** nights with a known bedtime that fed the estimate */
  nights: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function sampleStdDev(values: number[]): number {
  const mu = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(
    values.reduce((s, v) => s + (v - mu) ** 2, 0) / (values.length - 1),
  );
}

/**
 * Estimate the viewer's habitual sleep phase from recent nights. Bedtime/wake
 * come from the logged check-in when present, else the calendar-derived night.
 * The median resists alarm-truncated mornings (a few early starts don't drag
 * the estimate), giving the body's typical phase. Returns null below
 * MIN_PHASE_NIGHTS bedtimes so the caller falls back to schedule-only.
 *
 * Limitation (future): medians over all recent nights rather than weighting
 * free days (true mid-sleep-on-free-days / chronotype). Good enough for v1.
 */
export function computeHabitualPhase(
  nights: DerivedNight[],
  logs: SleepLog[],
  timeZone: string,
): HabitualPhase | null {
  const logByKey = new Map(logs.map((l) => [l.date, l]));
  const nightByKey = new Map(nights.map((n) => [n.dateKey, n]));
  const keys = new Set<string>([...nightByKey.keys(), ...logByKey.keys()]);

  const bedtimes: number[] = [];
  const wakes: number[] = [];
  for (const key of keys) {
    const l = logByKey.get(key);
    const n = nightByKey.get(key);
    const bedAt = l?.bedtimeAt ?? n?.start ?? null;
    const wakeAt = l?.wokeAt ?? n?.end ?? null;
    if (bedAt !== null) bedtimes.push(minutesSinceNoon(bedAt, timeZone));
    if (wakeAt !== null) wakes.push(minutesSinceNoon(wakeAt, timeZone));
  }

  if (bedtimes.length < MIN_PHASE_NIGHTS) return null;

  return {
    bedtimeMinSinceNoon: median(bedtimes),
    wakeMinSinceNoon: wakes.length > 0 ? median(wakes) : null,
    spreadMin: sampleStdDev(bedtimes),
    nights: bedtimes.length,
  };
}

/**
 * Project a "minutes since noon" clock value onto the night that ends at
 * `wakeMs`. Evening values (< midnight) land on the day before the wake day;
 * after-midnight values land on the wake day itself — mirroring the bedtime
 * ambiguity rule used elsewhere. Built with TZDate so DST nights keep their
 * wall-clock position (same approach as lib/sleep/derive.ts).
 */
export function projectClockOntoNight(
  wakeMs: number,
  minSinceNoon: number,
  timeZone: string,
): number {
  const [y, mo, d] = dateKeyInZone(wakeMs, timeZone).split("-").map(Number);
  const eveningBefore = minSinceNoon < HALF_DAY_MIN;
  const hour = eveningBefore
    ? Math.floor(minSinceNoon / 60) + 12
    : Math.floor(minSinceNoon / 60) - 12;
  const minute = minSinceNoon % 60;
  const day = eveningBefore ? d - 1 : d;
  return new TZDate(y, mo - 1, day, hour, minute, 0, timeZone).getTime();
}

/**
 * Bounded recent sleep debt: the sum of per-night shortfalls below
 * `targetAsleepMs` (logged in-bed time wins over the derived night), clamped to
 * `cap`. Surplus nights contribute nothing. Used to gently raise tonight's
 * target after under-slept nights without ever implying a crash repayment.
 */
export function recentSleepDebtMs(
  nights: DerivedNight[],
  logs: SleepLog[],
  targetAsleepMs: number,
  cap: number,
): number {
  const nightByKey = new Map(nights.map((n) => [n.dateKey, n]));
  const logByKey = new Map(logs.map((l) => [l.date, l]));
  const keys = new Set<string>([...nightByKey.keys(), ...logByKey.keys()]);

  let debt = 0;
  for (const key of keys) {
    const l = logByKey.get(key);
    const n = nightByKey.get(key);
    const loggedMs =
      l && l.bedtimeAt !== null && l.wokeAt !== null
        ? l.wokeAt - l.bedtimeAt
        : null;
    const achieved = loggedMs ?? (n && n.durationMs > 0 ? n.durationMs : null);
    if (achieved === null) continue;
    debt += Math.max(0, targetAsleepMs - achieved);
  }
  return Math.min(cap, debt);
}
