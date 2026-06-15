import { describe, expect, it } from "vitest";

import {
  bedtimesForWake,
  CYCLE_RANGE,
  firstCommitment,
  GET_READY_MS,
  recommendTonight,
  type SleepPrefs,
  wakesForBedtime,
} from "@/lib/sleep/cycles";
import type { HabitualPhase } from "@/lib/sleep/circadian";
import type { Occurrence } from "@/lib/types";

const MIN = 60_000;
const HOUR = 60 * MIN;
const UTC = "UTC";
/** Monday 2026-06-01 00:00 UTC — arbitrary anchor; cycles math is zone-free. */
const T0 = Date.UTC(2026, 5, 1);

const PREFS: SleepPrefs = {
  cycleLengthMin: 90,
  onsetLatencyMin: 15,
  targetCycles: 5, // asleep target 5×90 = 450 min (7.5 h)
};

/** minutes since previous noon for a wall hour:min (≥12 = evening, else morning). */
const sinceNoon = (h: number, m = 0) => (h >= 12 ? (h - 12) * 60 + m : (h + 12) * 60 + m);

function phase(bedH: number, bedM: number, wakeH: number | null, wakeM = 0): HabitualPhase {
  return {
    bedtimeMinSinceNoon: sinceNoon(bedH, bedM),
    wakeMinSinceNoon: wakeH === null ? null : sinceNoon(wakeH, wakeM),
    spreadMin: 20,
    nights: 14,
  };
}

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
  // Tomorrow's wake day is 2026-06-02; the night before is 2026-06-01.
  const D2 = (h: number, m = 0) => Date.UTC(2026, 5, 2, h, m);
  const D1 = (h: number, m = 0) => Date.UTC(2026, 5, 1, h, m);
  const nightBefore = D1(21); // 21:00 the evening before

  it("cold start (no habitual phase) reproduces schedule-only behavior", () => {
    const out = recommendTonight({
      tomorrowFirstEventStart: D2(7),
      prefs: PREFS,
      habitualPhase: null,
      now: nightBefore,
      timeZone: UTC,
    })!;
    expect(out.wakeWindow.end).toBe(D2(7) - GET_READY_MS); // 06:15
    expect(out.bedtimeMs).toBe(D2(7) - GET_READY_MS - 15 * MIN - 450 * MIN); // 22:30
    expect(out.durationMs).toBe(450 * MIN);
    expect(out.cyclesApprox).toBe(5);
    expect(out.conflict).toBeNull();
    expect(out.source).toBe("schedule");
  });

  it("holds the bedtime at the phase-advance limit when an early event fights the clock", () => {
    // Body sleeps ~00:45; a 07:00 event wants bed at 22:30 — a >2 h advance.
    const out = recommendTonight({
      tomorrowFirstEventStart: D2(7),
      prefs: PREFS,
      habitualPhase: phase(0, 45, 8, 0),
      now: nightBefore,
      timeZone: UTC,
    })!;
    expect(out.bedtimeMs).toBe(D2(0, 15)); // habitual 00:45 − 30 min cap
    expect(out.conflict).not.toBeNull();
    expect(out.conflict!.scheduleBedtimeMs).toBe(D1(22, 30));
    expect(out.conflict!.habitualBedtimeMs).toBe(D2(0, 45));
    expect(out.conflict!.shortfallMs).toBe(105 * MIN); // 450 target − 345 achievable
    expect(out.conflict!.glideNights).toBe(5); // ceil(135 / 30)
    expect(out.source).toBe("schedule");
  });

  it("wakes at the habitual time and recommends the habitual bedtime when the event is late", () => {
    // Event 10:00 doesn't force an early wake; body wakes 07:00, sleeps 23:00.
    const out = recommendTonight({
      tomorrowFirstEventStart: D2(10),
      prefs: PREFS,
      habitualPhase: phase(23, 0, 7, 0),
      now: nightBefore,
      timeZone: UTC,
    })!;
    expect(out.wakeWindow.end).toBe(D2(7)); // habitual wake, not event − getready
    expect(out.bedtimeMs).toBe(D1(23)); // habitual bedtime, regularity-first
    expect(out.conflict).toBeNull();
    expect(out.source).toBe("circadian");
  });

  it("recommends the habitual phase when there is no commitment tomorrow", () => {
    const out = recommendTonight({
      tomorrowFirstEventStart: null,
      prefs: PREFS,
      habitualPhase: phase(23, 0, 7, 0),
      now: nightBefore,
      timeZone: UTC,
    })!;
    expect(out.bedtimeMs).toBe(D1(23));
    expect(out.wakeWindow.end).toBe(D2(7));
    expect(out.source).toBe("circadian");
    expect(out.conflict).toBeNull();
  });

  it("returns null with no commitment and no habitual phase", () => {
    expect(
      recommendTonight({
        tomorrowFirstEventStart: null,
        prefs: PREFS,
        habitualPhase: null,
        now: nightBefore,
        timeZone: UTC,
      }),
    ).toBeNull();
  });

  it("nudges the target up by recent debt, bounded by the nudge cap", () => {
    const out = recommendTonight({
      tomorrowFirstEventStart: D2(9),
      prefs: PREFS,
      habitualPhase: null,
      recentDebtMs: 5 * HOUR, // far over the cap
      now: nightBefore,
      timeZone: UTC,
    })!;
    // 450 base + 60 cap = 510 min asleep target.
    expect(out.durationMs).toBe(510 * MIN);
  });

  it("flags tooLate once now is past the recommended bedtime", () => {
    const args = {
      tomorrowFirstEventStart: D2(7),
      prefs: PREFS,
      habitualPhase: null,
      timeZone: UTC,
    };
    const bed = recommendTonight({ ...args, now: nightBefore })!.bedtimeMs;
    expect(recommendTonight({ ...args, now: bed })!.tooLate).toBe(false);
    expect(recommendTonight({ ...args, now: bed + MIN })!.tooLate).toBe(true);
  });
});

describe("firstCommitment", () => {
  const VIEWER = "viewer";
  const PARTNER = "partner";
  // Tomorrow's window: [2026-06-02 00:00, 2026-06-03 00:00).
  const winStart = Date.UTC(2026, 5, 2);
  const at = (h: number, m = 0) => Date.UTC(2026, 5, 2, h, m);

  function occ(over: Partial<Occurrence> = {}): Occurrence {
    return {
      key: "k",
      eventId: "e",
      occurrenceDate: at(9),
      start: at(9),
      end: at(10),
      allDay: false,
      inactive: false,
      status: "confirmed",
      title: "Thing",
      description: null,
      location: null,
      categoryId: null,
      color: null,
      kind: "event",
      ownerId: VIEWER,
      isPrivate: false,
      isShared: false,
      taskId: null,
      attributes: {},
      isRecurring: false,
      isException: false,
      ...over,
    };
  }

  it("counts a timed context window and picks it over a later event", () => {
    const work = occ({ kind: "context", title: "Work", start: at(8, 30), end: at(11, 45) });
    const event = occ({ kind: "event", title: "Decathlon", start: at(17, 15) });
    expect(firstCommitment([event, work], VIEWER, winStart)?.title).toBe("Work");
  });

  it("ignores all-day, inactive, and cancelled occurrences", () => {
    expect(
      firstCommitment(
        [
          occ({ allDay: true, start: at(6) }),
          occ({ inactive: true, kind: "context", start: at(7) }),
          occ({ status: "cancelled", start: at(8) }),
          occ({ title: "Real", start: at(9) }),
        ],
        VIEWER,
        winStart,
      )?.title,
    ).toBe("Real");
  });

  it("keeps shared commitments but drops the partner's private ones", () => {
    const partnerPrivate = occ({ ownerId: PARTNER, isShared: false, start: at(8) });
    const shared = occ({ ownerId: PARTNER, isShared: true, title: "Shared", start: at(9) });
    expect(firstCommitment([partnerPrivate, shared], VIEWER, winStart)?.title).toBe("Shared");
  });

  it("drops occurrences that started before the window (spilled in from today)", () => {
    const spill = occ({ start: winStart - HOUR });
    expect(firstCommitment([spill], VIEWER, winStart)).toBeNull();
  });

  it("returns null when nothing qualifies", () => {
    expect(firstCommitment([], VIEWER, winStart)).toBeNull();
  });
});
