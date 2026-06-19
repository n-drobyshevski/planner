import { describe, it, expect } from "vitest";
import {
  buildSleepDayPairs,
  sleepCorrelations,
  type SleepDayPair,
} from "@/lib/analytics/sleep-cross";
import type { Occurrence, SleepLog, TimeWindow } from "@/lib/types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Monday 2026-06-01 00:00 UTC. */
const T0 = Date.UTC(2026, 5, 1);
const UTC = "UTC";

let seq = 0;

function occ(over: Partial<Occurrence> = {}): Occurrence {
  seq += 1;
  return {
    key: `k${seq}`,
    eventId: `e${seq}`,
    occurrenceDate: over.start ?? T0,
    start: T0,
    end: T0 + HOUR,
    allDay: false,
    inactive: false,
    status: "confirmed",
    title: "Event",
    description: null,
    location: null,
    categoryId: null,
    color: null,
    kind: "event",
    ownerId: "m1",
    isPrivate: false,
    isShared: false,
    hiddenFromPublic: false,
    taskId: null,
    attributes: {},
    isRecurring: false,
    isException: false,
    ...over,
  };
}

function log(over: Partial<SleepLog> = {}): SleepLog {
  seq += 1;
  return {
    id: `s${seq}`,
    workspaceId: "w1",
    memberId: "m1",
    date: "2026-06-01",
    bedtimeAt: null,
    wokeAt: null,
    quality: null,
    fatigue: null,
    note: null,
    createdAt: T0,
    ...over,
  };
}

const days = (n: number) => Array.from({ length: n }, (_, i) => T0 + i * DAY);
const win = (n: number): TimeWindow => ({ start: T0, end: T0 + n * DAY });

describe("buildSleepDayPairs", () => {
  it("pairs a log with its wake day's tracked profile", () => {
    const logs = [
      log({
        date: "2026-06-02",
        bedtimeAt: T0 + 23 * HOUR, // Mon 23:00
        wokeAt: T0 + DAY + 7 * HOUR, // Tue 07:00
        quality: 4,
      }),
    ];
    const tue = T0 + DAY;
    const occurrences = [
      // Two separated 2h blocks on Tuesday, one rated.
      occ({ start: tue + 9 * HOUR, end: tue + 11 * HOUR, attributes: { satisfaction: 4 } }),
      occ({ start: tue + 14 * HOUR, end: tue + 16 * HOUR }),
      // Monday block — different day, ignored.
      occ({ start: T0 + 9 * HOUR, end: T0 + 12 * HOUR }),
    ];
    const pairs = buildSleepDayPairs(logs, occurrences, days(7), win(7), UTC);
    expect(pairs).toEqual([
      {
        wakeDayMs: tue,
        durationMs: 8 * HOUR,
        quality: 4,
        nextDay: {
          trackedMs: 4 * HOUR,
          fragmentation: 2 * HOUR, // two 2h merged blocks → avgBlockMs
          meanSatisfaction: 4,
        },
      },
    ]);
  });

  it("duration-weights meanSatisfaction and clips to the wake day", () => {
    const tue = T0 + DAY;
    const logs = [log({ date: "2026-06-02" })];
    const occurrences = [
      // 3h @2 and 1h @4 on Tuesday → (3·2 + 1·4)/4 = 2.5.
      occ({ start: tue + 9 * HOUR, end: tue + 12 * HOUR, attributes: { satisfaction: 2 } }),
      occ({ start: tue + 13 * HOUR, end: tue + 14 * HOUR, attributes: { satisfaction: 4 } }),
      // Crosses midnight into Wednesday — only the Tuesday hour counts.
      occ({ start: tue + 23 * HOUR, end: tue + DAY + 2 * HOUR }),
    ];
    const [pair] = buildSleepDayPairs(logs, occurrences, days(7), win(7), UTC);
    expect(pair.nextDay.meanSatisfaction).toBe(2.5);
    expect(pair.nextDay.trackedMs).toBe(5 * HOUR);
  });

  it("nulls missing fields: duration needs both instants, quality may be unrated", () => {
    const logs = [
      log({ date: "2026-06-02", bedtimeAt: T0 + 23 * HOUR }), // no wokeAt
      log({ date: "2026-06-03", wokeAt: T0 + 2 * DAY + 7 * HOUR }), // no bedtimeAt
    ];
    const pairs = buildSleepDayPairs(logs, [], days(7), win(7), UTC);
    expect(pairs.map((p) => p.durationMs)).toEqual([null, null]);
    expect(pairs.map((p) => p.quality)).toEqual([null, null]);
    // Empty day: no blocks → fragmentation null, nothing rated → null.
    expect(pairs[0].nextDay).toEqual({
      trackedMs: 0,
      fragmentation: null,
      meanSatisfaction: null,
    });
  });

  it("skips logs whose wake date is outside the window and ignores inactive blocks", () => {
    const logs = [
      log({ date: "2026-05-31", quality: 4 }), // before the window
      log({ date: "2026-06-08", quality: 4 }), // at the exclusive end
      log({ date: "2026-06-01", quality: 3 }),
    ];
    const occurrences = [
      occ({ start: T0 + 9 * HOUR, end: T0 + 10 * HOUR }),
      occ({ start: T0 + 0 * HOUR, end: T0 + 8 * HOUR, inactive: true }), // sleep block
    ];
    const pairs = buildSleepDayPairs(logs, occurrences, days(7), win(7), UTC);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].wakeDayMs).toBe(T0);
    expect(pairs[0].nextDay.trackedMs).toBe(HOUR);
  });

  it("sorts pairs by wake day ascending", () => {
    const logs = [log({ date: "2026-06-04" }), log({ date: "2026-06-02" })];
    const pairs = buildSleepDayPairs(logs, [], days(7), win(7), UTC);
    expect(pairs.map((p) => p.wakeDayMs)).toEqual([T0 + DAY, T0 + 3 * DAY]);
  });
});

describe("sleepCorrelations", () => {
  function pair(over: {
    durationMs?: number | null;
    quality?: number | null;
    trackedMs?: number;
    fragmentation?: number | null;
    meanSatisfaction?: number | null;
  }): SleepDayPair {
    seq += 1;
    return {
      wakeDayMs: T0 + seq * DAY,
      durationMs: over.durationMs ?? null,
      quality: over.quality ?? null,
      nextDay: {
        trackedMs: over.trackedMs ?? 0,
        fragmentation: over.fragmentation ?? null,
        meanSatisfaction: over.meanSatisfaction ?? null,
      },
    };
  }

  it("returns all 6 metric × side combos in a stable order", () => {
    const out = sleepCorrelations([]);
    expect(out.map((c) => `${c.metric}/${c.vs}`)).toEqual([
      "load/duration",
      "load/quality",
      "fragmentation/duration",
      "fragmentation/quality",
      "satisfaction/duration",
      "satisfaction/quality",
    ]);
    for (const c of out) expect(c).toMatchObject({ rho: null, n: 0 });
  });

  it("counts only pairs where both sides are non-null and gates rho below 10", () => {
    // 9 complete duration pairs (rho null), 10 complete quality pairs (rho set).
    const pairs = Array.from({ length: 10 }, (_, i) =>
      pair({
        durationMs: i < 9 ? (6 + i) * HOUR : null,
        quality: ((i % 4) + 1),
        trackedMs: (i + 1) * HOUR,
      }),
    );
    const out = sleepCorrelations(pairs);
    const byKey = Object.fromEntries(out.map((c) => [`${c.metric}/${c.vs}`, c]));
    expect(byKey["load/duration"].n).toBe(9);
    expect(byKey["load/duration"].rho).toBeNull();
    expect(byKey["load/quality"].n).toBe(10);
    expect(byKey["load/quality"].rho).not.toBeNull();
    // Fragmentation was never measured → empty combos.
    expect(byKey["fragmentation/duration"]).toMatchObject({ rho: null, n: 0 });
  });

  it("finds a perfect monotone relation via Spearman", () => {
    // Longer sleep → monotonically more tracked time (nonlinear is fine),
    // and monotonically lower satisfaction.
    const pairs = Array.from({ length: 10 }, (_, i) =>
      pair({
        durationMs: (5 + i) * HOUR,
        trackedMs: (i + 1) * (i + 1) * HOUR,
        meanSatisfaction: 4 - i * 0.2,
      }),
    );
    const out = sleepCorrelations(pairs);
    const byKey = Object.fromEntries(out.map((c) => [`${c.metric}/${c.vs}`, c]));
    expect(byKey["load/duration"].rho).toBeCloseTo(1);
    expect(byKey["satisfaction/duration"].rho).toBeCloseTo(-1);
  });
});
