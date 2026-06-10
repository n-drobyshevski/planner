// Sleep-cycle calculator — pure epoch-ms arithmetic, deliberately zone-free.
// A "cycle" is one full sleep cycle (member pref, default 90 min); onset
// latency is the time to fall asleep after getting into bed. Bedtimes/wakes
// are wall instants; the UI formats them in the viewer's zone. DST nights
// shift results by the skipped/repeated hour — accepted: "count back 7.5h"
// is what people expect from a cycle calculator.

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

/**
 * Tonight's bedtime options for tomorrow's first commitment. Wake is
 * GET_READY_MS before the event; the recommended option is the member's
 * target cycle count clamped into the offered range. `tooLate` is true once
 * `now` is strictly past the recommended bedtime.
 */
export function recommendTonight(input: {
  tomorrowFirstEventStart: number;
  prefs: SleepPrefs;
  now: number;
}): {
  wakeMs: number;
  options: CycleOption[];
  recommended: CycleOption;
  tooLate: boolean;
} {
  const wakeMs = input.tomorrowFirstEventStart - GET_READY_MS;
  const options = bedtimesForWake(wakeMs, input.prefs);
  const lo = Math.min(...CYCLE_RANGE);
  const hi = Math.max(...CYCLE_RANGE);
  const target = Math.min(hi, Math.max(lo, input.prefs.targetCycles));
  const recommended = options.find((o) => o.cycles === target) as CycleOption;
  return {
    wakeMs,
    options,
    recommended,
    tooLate: recommended.bedtimeMs < input.now,
  };
}
