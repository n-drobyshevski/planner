import { describe, expect, it } from "vitest";

import {
  computeSleepHints,
  HINTS_CAP,
  HINTS_MIN_LOGGED,
  type SleepHintsInput,
} from "@/lib/sleep/adaptive";
import type { SleepPrefs } from "@/lib/sleep/cycles";
import type { DerivedNight } from "@/lib/sleep/derive";
import type { SleepLog } from "@/lib/types";

const MIN = 60_000;
const HOUR = 60 * MIN;
const UTC = "UTC";

/** target in-bed time for PREFS = 5×90 + 15 = 465 min */
const PREFS: SleepPrefs = {
  cycleLengthMin: 90,
  onsetLatencyMin: 15,
  targetCycles: 5,
};

let seq = 0;

/** Log on wake date 2026-06-(seq), times built from UTC hours on that date. */
function log(over: Partial<SleepLog> = {}): SleepLog {
  seq += 1;
  const day = String(seq).padStart(2, "0");
  return {
    id: `s${seq}`,
    workspaceId: "w1",
    memberId: "m1",
    date: `2026-06-${day}`,
    bedtimeAt: null,
    wokeAt: null,
    quality: null,
    fatigue: null,
    note: null,
    createdAt: Date.UTC(2026, 5, seq, 8),
    ...over,
  };
}

/** bedtime `bedH:bedM` the evening before the log's wake date; wake on it. */
function times(dateStr: string, bedH: number, bedM: number, wakeH: number, wakeM: number) {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const wake = Date.UTC(y, mo - 1, d, wakeH, wakeM);
  const bed =
    bedH >= 12
      ? Date.UTC(y, mo - 1, d - 1, bedH, bedM) // evening before
      : Date.UTC(y, mo - 1, d, bedH, bedM); // after midnight
  return { bedtimeAt: bed, wokeAt: wake };
}

function input(over: Partial<SleepHintsInput> = {}): SleepHintsInput {
  return { nights: [], logs: [], prefs: PREFS, timeZone: UTC, ...over };
}

function loggedNight(
  bedH: number,
  bedM: number,
  wakeH: number,
  wakeM: number,
  quality: number,
): SleepLog {
  const l = log({ quality });
  return { ...l, ...times(l.date, bedH, bedM, wakeH, wakeM) };
}

describe("computeSleepHints", () => {
  it("returns [] below the minimum logged sample", () => {
    const logs = [
      loggedNight(23, 0, 7, 0, 7),
      loggedNight(0, 0, 6, 0, 1),
      loggedNight(23, 0, 7, 0, 7),
      loggedNight(0, 0, 6, 0, 1),
    ];
    expect(logs.length).toBeLessThan(HINTS_MIN_LOGGED);
    expect(computeSleepHints(input({ logs }))).toEqual([]);
  });

  it("flags short nights when they score worse (duration hint)", () => {
    // 4× 8h (≥ 465min target) quality 7, 4× 6h quality 2 → diff 5.0
    const logs = [
      ...Array.from({ length: 4 }, () => loggedNight(23, 0, 7, 0, 7)),
      ...Array.from({ length: 4 }, () => loggedNight(0, 0, 6, 0, 2)),
    ];
    const out = computeSleepHints(input({ logs }));
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("duration");
    expect(out[0].severity).toBe("attention");
    expect(out[0].bodyKey).toBe("durationShortBody");
    expect(out[0].vars.count).toBe(8);
  });

  it("also reports the opposite correlation direction", () => {
    const logs = [
      ...Array.from({ length: 4 }, () => loggedNight(23, 0, 7, 0, 2)),
      ...Array.from({ length: 4 }, () => loggedNight(0, 0, 6, 0, 7)),
    ];
    const out = computeSleepHints(input({ logs }));
    expect(out.map((h) => h.kind)).toContain("duration");
  });

  it("stays silent when a duration group is too small", () => {
    const logs = [
      ...Array.from({ length: 7 }, () => loggedNight(23, 0, 7, 0, 7)),
      loggedNight(0, 0, 6, 0, 2),
    ];
    expect(computeSleepHints(input({ logs }))).toEqual([]);
  });

  it("uses fatigue when quality is absent", () => {
    const logs = [
      ...Array.from({ length: 4 }, () => {
        const l = log({ fatigue: 1 });
        return { ...l, ...times(l.date, 23, 0, 7, 0) };
      }),
      ...Array.from({ length: 4 }, () => {
        const l = log({ fatigue: 7 });
        return { ...l, ...times(l.date, 0, 0, 6, 0) };
      }),
    ];
    const out = computeSleepHints(input({ logs }));
    expect(out.map((h) => h.kind)).toContain("duration");
  });

  it("flags irregular bedtimes (regularity hint)", () => {
    // bedtimes 22:00 / 23:30 / 21:45 / 00:30 / 23:00 → σ ≈ 60 min; no wake
    // times and no derived nights, so duration/cycle rules have no sample.
    const beds: [number, number][] = [
      [22, 0],
      [23, 30],
      [21, 45],
      [0, 30],
      [23, 0],
    ];
    const logs = beds.map(([h, m]) => {
      const l = log({ quality: 3 });
      return { ...l, bedtimeAt: times(l.date, h, m, 7, 0).bedtimeAt };
    });
    const out = computeSleepHints(input({ logs }));
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("regularity");
    expect(out[0].severity).toBe("attention");
  });

  it("does not flag tight bedtimes", () => {
    const logs = Array.from({ length: 5 }, () => {
      const l = log({ quality: 3 });
      return { ...l, bedtimeAt: times(l.date, 23, 0, 7, 0).bedtimeAt };
    });
    expect(computeSleepHints(input({ logs }))).toEqual([]);
  });

  it("flags cycle alignment when aligned nights score better", () => {
    // All ≥ target so the duration rule can't split; same bedtime so no
    // regularity. Aligned: 555min in bed (540 asleep = 6×90, dist 0).
    // Misaligned: 510min (495 asleep, dist 45). Three per group (the
    // compareGroups minimum).
    const logs = [
      loggedNight(22, 0, 7, 15, 7),
      loggedNight(22, 0, 7, 15, 7),
      loggedNight(22, 0, 7, 15, 7),
      loggedNight(22, 0, 6, 30, 2),
      loggedNight(22, 0, 6, 30, 2),
      loggedNight(22, 0, 6, 30, 2),
    ];
    const out = computeSleepHints(input({ logs }));
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("cycle-alignment");
  });

  it("stays silent when a comparison group has fewer than three nights", () => {
    // Two aligned vs three misaligned — below the n≥3 per-group floor.
    const logs = [
      loggedNight(22, 0, 7, 15, 7),
      loggedNight(22, 0, 7, 15, 7),
      loggedNight(22, 0, 6, 30, 2),
      loggedNight(22, 0, 6, 30, 2),
      loggedNight(22, 0, 6, 30, 2),
    ];
    expect(computeSleepHints(input({ logs }))).toEqual([]);
  });

  it("does not subtract onset latency from derived durations (cycle alignment)", () => {
    // Derived block-sums are asleep-ish time already. 615min → dist 15
    // (aligned, boundary); subtracting latency would give 600 → dist 30,
    // emptying the aligned group and silencing the hint. 495min → dist 45
    // (misaligned) either way.
    const logs = [
      ...Array.from({ length: 3 }, () => log({ quality: 7 })),
      ...Array.from({ length: 3 }, () => log({ quality: 2 })),
    ];
    const nights: DerivedNight[] = logs.map((l, i) => ({
      dateKey: l.date,
      dayStartMs: Date.UTC(2026, 5, i + 1),
      start: null,
      end: null,
      durationMs: (i < 3 ? 615 : 495) * MIN,
    }));
    const out = computeSleepHints(input({ logs, nights }));
    const alignment = out.find((h) => h.kind === "cycle-alignment");
    expect(alignment).toBeDefined();
    expect(alignment?.titleKey).toBe("cycleAlignedTitle");
  });

  it("falls back to derived nights for duration when times are not logged", () => {
    // Logs carry only scores; durations come from derived nights by dateKey.
    const logs = [
      ...Array.from({ length: 4 }, () => log({ quality: 7 })),
      ...Array.from({ length: 4 }, () => log({ quality: 2 })),
    ];
    const nights: DerivedNight[] = logs.map((l, i) => ({
      dateKey: l.date,
      dayStartMs: Date.UTC(2026, 5, i + 1),
      start: null,
      end: null,
      durationMs: i < 4 ? 8 * HOUR : 6 * HOUR,
    }));
    const out = computeSleepHints(input({ logs, nights }));
    expect(out.map((h) => h.kind)).toContain("duration");
  });

  it("orders by severity then kind and respects the cap", () => {
    // Short+misaligned+late-varied vs long+aligned+steady → all three fire.
    const logs = [
      loggedNight(22, 0, 7, 15, 7),
      loggedNight(22, 0, 7, 15, 7),
      loggedNight(22, 0, 7, 15, 7),
      loggedNight(0, 30, 6, 0, 1),
      loggedNight(0, 30, 6, 0, 1),
      loggedNight(0, 30, 6, 0, 1),
    ];
    const out = computeSleepHints(input({ logs }));
    expect(out.length).toBeLessThanOrEqual(HINTS_CAP);
    expect(out.map((h) => h.kind)).toEqual([
      "duration",
      "regularity",
      "cycle-alignment",
    ]);
    for (const h of out) {
      expect(h.bodyKey).toBeTruthy();
      expect(h.titleKey).toBeTruthy();
      expect(h.vars.count).toBeGreaterThan(0);
    }
    expect(new Set(out.map((h) => h.id)).size).toBe(out.length);
  });
});
