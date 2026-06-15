// Sleep-cycle calculator + the Tonight recommendation.
//
// The cycle helpers (bedtimesForWake / wakesForBedtime) are pure epoch-ms
// arithmetic, deliberately zone-free. A "cycle" is one full sleep cycle (member
// pref, default 90 min — note the literature median is ~96 min and varies
// widely, so cycle counts are an estimate, not a precise wake target); onset
// latency is the time to fall asleep after getting into bed.
//
// recommendTonight is the zone-aware orchestrator: it blends tomorrow's first
// commitment (schedule) with the viewer's habitual circadian phase and a
// bounded recent sleep debt, and never advances the bedtime more than one
// night's worth past the body clock (see lib/sleep/circadian). It returns a
// single safe bedtime + a wake window rather than minute-precise cycle options.

import {
  BAND_MAX_MS,
  DEBT_NUDGE_CAP_MS,
  MAX_ADVANCE_PER_NIGHT_MS,
  projectClockOntoNight,
  WAKE_WINDOW_MS,
  type HabitualPhase,
} from "@/lib/sleep/circadian";
import { dayStartOffset } from "@/lib/datetime/local";
import type { Occurrence } from "@/lib/types";

/**
 * Tomorrow's first timed commitment that should set the alarm: the earliest
 * non-all-day, non-inactive, non-cancelled occurrence the viewer is on the hook
 * for (their own, or a shared/joint one — the partner's private plans don't set
 * your alarm). Timed CONTEXT windows (work/school backdrops) count as real
 * commitments alongside normal events; only the START matters. `windowStart`
 * drops overlaps spilling in from the previous day.
 */
export function firstCommitment(
  occurrences: Occurrence[],
  viewerId: string,
  windowStart: number,
): Occurrence | null {
  let first: Occurrence | null = null;
  for (const o of occurrences) {
    if (o.inactive || o.allDay) continue;
    if (o.status === "cancelled") continue;
    if (!(o.ownerId === viewerId || o.isShared)) continue;
    if (o.start < windowStart) continue;
    if (first === null || o.start < first.start) first = o;
  }
  return first;
}

export interface SleepPrefs {
  cycleLengthMin: number;
  onsetLatencyMin: number;
  targetCycles: number;
}

export interface CycleOption {
  bedtimeMs: number;
  cycles: number;
  /** asleep time (N×cycle), excluding onset latency */
  durationMs: number;
}

/** Cycle counts offered by the calculator and the Tonight card. */
export const CYCLE_RANGE = [4, 5, 6] as const;

/** Margin between waking and the first commitment (get-ready time). */
export const GET_READY_MS = 45 * 60_000;

const MIN_MS = 60_000;

/** Bedtimes that land N full cycles before `wakeMs`, earliest bedtime first. */
export function bedtimesForWake(
  wakeMs: number,
  prefs: SleepPrefs,
): CycleOption[] {
  return [...CYCLE_RANGE]
    .sort((a, b) => b - a)
    .map((cycles) => ({
      bedtimeMs:
        wakeMs -
        prefs.onsetLatencyMin * MIN_MS -
        cycles * prefs.cycleLengthMin * MIN_MS,
      cycles,
      durationMs: cycles * prefs.cycleLengthMin * MIN_MS,
    }));
}

/** Wake instants N full cycles after going to bed at `bedMs`, earliest first. */
export function wakesForBedtime(
  bedMs: number,
  prefs: SleepPrefs,
): { wakeMs: number; cycles: number; durationMs: number }[] {
  return CYCLE_RANGE.map((cycles) => ({
    wakeMs:
      bedMs +
      prefs.onsetLatencyMin * MIN_MS +
      cycles * prefs.cycleLengthMin * MIN_MS,
    cycles,
    durationMs: cycles * prefs.cycleLengthMin * MIN_MS,
  }));
}

export interface TonightInput {
  /** start of tomorrow's first commitment; null = no commitment tomorrow */
  tomorrowFirstEventStart: number | null;
  prefs: SleepPrefs;
  /** habitual circadian phase from recent history; null = cold start */
  habitualPhase: HabitualPhase | null;
  /** bounded recent sleep debt (ms); nudges the target up. Default 0. */
  recentDebtMs?: number;
  now: number;
  timeZone: string;
}

export interface TonightRec {
  /** "be up between" — the window ends at the latest-safe wake instant */
  wakeWindow: { start: number; end: number };
  /** the single recommended bedtime */
  bedtimeMs: number;
  /** asleep time achievable at `bedtimeMs` (excludes onset latency) */
  durationMs: number;
  /** the duration aimed for (target, debt-nudged within the healthy band) */
  targetMs: number;
  /** ≈ whole cycles for `durationMs` — a rough note, not a precise wake target */
  cyclesApprox: number;
  /** what drove the bedtime: the schedule, or the body clock (regularity) */
  source: "schedule" | "circadian";
  /** set when the phase-advance guardrail held the bedtime later than the
   *  schedule wanted (tomorrow's start fights the body clock) */
  conflict: {
    /** the (earlier) bedtime the schedule alone wanted */
    scheduleBedtimeMs: number;
    /** the body's usual bedtime, projected onto tonight */
    habitualBedtimeMs: number;
    /** sleep sacrificed at the safe bedtime vs the target */
    shortfallMs: number;
    /** nights to fully reach the schedule, advancing ≤ the per-night limit */
    glideNights: number;
  } | null;
  /** true once `now` is strictly past the recommended bedtime */
  tooLate: boolean;
  /** full cycles that still fit going to bed at `now` (for the "too late" note) */
  cyclesFromNow: number;
}

/**
 * Tonight's single safe bedtime + wake window. Blends three anchors:
 *   • schedule  — wake by `tomorrowFirstEventStart − GET_READY_MS`;
 *   • circadian — the viewer's habitual phase (regularity-first, and a hard cap
 *                 on advancing earlier than the body clock can move in a night);
 *   • homeostatic — recent sleep debt nudges the target up within the band.
 * Returns null only when there is nothing to anchor to (no commitment and no
 * habitual phase) — the caller shows the calculator instead.
 */
export function recommendTonight(input: TonightInput): TonightRec | null {
  const { prefs, habitualPhase, now, timeZone } = input;
  const onsetMs = prefs.onsetLatencyMin * MIN_MS;
  const cycleMs = prefs.cycleLengthMin * MIN_MS;
  const baseTargetMs = prefs.targetCycles * cycleMs;
  // Debt raises the target, bounded by the per-night cap and the healthy-band
  // ceiling — and never below the member's own (possibly long) target.
  const nudge = Math.min(
    input.recentDebtMs ?? 0,
    DEBT_NUDGE_CAP_MS,
    Math.max(0, BAND_MAX_MS - baseTargetMs),
  );
  const targetMs = baseTargetMs + nudge;

  // The night the recommendation lands on: the wake day is tomorrow's local
  // date (commitment present → the event's day; absent → the day after `now`).
  const hasEvent = input.tomorrowFirstEventStart !== null;
  if (!hasEvent && !habitualPhase) return null;

  const wakeDayRef = hasEvent
    ? (input.tomorrowFirstEventStart as number)
    : dayStartOffset(now, 1, timeZone);

  const habitualBed =
    habitualPhase !== null
      ? projectClockOntoNight(wakeDayRef, habitualPhase.bedtimeMinSinceNoon, timeZone)
      : null;
  const habitualWake =
    habitualPhase?.wakeMinSinceNoon != null
      ? projectClockOntoNight(wakeDayRef, habitualPhase.wakeMinSinceNoon, timeZone)
      : null;

  // Wake target. With a commitment you wake by event − get-ready, but no later
  // than your habitual wake (a late event doesn't make the body sleep in). With
  // no commitment, wake at the habitual time (or target hours past bedtime).
  let wakeAnchor: number;
  if (hasEvent) {
    const eventWake = (input.tomorrowFirstEventStart as number) - GET_READY_MS;
    wakeAnchor = habitualWake !== null ? Math.min(eventWake, habitualWake) : eventWake;
  } else {
    wakeAnchor =
      habitualWake ?? (habitualBed as number) + onsetMs + targetMs;
  }

  const scheduleBed = wakeAnchor - onsetMs - targetMs;

  let bedtimeMs: number;
  let conflict: TonightRec["conflict"] = null;
  if (habitualBed === null) {
    bedtimeMs = scheduleBed; // cold start = schedule-only (legacy behavior)
  } else {
    const earliestSafeBed = habitualBed - MAX_ADVANCE_PER_NIGHT_MS;
    if (earliestSafeBed > scheduleBed) {
      // The schedule wants an earlier bed than the clock can safely reach
      // tonight — hold at the advance limit and surface the shortfall.
      bedtimeMs = earliestSafeBed;
      const achievable = wakeAnchor - bedtimeMs - onsetMs;
      conflict = {
        scheduleBedtimeMs: scheduleBed,
        habitualBedtimeMs: habitualBed,
        shortfallMs: Math.max(0, targetMs - achievable),
        glideNights: Math.max(
          1,
          Math.ceil((habitualBed - scheduleBed) / MAX_ADVANCE_PER_NIGHT_MS),
        ),
      };
    } else {
      // Safe range exists — prefer the habitual bedtime (regularity), but go a
      // little earlier if the schedule needs it to hit the target.
      bedtimeMs = Math.min(habitualBed, scheduleBed);
    }
  }

  const durationMs = Math.max(0, wakeAnchor - bedtimeMs - onsetMs);
  const source: TonightRec["source"] =
    habitualBed !== null && bedtimeMs === habitualBed ? "circadian" : "schedule";
  const cyclesFromNow = Math.max(
    0,
    Math.floor((wakeAnchor - now - onsetMs) / cycleMs),
  );

  return {
    wakeWindow: { start: wakeAnchor - WAKE_WINDOW_MS, end: wakeAnchor },
    bedtimeMs,
    durationMs,
    targetMs,
    cyclesApprox: Math.round(durationMs / cycleMs),
    source,
    conflict,
    tooLate: bedtimeMs < now,
    cyclesFromNow,
  };
}
