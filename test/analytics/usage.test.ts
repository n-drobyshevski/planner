import { describe, it, expect } from "vitest";
import { computeUsage, isTracked } from "@/lib/analytics/usage";
import type { Occurrence, TimeWindow } from "@/lib/types";

const HOUR = 3_600_000;

// Local Date construction keeps timestamps timezone-stable across machines.
// June 1 2026 is a Monday; mid-June has no DST transition, so days are 24h.
const D = (h = 0, min = 0, day = 1) => new Date(2026, 5, day, h, min).getTime();

const day1 = D(0, 0, 1);
const day2 = D(0, 0, 2);
const day3 = D(0, 0, 3);
const day4 = D(0, 0, 4);

// A 3-day window [Mon 1 Jun, Thu 4 Jun) with its visible-day list.
const days3 = [day1, day2, day3];
const win3: TimeWindow = { start: day1, end: day4 };

function occ(over: Partial<Occurrence>): Occurrence {
  return {
    key: "e:0",
    eventId: "e",
    occurrenceDate: 0,
    start: D(9),
    end: D(10),
    allDay: false,
    inactive: false,
    status: "confirmed",
    title: "t",
    description: null,
    location: null,
    categoryId: null,
    color: null,
    kind: "event",
    ownerId: "me",
    isPrivate: false,
    taskId: null,
    isRecurring: false,
    isException: false,
    ...over,
  };
}

describe("isTracked", () => {
  it("keeps normal timed events", () => {
    expect(isTracked(occ({}))).toBe(true);
  });
  it("drops all-day, inactive, and context occurrences", () => {
    expect(isTracked(occ({ allDay: true }))).toBe(false);
    expect(isTracked(occ({ inactive: true }))).toBe(false);
    expect(isTracked(occ({ kind: "context" }))).toBe(false);
  });
});

describe("computeUsage", () => {
  it("totals a single timed event and attributes it to its day", () => {
    const u = computeUsage([occ({ start: D(9), end: D(11) })], days3, win3);
    expect(u.summary.totalMs).toBe(2 * HOUR);
    expect(u.summary.eventCount).toBe(1);
    expect(u.perDay).toEqual([
      { dayMs: day1, ms: 2 * HOUR },
      { dayMs: day2, ms: 0 },
      { dayMs: day3, ms: 0 },
    ]);
    expect(u.summary.busiestDay).toEqual({ dayMs: day1, ms: 2 * HOUR });
    expect(u.summary.activeDays).toBe(1);
    // dailyAverage is total / number of days in the range (3), not active days.
    expect(u.summary.dailyAverageMs).toBe((2 * HOUR) / 3);
  });

  it("excludes all-day, inactive, and context occurrences from every total", () => {
    const u = computeUsage(
      [
        occ({ key: "a", start: D(9), end: D(10) }),
        occ({ key: "b", allDay: true, start: day1, end: day2 }),
        occ({ key: "c", inactive: true, start: D(0), end: D(8) }),
        occ({ key: "d", kind: "context", start: D(8), end: D(18) }),
      ],
      days3,
      win3,
    );
    expect(u.summary.totalMs).toBe(1 * HOUR);
    expect(u.summary.eventCount).toBe(1);
  });

  it("clips durations to the window edges", () => {
    // Starts the evening before the window; only the in-window hour counts.
    const u = computeUsage(
      [occ({ start: D(23, 0, 0 /* May 31 23:00 via day=0 */), end: D(1) })],
      days3,
      win3,
    );
    expect(u.summary.totalMs).toBe(1 * HOUR);
    expect(u.perDay[0]).toEqual({ dayMs: day1, ms: 1 * HOUR });
  });

  it("splits an across-midnight event into two per-day buckets", () => {
    const u = computeUsage([occ({ start: D(23), end: D(1, 0, 2) })], days3, win3);
    expect(u.perDay[0]).toEqual({ dayMs: day1, ms: 1 * HOUR }); // 23:00–24:00
    expect(u.perDay[1]).toEqual({ dayMs: day2, ms: 1 * HOUR }); // 00:00–01:00
    expect(u.perDay[2].ms).toBe(0);
    expect(u.summary.totalMs).toBe(2 * HOUR);
    // Σ perDay equals the total (buckets tile the window).
    expect(u.perDay.reduce((s, d) => s + d.ms, 0)).toBe(u.summary.totalMs);
  });

  it("groups by category and member, sorted by time descending", () => {
    const u = computeUsage(
      [
        occ({ key: "a", categoryId: "work", ownerId: "me", start: D(9), end: D(12) }),
        occ({ key: "b", categoryId: "gym", ownerId: "me", start: D(13), end: D(14) }),
        occ({ key: "c", categoryId: null, ownerId: "you", start: D(15), end: D(17) }),
      ],
      days3,
      win3,
    );
    expect(u.byCategory).toEqual([
      { categoryId: "work", ms: 3 * HOUR },
      { categoryId: null, ms: 2 * HOUR },
      { categoryId: "gym", ms: 1 * HOUR },
    ]);
    expect(u.byMember).toEqual([
      { ownerId: "me", ms: 4 * HOUR },
      { ownerId: "you", ms: 2 * HOUR },
    ]);
  });

  it("folds context membership into byCategory and ignores the backdrop", () => {
    // A context window painting "work" (excluded from totals), a child event
    // inside it assigned the same Context, and an override event physically
    // inside the window but assigned a different Context ("errands").
    const u = computeUsage(
      [
        occ({ key: "w", kind: "context", categoryId: "work", start: D(9), end: D(17) }),
        occ({ key: "a", categoryId: "work", start: D(9), end: D(11) }),
        occ({ key: "b", categoryId: "errands", start: D(11), end: D(12) }),
      ],
      days3,
      win3,
    );
    // The backdrop is not tracked; the two real events count toward their own
    // assigned Context (the override counts as errands, not work).
    expect(u.byCategory).toEqual([
      { categoryId: "work", ms: 2 * HOUR },
      { categoryId: "errands", ms: 1 * HOUR },
    ]);
    expect(u.summary.totalMs).toBe(3 * HOUR);
    // Σ perDay still equals the total.
    expect(u.perDay.reduce((s, d) => s + d.ms, 0)).toBe(u.summary.totalMs);
  });

  it("picks the busiest day across several days", () => {
    const u = computeUsage(
      [
        occ({ key: "a", start: D(9), end: D(10) }), // day1: 1h
        occ({ key: "b", start: D(9, 0, 2), end: D(12, 0, 2) }), // day2: 3h
        occ({ key: "c", start: D(9, 0, 3), end: D(11, 0, 3) }), // day3: 2h
      ],
      days3,
      win3,
    );
    expect(u.summary.busiestDay).toEqual({ dayMs: day2, ms: 3 * HOUR });
    expect(u.summary.activeDays).toBe(3);
  });

  it("returns zeros and a null busiest day for empty input", () => {
    const u = computeUsage([], days3, win3);
    expect(u.summary).toEqual({
      totalMs: 0,
      eventCount: 0,
      activeDays: 0,
      dailyAverageMs: 0,
      busiestDay: null,
    });
    expect(u.byCategory).toEqual([]);
    expect(u.byMember).toEqual([]);
    expect(u.perDay).toEqual([
      { dayMs: day1, ms: 0 },
      { dayMs: day2, ms: 0 },
      { dayMs: day3, ms: 0 },
    ]);
  });
});
