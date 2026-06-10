import { describe, expect, it } from "vitest";

import { deriveNights } from "@/lib/sleep/derive";
import type { Occurrence } from "@/lib/types";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Monday 2026-06-01 00:00 UTC. */
const T0 = Date.UTC(2026, 5, 1);
const UTC = "UTC";
const BERLIN = "Europe/Berlin";

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
    inactive: true, // derive's candidates are inactive spans
    status: "confirmed",
    title: "Sleep",
    description: null,
    location: null,
    categoryId: null,
    color: null,
    kind: "event",
    ownerId: "m1",
    isPrivate: false,
    isShared: false,
    taskId: null,
    attributes: {},
    isRecurring: false,
    isException: false,
    ...over,
  };
}

/** Sleep span helper: from `hh:mm` on the day before `wakeDayMs` to `hh:mm` on it. */
function night(wakeDayMs: number, bedHour: number, wakeHour: number): Occurrence {
  return occ({
    start: wakeDayMs - DAY + bedHour * HOUR,
    end: wakeDayMs + wakeHour * HOUR,
  });
}

describe("deriveNights", () => {
  const days = [T0, T0 + DAY, T0 + 2 * DAY]; // Jun 1, 2, 3 (UTC)

  it("attributes a 22:00→07:00 span to its wake date only", () => {
    const span = night(T0 + DAY, 22, 7); // Jun 1 22:00 → Jun 2 07:00
    const out = deriveNights([span], days, UTC);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ dateKey: "2026-06-01", durationMs: 0, start: null, end: null });
    expect(out[1]).toMatchObject({
      dateKey: "2026-06-02",
      dayStartMs: T0 + DAY,
      start: T0 + 22 * HOUR,
      end: T0 + DAY + 7 * HOUR,
      durationMs: 9 * HOUR,
    });
    expect(out[2].durationMs).toBe(0);
  });

  it("merges touching pieces and bridges short wake-ups (split night)", () => {
    // 22:00–01:00 touching 01:00–03:00, a 30-minute wake-up, then 03:30–07:00
    const a = occ({ start: T0 + 22 * HOUR, end: T0 + DAY + 1 * HOUR });
    const b = occ({ start: T0 + DAY + 1 * HOUR, end: T0 + DAY + 3 * HOUR });
    const c = occ({ start: T0 + DAY + 3.5 * HOUR, end: T0 + DAY + 7 * HOUR });
    const out = deriveNights([a, b, c], days, UTC);
    expect(out[1]).toMatchObject({
      start: T0 + 22 * HOUR,
      end: T0 + DAY + 7 * HOUR,
      durationMs: 8.5 * HOUR, // 5h + 3.5h asleep; the 30m wake-up gap is awake
    });
  });

  it("drops disconnected inactive blocks like a morning commute", () => {
    // Real night 22:00–07:00, then an inactive commute 08:00–09:00 — the
    // ≥1h gap separates the clusters, so the commute never reads as sleep.
    const night = occ({ start: T0 + 22 * HOUR, end: T0 + DAY + 7 * HOUR });
    const commute = occ({ start: T0 + DAY + 8 * HOUR, end: T0 + DAY + 9 * HOUR });
    const out = deriveNights([night, commute], days, UTC);
    expect(out[1]).toMatchObject({
      start: T0 + 22 * HOUR,
      end: T0 + DAY + 7 * HOUR,
      durationMs: 9 * HOUR,
    });
  });

  it("clips to the [20:00, 12:00) night window", () => {
    // a long lie-in to 13:00 clips at 12:00; a disconnected wind-down block
    // earlier in the evening belongs to the smaller cluster and is dropped
    const windDown = occ({ start: T0 + 18 * HOUR, end: T0 + 21 * HOUR });
    const lieIn = occ({ start: T0 + 23 * HOUR, end: T0 + DAY + 13 * HOUR });
    const out = deriveNights([windDown, lieIn], days, UTC);
    expect(out[1]).toMatchObject({
      start: T0 + 23 * HOUR,
      end: T0 + DAY + 12 * HOUR,
      durationMs: 13 * HOUR,
    });
  });

  it("excludes daytime naps and non-candidate occurrences", () => {
    const nap = occ({ start: T0 + DAY + 13 * HOUR, end: T0 + DAY + 14 * HOUR });
    const allDay = occ({ start: T0 + 22 * HOUR, end: T0 + DAY + 7 * HOUR, allDay: true });
    const context = occ({ start: T0 + 22 * HOUR, end: T0 + DAY + 7 * HOUR, kind: "context" });
    const active = occ({ start: T0 + 22 * HOUR, end: T0 + DAY + 7 * HOUR, inactive: false });
    const out = deriveNights([nap, allDay, context, active], days, UTC);
    for (const n of out) expect(n.durationMs).toBe(0);
  });

  it("returns an entry per requested day with zone-correct keys", () => {
    const out = deriveNights([], days, UTC);
    expect(out.map((n) => n.dateKey)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
    expect(out.map((n) => n.dayStartMs)).toEqual(days);
  });

  it("handles the Berlin fall-back night (2026-10-25, 25h day)", () => {
    // Wake day Oct 25 2026; Berlin day starts Oct 24 22:00 UTC (CEST).
    const dayStart = Date.UTC(2026, 9, 24, 22);
    // 23:00 CEST Oct 24 = 21:00 UTC; 08:30 CET Oct 25 = 07:30 UTC → 10.5h elapsed.
    const span = occ({ start: Date.UTC(2026, 9, 24, 21), end: Date.UTC(2026, 9, 25, 7, 30) });
    const out = deriveNights([span], [dayStart], BERLIN);
    expect(out[0]).toMatchObject({
      dateKey: "2026-10-25",
      durationMs: 10.5 * HOUR,
      start: Date.UTC(2026, 9, 24, 21),
      end: Date.UTC(2026, 9, 25, 7, 30),
    });
  });

  it("handles the Berlin spring-forward night (2026-03-29, 23h day)", () => {
    // Wake day Mar 29 2026; Berlin day starts Mar 28 23:00 UTC (CET).
    const dayStart = Date.UTC(2026, 2, 28, 23);
    // 23:00 CET Mar 28 = 22:00 UTC; 08:30 CEST Mar 29 = 06:30 UTC → 8.5h elapsed.
    const span = occ({ start: Date.UTC(2026, 2, 28, 22), end: Date.UTC(2026, 2, 29, 6, 30) });
    const out = deriveNights([span], [dayStart], BERLIN);
    expect(out[0]).toMatchObject({
      dateKey: "2026-03-29",
      durationMs: 8.5 * HOUR,
    });
  });

  it("keeps DST night windows on wall-clock 20:00/12:00 boundaries", () => {
    // Fall-back wake day: a lie-in to 13:00 CET clips at 12:00 CET = 11:00 UTC.
    const dayStart = Date.UTC(2026, 9, 24, 22);
    const span = occ({ start: Date.UTC(2026, 9, 24, 21), end: Date.UTC(2026, 9, 25, 12) });
    const out = deriveNights([span], [dayStart], BERLIN);
    expect(out[0].end).toBe(Date.UTC(2026, 9, 25, 11));
  });
});
