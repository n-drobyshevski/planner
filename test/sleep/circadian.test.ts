import { describe, expect, it } from "vitest";

import {
  computeHabitualPhase,
  MIN_PHASE_NIGHTS,
  projectClockOntoNight,
  recentSleepDebtMs,
} from "@/lib/sleep/circadian";
import type { DerivedNight } from "@/lib/sleep/derive";
import type { SleepLog } from "@/lib/types";

const MIN = 60_000;
const HOUR = 60 * MIN;
const UTC = "UTC";

/** A log on wake date 2026-06-DD — explicit day so it shares keys with nights. */
function logOn(day: number, over: Partial<SleepLog> = {}): SleepLog {
  const dd = String(day).padStart(2, "0");
  return {
    id: `s${dd}`,
    workspaceId: "w1",
    memberId: "m1",
    date: `2026-06-${dd}`,
    bedtimeAt: null,
    wokeAt: null,
    quality: null,
    fatigue: null,
    note: null,
    createdAt: Date.UTC(2026, 5, day, 8),
    ...over,
  };
}

/** A derived night on wake date 2026-06-DD with optional start/end/duration. */
function night(day: number, over: Partial<DerivedNight> = {}): DerivedNight {
  return {
    dateKey: `2026-06-${String(day).padStart(2, "0")}`,
    dayStartMs: Date.UTC(2026, 5, day),
    start: null,
    end: null,
    durationMs: 0,
    ...over,
  };
}

/** Bedtime instant: evening before the wake date when bedH ≥ 12, else that morning. */
function bedAt(day: number, bedH: number, bedM = 0): number {
  return bedH >= 12
    ? Date.UTC(2026, 5, day - 1, bedH, bedM)
    : Date.UTC(2026, 5, day, bedH, bedM);
}

describe("computeHabitualPhase", () => {
  it("returns null below the minimum number of nights with a bedtime", () => {
    const logs = Array.from({ length: MIN_PHASE_NIGHTS - 1 }, (_, i) =>
      logOn(i + 1, { bedtimeAt: bedAt(i + 1, 23) }),
    );
    expect(computeHabitualPhase([], logs, UTC)).toBeNull();
  });

  it("computes the median bedtime and wake over enough nights", () => {
    // bedtimes 22:00,22:30,23:00,23:00,23:00,23:30,00:00 → median 23:00 (660).
    const beds: [number, number][] = [
      [22, 0],
      [22, 30],
      [23, 0],
      [23, 0],
      [23, 0],
      [23, 30],
      [0, 0],
    ];
    const logs = beds.map(([h, m], i) =>
      logOn(i + 1, {
        bedtimeAt: bedAt(i + 1, h, m),
        wokeAt: Date.UTC(2026, 5, i + 1, 7, 0),
      }),
    );
    const phase = computeHabitualPhase([], logs, UTC);
    expect(phase).not.toBeNull();
    expect(phase!.bedtimeMinSinceNoon).toBe(11 * 60); // 23:00 → (23−12)*60
    expect(phase!.wakeMinSinceNoon).toBe(19 * 60); // 07:00 → (7+12)*60
    expect(phase!.nights).toBe(7);
    expect(phase!.spreadMin).toBeGreaterThan(0);
  });

  it("prefers a logged bedtime over the derived night start", () => {
    // Each night: derived start 21:00 but a logged bedtime 23:00 → 23:00 wins.
    const logs = Array.from({ length: 7 }, (_, i) =>
      logOn(i + 1, { bedtimeAt: bedAt(i + 1, 23) }),
    );
    const nights = Array.from({ length: 7 }, (_, i) =>
      night(i + 1, { start: bedAt(i + 1, 21), end: Date.UTC(2026, 5, i + 1, 7) }),
    );
    const phase = computeHabitualPhase(nights, logs, UTC);
    expect(phase!.bedtimeMinSinceNoon).toBe(11 * 60); // 23:00, not 21:00
  });

  it("falls back to derived night start when no bedtime is logged", () => {
    const nights = Array.from({ length: 7 }, (_, i) =>
      night(i + 1, { start: bedAt(i + 1, 23), end: Date.UTC(2026, 5, i + 1, 7) }),
    );
    const phase = computeHabitualPhase(nights, [], UTC);
    expect(phase!.bedtimeMinSinceNoon).toBe(11 * 60);
    expect(phase!.nights).toBe(7);
  });
});

describe("projectClockOntoNight", () => {
  const wake = Date.UTC(2026, 5, 2, 7, 0); // wake 2026-06-02 07:00

  it("lands an evening bedtime on the day before the wake day", () => {
    const min = 11 * 60; // 23:00
    expect(projectClockOntoNight(wake, min, UTC)).toBe(Date.UTC(2026, 5, 1, 23, 0));
  });

  it("lands an after-midnight bedtime on the wake day itself", () => {
    const min = 13 * 60; // 01:00 → minutes since noon = (1+12)*60
    expect(projectClockOntoNight(wake, min, UTC)).toBe(Date.UTC(2026, 5, 2, 1, 0));
  });

  it("keeps the wall clock across a DST boundary", () => {
    // Berlin springs forward 2026-03-29; a 23:00 bedtime before a wake on the
    // 29th must stay 23:00 wall time on the 28th, not shift by the lost hour.
    const berlinWake = new Date("2026-03-29T08:00:00+01:00").getTime();
    const projected = projectClockOntoNight(berlinWake, 11 * 60, "Europe/Berlin");
    // 23:00 on 2026-03-28 in Berlin is 22:00 UTC (still +01:00 before the switch).
    expect(projected).toBe(Date.UTC(2026, 2, 28, 22, 0));
  });
});

describe("recentSleepDebtMs", () => {
  it("sums per-night shortfalls against the target, ignoring surplus nights", () => {
    const target = 8 * HOUR;
    // derived durations 6h, 7h, 9h, 8h → shortfalls 2h + 1h + 0 + 0 = 3h.
    const nights = [
      night(1, { durationMs: 6 * HOUR }),
      night(2, { durationMs: 7 * HOUR }),
      night(3, { durationMs: 9 * HOUR }),
      night(4, { durationMs: 8 * HOUR }),
    ];
    expect(recentSleepDebtMs(nights, [], target, 10 * HOUR)).toBe(3 * HOUR);
  });

  it("prefers logged in-bed duration over the derived night", () => {
    const target = 8 * HOUR;
    // logged 6h (bed 23:00 → wake 05:00) overrides a derived 8h night → 2h debt.
    const logs = [
      logOn(1, { bedtimeAt: bedAt(1, 23), wokeAt: Date.UTC(2026, 5, 1, 5, 0) }),
    ];
    const nights = [night(1, { durationMs: 8 * HOUR })];
    expect(recentSleepDebtMs(nights, logs, target, 10 * HOUR)).toBe(2 * HOUR);
  });

  it("is bounded by the cap", () => {
    const target = 8 * HOUR;
    const nights = [
      night(1, { durationMs: 2 * HOUR }),
      night(2, { durationMs: 2 * HOUR }),
    ];
    // raw debt 6h+6h = 12h, capped at 2h.
    expect(recentSleepDebtMs(nights, [], target, 2 * HOUR)).toBe(2 * HOUR);
  });
});
