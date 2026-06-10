import { describe, it, expect } from "vitest";
import { byWeekday, hourHeatmap, fragmentation } from "@/lib/analytics/patterns";
import type { Occurrence, TimeWindow } from "@/lib/types";

const HOUR = 3_600_000;
const MIN = 60_000;
const DAY = 24 * HOUR;

// Mon 1 Jun 2026 UTC — mid-year, no DST in UTC; Berlin cases are explicit.
const T0 = Date.UTC(2026, 5, 1);
const UTC = "UTC";
const BERLIN = "Europe/Berlin";

function occ(over: Partial<Occurrence>): Occurrence {
  return {
    key: "e:0",
    eventId: "e",
    occurrenceDate: 0,
    start: T0 + 9 * HOUR,
    end: T0 + 10 * HOUR,
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
    isShared: false,
    taskId: null,
    attributes: {},
    isRecurring: false,
    isException: false,
    ...over,
  };
}

const days = (n: number) => Array.from({ length: n }, (_, i) => T0 + i * DAY);
const win = (n: number): TimeWindow => ({ start: T0, end: T0 + n * DAY });

describe("byWeekday", () => {
  it("returns 7 Monday-first entries with totals on the right weekday", () => {
    const rows = byWeekday(
      [
        occ({ start: T0 + 9 * HOUR, end: T0 + 11 * HOUR }), // Mon 2h
        occ({ key: "b", start: T0 + 2 * DAY + 9 * HOUR, end: T0 + 2 * DAY + 10 * HOUR }), // Wed 1h
      ],
      days(7),
      win(7),
      UTC,
    );
    expect(rows).toHaveLength(7);
    expect(rows[0]).toEqual({ weekday: 0, totalMs: 2 * HOUR, avgMs: 2 * HOUR, dayCount: 1 });
    expect(rows[2]).toEqual({ weekday: 2, totalMs: 1 * HOUR, avgMs: 1 * HOUR, dayCount: 1 });
    expect(rows[6]).toEqual({ weekday: 6, totalMs: 0, avgMs: 0, dayCount: 1 });
  });

  it("averages per occurrence-day so uneven ranges stay fair", () => {
    // 8-day window Mon–Mon: two Mondays (3h + 1h), other weekdays once.
    const rows = byWeekday(
      [
        occ({ start: T0 + 9 * HOUR, end: T0 + 12 * HOUR }),
        occ({ key: "b", start: T0 + 7 * DAY + 9 * HOUR, end: T0 + 7 * DAY + 10 * HOUR }),
      ],
      days(8),
      win(8),
      UTC,
    );
    expect(rows[0]).toEqual({ weekday: 0, totalMs: 4 * HOUR, avgMs: 2 * HOUR, dayCount: 2 });
    expect(rows[1].dayCount).toBe(1);
  });

  it("counts zero-day weekdays as zero average (empty window slice)", () => {
    // 2-day window has no Friday at all.
    const rows = byWeekday([], days(2), win(2), UTC);
    expect(rows[4]).toEqual({ weekday: 4, totalMs: 0, avgMs: 0, dayCount: 0 });
  });
});

describe("hourHeatmap", () => {
  it("attributes clipped slices to weekday×hour cells", () => {
    const { cells, maxMs } = hourHeatmap(
      [occ({ start: T0 + 9 * HOUR, end: T0 + 11 * HOUR + 30 * MIN })], // Mon 09:00–11:30
      win(7),
      UTC,
    );
    expect(cells).toHaveLength(168);
    const cell = (w: number, h: number) => cells[w * 24 + h];
    expect(cell(0, 9).ms).toBe(HOUR);
    expect(cell(0, 10).ms).toBe(HOUR);
    expect(cell(0, 11).ms).toBe(30 * MIN);
    expect(cell(0, 12).ms).toBe(0);
    expect(maxMs).toBe(HOUR);
  });

  it("accumulates the same weekday hour across weeks", () => {
    const { cells } = hourHeatmap(
      [
        occ({ start: T0 + 9 * HOUR, end: T0 + 10 * HOUR }),
        occ({ key: "b", start: T0 + 7 * DAY + 9 * HOUR, end: T0 + 7 * DAY + 10 * HOUR }),
      ],
      win(14),
      UTC,
    );
    expect(cells[0 * 24 + 9].ms).toBe(2 * HOUR);
  });

  it("clips to the window", () => {
    const { cells } = hourHeatmap(
      [occ({ start: T0 - HOUR, end: T0 + HOUR })], // half before the window
      win(1),
      UTC,
    );
    expect(cells[0 * 24 + 0].ms).toBe(HOUR);
    expect(cells.reduce((s, c) => s + c.ms, 0)).toBe(HOUR);
  });

  it("skips the lost DST hour in local labels (Berlin spring-forward)", () => {
    // Sun 29 Mar 2026, 02:00 CET → 03:00 CEST (01:00Z). Local 01:30–03:30
    // is absolute 00:30Z–01:30Z: 30m labeled 01:xx, 30m labeled 03:xx.
    const start = Date.UTC(2026, 2, 29, 0, 30);
    const end = Date.UTC(2026, 2, 29, 1, 30);
    const window: TimeWindow = {
      start: Date.UTC(2026, 2, 28, 23), // Sun 00:00 CET
      end: Date.UTC(2026, 2, 29, 22), // Mon 00:00 CEST
    };
    const { cells } = hourHeatmap([occ({ start, end })], window, BERLIN);
    const sunday = (h: number) => cells[6 * 24 + h];
    expect(sunday(1).ms).toBe(30 * MIN);
    expect(sunday(2).ms).toBe(0); // 02:xx never happens that night
    expect(sunday(3).ms).toBe(30 * MIN);
  });
});

describe("fragmentation", () => {
  it("merges overlapping/adjacent occurrences and measures gaps", () => {
    const f = fragmentation(
      [
        occ({ start: T0 + 9 * HOUR, end: T0 + 10 * HOUR }),
        occ({ key: "b", start: T0 + 10 * HOUR, end: T0 + 11 * HOUR }), // adjacent → merged
        occ({ key: "c", start: T0 + 13 * HOUR, end: T0 + 13 * HOUR + 20 * MIN }), // short
      ],
      win(1),
      UTC,
    );
    expect(f.blockCount).toBe(2);
    expect(f.longestBlockMs).toBe(2 * HOUR);
    expect(f.avgBlockMs).toBe((2 * HOUR + 20 * MIN) / 2);
    expect(f.medianBlockMs).toBe((2 * HOUR + 20 * MIN) / 2);
    expect(f.shortBlockShare).toBe(0.5); // 20m < 30m
    expect(f.avgGapMs).toBe(2 * HOUR); // 11:00 → 13:00
  });

  it("splits blocks at local midnight (no cross-day gaps)", () => {
    const f = fragmentation(
      [occ({ start: T0 + 23 * HOUR, end: T0 + DAY + HOUR })],
      win(2),
      UTC,
    );
    expect(f.blockCount).toBe(2);
    expect(f.longestBlockMs).toBe(HOUR);
    expect(f.avgGapMs).toBeNull(); // single block per day → no gaps
  });

  it("takes the odd median directly", () => {
    const f = fragmentation(
      [
        occ({ start: T0 + 1 * HOUR, end: T0 + 2 * HOUR }),
        occ({ key: "b", start: T0 + 4 * HOUR, end: T0 + 7 * HOUR }),
        occ({ key: "c", start: T0 + 9 * HOUR, end: T0 + 14 * HOUR }),
      ],
      win(1),
      UTC,
    );
    expect(f.blockCount).toBe(3);
    expect(f.medianBlockMs).toBe(3 * HOUR);
  });

  it("returns nulls for an empty window", () => {
    const f = fragmentation([], win(7), UTC);
    expect(f).toEqual({
      blockCount: 0,
      avgBlockMs: null,
      medianBlockMs: null,
      longestBlockMs: null,
      shortBlockShare: null,
      avgGapMs: null,
    });
  });
});
