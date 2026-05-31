import { describe, it, expect } from "vitest";
import { getWindow, getVisibleDays, navigate } from "@/lib/datetime/window";
import { startOfDay, getTime, addDays } from "date-fns";

// A fixed reference instant: 2026-05-31 (a Sunday) plus an afternoon offset so
// we exercise the startOfDay normalization. Using local-time construction keeps
// the tests timezone-tolerant (we never assert exact ms durations).
const focused = new Date(2026, 4, 31, 15, 30, 45, 123).getTime(); // May 31 2026

function isStartOfDay(ms: number): boolean {
  return getTime(startOfDay(ms)) === ms;
}

describe("getVisibleDays", () => {
  it("returns the correct number of days per view", () => {
    expect(getVisibleDays("day", focused)).toHaveLength(1);
    expect(getVisibleDays("week", focused)).toHaveLength(7);
    expect(getVisibleDays("month", focused)).toHaveLength(42);
  });

  it("each returned day equals startOfDay of itself", () => {
    for (const view of ["day", "week", "month"] as const) {
      for (const ms of getVisibleDays(view, focused)) {
        expect(isStartOfDay(ms)).toBe(true);
      }
    }
  });

  it("returns strictly increasing, consecutive calendar days (no repeats/gaps)", () => {
    // Guards against a bug where the step index is dropped (e.g. addDays(start, 0)),
    // which would yield N identical days that each still pass the startOfDay check.
    for (const view of ["day", "week", "month"] as const) {
      const days = getVisibleDays(view, focused);
      for (let i = 1; i < days.length; i++) {
        // Strictly increasing.
        expect(days[i]).toBeGreaterThan(days[i - 1]);
        // The i-th day is the startOfDay of (day[0] + i calendar days), i.e. each
        // entry is the next calendar day — DST-tolerant (uses addDays, not +24h).
        expect(days[i]).toBe(getTime(startOfDay(addDays(days[0], i))));
      }
    }
  });

  it("week start is Monday when weekStartsOn=1 (default)", () => {
    const [first] = getVisibleDays("week", focused);
    expect(new Date(first).getDay()).toBe(1); // 1 = Monday
  });

  it("week start respects weekStartsOn=0 (Sunday)", () => {
    const [first] = getVisibleDays("week", focused, { weekStartsOn: 0 });
    expect(new Date(first).getDay()).toBe(0); // 0 = Sunday
  });
});

describe("getWindow month grid", () => {
  it("has 42 visible days and grid starts on/before the 1st of the month", () => {
    const days = getVisibleDays("month", focused);
    expect(days).toHaveLength(42);

    const gridStart = days[0];
    const firstOfMonth = getTime(
      startOfDay(new Date(2026, 4, 1, 12, 0, 0).getTime()),
    );
    expect(gridStart).toBeLessThanOrEqual(firstOfMonth);

    // The grid should also contain the first of the month.
    expect(days).toContain(firstOfMonth);
  });

  it("month grid start is a Monday by default", () => {
    const win = getWindow("month", focused);
    expect(new Date(win.start).getDay()).toBe(1);
    expect(isStartOfDay(win.start)).toBe(true);
  });
});

describe("getWindow basic shape", () => {
  it("day window start is startOfDay of focused and end is after start", () => {
    const win = getWindow("day", focused);
    expect(win.start).toBe(getTime(startOfDay(focused)));
    expect(win.end).toBeGreaterThan(win.start);
  });

  it("week window start equals first visible day", () => {
    const win = getWindow("week", focused);
    const [first] = getVisibleDays("week", focused);
    expect(win.start).toBe(first);
    expect(win.end).toBeGreaterThan(win.start);
  });

  it("window.start equals getVisibleDays[0] for every view", () => {
    for (const view of ["day", "week", "month"] as const) {
      const win = getWindow(view, focused);
      const days = getVisibleDays(view, focused);
      expect(win.start).toBe(days[0]);
      expect(win.end).toBeGreaterThan(win.start);
    }
  });

  it("window is half-open: end is the start-of-day immediately after the last visible day", () => {
    // [start, end) — end must be exclusive and land on the day boundary right
    // after the final visible day. DST-tolerant: derived via addDays/startOfDay,
    // never asserting a fixed ms duration.
    for (const view of ["day", "week", "month"] as const) {
      const win = getWindow(view, focused);
      const days = getVisibleDays(view, focused);
      const lastDay = days[days.length - 1];
      const expectedEnd = getTime(startOfDay(addDays(lastDay, 1)));
      expect(win.end).toBe(expectedEnd);
      // The last visible day is strictly inside the window; end is not a visible day.
      expect(lastDay).toBeLessThan(win.end);
      expect(days).not.toContain(win.end);
    }
  });
});

describe("navigate", () => {
  it("returns startOfDay ms", () => {
    for (const view of ["day", "week", "month"] as const) {
      for (const dir of [-1, 0, 1] as const) {
        expect(isStartOfDay(navigate(view, focused, dir))).toBe(true);
      }
    }
  });

  it("dir 0 leaves the focused day unchanged (normalized)", () => {
    for (const view of ["day", "week", "month"] as const) {
      expect(navigate(view, focused, 0)).toBe(getTime(startOfDay(focused)));
    }
  });

  it("day navigate(+1) then (-1) round-trips", () => {
    const forward = navigate("day", focused, 1);
    const back = navigate("day", forward, -1);
    expect(back).toBe(getTime(startOfDay(focused)));
  });

  it("week navigate(+1) then (-1) round-trips", () => {
    const forward = navigate("week", focused, 1);
    const back = navigate("week", forward, -1);
    expect(back).toBe(getTime(startOfDay(focused)));
  });

  it("day navigate(+1) lands on the next calendar day", () => {
    const next = navigate("day", focused, 1);
    expect(new Date(next).getDate()).toBe(1); // May 31 -> June 1
    expect(new Date(next).getMonth()).toBe(5); // June
  });

  it("day navigate(-1) lands on the previous calendar day", () => {
    const prev = navigate("day", focused, -1);
    expect(new Date(prev).getDate()).toBe(30); // May 31 -> May 30
    expect(new Date(prev).getMonth()).toBe(4); // May
  });

  it("week navigate(+1) advances exactly one calendar week (same weekday)", () => {
    const next = navigate("week", focused, 1);
    const start = getTime(startOfDay(focused));
    // Same weekday, and exactly 7 calendar days later (DST-tolerant via addDays).
    expect(new Date(next).getDay()).toBe(new Date(start).getDay());
    expect(next).toBe(getTime(startOfDay(addDays(start, 7))));
  });

  it("month navigate changes the month", () => {
    const start = getTime(startOfDay(focused));
    const fwd = navigate("month", focused, 1);
    const back = navigate("month", focused, -1);

    expect(new Date(fwd).getMonth()).not.toBe(new Date(start).getMonth());
    expect(new Date(back).getMonth()).not.toBe(new Date(start).getMonth());
  });
});
