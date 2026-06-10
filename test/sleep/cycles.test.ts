import { describe, expect, it } from "vitest";

import {
  bedtimesForWake,
  CYCLE_RANGE,
  GET_READY_MS,
  recommendTonight,
  type SleepPrefs,
  wakesForBedtime,
} from "@/lib/sleep/cycles";

const MIN = 60_000;
const HOUR = 60 * MIN;
/** Monday 2026-06-01 00:00 UTC — arbitrary anchor; cycles math is zone-free. */
const T0 = Date.UTC(2026, 5, 1);

const PREFS: SleepPrefs = {
  cycleLengthMin: 90,
  onsetLatencyMin: 15,
  targetCycles: 5,
};

describe("bedtimesForWake", () => {
  it("computes bedtime = wake − latency − N×cycle for N = 4..6", () => {
    const wake = T0 + 7 * HOUR; // 07:00
    const out = bedtimesForWake(wake, PREFS);
    expect(out).toHaveLength(CYCLE_RANGE.length);
    for (const opt of out) {
      expect(opt.bedtimeMs).toBe(wake - 15 * MIN - opt.cycles * 90 * MIN);
      expect(opt.durationMs).toBe(opt.cycles * 90 * MIN);
    }
    expect(out.map((o) => o.cycles)).toEqual([6, 5, 4]); // earliest bedtime first
  });

  it("respects custom cycle length and latency", () => {
    const wake = T0 + 6 * HOUR;
    const out = bedtimesForWake(wake, {
      cycleLengthMin: 100,
      onsetLatencyMin: 0,
      targetCycles: 5,
    });
    const five = out.find((o) => o.cycles === 5);
    expect(five?.bedtimeMs).toBe(wake - 5 * 100 * MIN);
    expect(five?.durationMs).toBe(500 * MIN);
  });
});

describe("wakesForBedtime", () => {
  it("computes wake = bed + latency + N×cycle for N = 4..6, earliest wake first", () => {
    const bed = T0 + 23 * HOUR; // 23:00
    const out = wakesForBedtime(bed, PREFS);
    expect(out).toHaveLength(CYCLE_RANGE.length);
    for (const opt of out) {
      expect(opt.wakeMs).toBe(bed + 15 * MIN + opt.cycles * 90 * MIN);
      expect(opt.durationMs).toBe(opt.cycles * 90 * MIN);
    }
    expect(out.map((o) => o.cycles)).toEqual([4, 5, 6]);
  });

  it("is the inverse of bedtimesForWake for the same N", () => {
    const wake = T0 + 7 * HOUR;
    const bed = bedtimesForWake(wake, PREFS).find((o) => o.cycles === 5)!;
    const roundTrip = wakesForBedtime(bed.bedtimeMs, PREFS).find(
      (o) => o.cycles === 5,
    )!;
    expect(roundTrip.wakeMs).toBe(wake);
  });
});

describe("recommendTonight", () => {
  const eventStart = T0 + 9 * HOUR; // 09:00 tomorrow

  it("wakes GET_READY_MS before the first event and recommends targetCycles", () => {
    const out = recommendTonight({
      tomorrowFirstEventStart: eventStart,
      prefs: PREFS,
      now: T0 - 3 * HOUR, // 21:00 the night before
    });
    expect(out.wakeMs).toBe(eventStart - GET_READY_MS);
    expect(out.options.map((o) => o.cycles)).toEqual([6, 5, 4]);
    expect(out.recommended.cycles).toBe(5);
    expect(out.recommended.bedtimeMs).toBe(
      out.wakeMs - 15 * MIN - 5 * 90 * MIN,
    );
  });

  it("clamps targetCycles into the offered 4..6 range", () => {
    const low = recommendTonight({
      tomorrowFirstEventStart: eventStart,
      prefs: { ...PREFS, targetCycles: 3 },
      now: T0 - 3 * HOUR,
    });
    expect(low.recommended.cycles).toBe(4);
    const high = recommendTonight({
      tomorrowFirstEventStart: eventStart,
      prefs: { ...PREFS, targetCycles: 7 },
      now: T0 - 3 * HOUR,
    });
    expect(high.recommended.cycles).toBe(6);
  });

  it("flags tooLate when the recommended bedtime has already passed", () => {
    const base = recommendTonight({
      tomorrowFirstEventStart: eventStart,
      prefs: PREFS,
      now: T0 - 3 * HOUR,
    });
    const bedtime = base.recommended.bedtimeMs;
    // exactly at the bedtime → not yet too late (half-open spirit)
    expect(
      recommendTonight({
        tomorrowFirstEventStart: eventStart,
        prefs: PREFS,
        now: bedtime,
      }).tooLate,
    ).toBe(false);
    expect(
      recommendTonight({
        tomorrowFirstEventStart: eventStart,
        prefs: PREFS,
        now: bedtime + MIN,
      }).tooLate,
    ).toBe(true);
  });
});
