// Shared "minutes since the previous local noon" encoding for sleep timing.
// The night window spans 20:00→12:00, crossing midnight; mapping wall times onto
// a continuous 0..1439 scale anchored at noon means a bedtime spread (σ) or a
// median is computed without a midnight wrap distorting it. 12:00 → 0, 23:00 →
// 660, 00:00 → 720, 11:59 → 1439. Used by the adaptive hints, the history
// stats, and the circadian habitual-phase estimate so they all agree.

import { format } from "date-fns";
import { tz } from "@date-fns/tz";

/** Wall-clock instant → minutes since the previous local noon in `timeZone`. */
export function minutesSinceNoon(ms: number, timeZone: string): number {
  const ctx = { in: tz(timeZone) };
  const h = Number(format(ms, "H", ctx));
  const m = Number(format(ms, "m", ctx));
  return h >= 12 ? (h - 12) * 60 + m : (h + 12) * 60 + m;
}

/** Minutes since noon → "HH:mm" wall clock (minute-precise inverse). */
export function fromNoon(min: number): string {
  const h = (Math.floor(min / 60) + 12) % 24;
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
