import { describe, it, expect } from "vitest";
import { goalProgress } from "@/lib/insights/goals";
import type { CategoryGoal, TimeWindow } from "@/lib/types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Mon 1 Jun 2026 00:00 UTC — a clean 7-day window.
const T0 = Date.UTC(2026, 5, 1);

function goal(over: Partial<CategoryGoal> = {}): CategoryGoal {
  return {
    id: "g1",
    workspaceId: "ws",
    categoryId: "cat",
    weeklyTargetMs: 7 * HOUR, // 1h/day on a 7-day window
    direction: "at-least",
    createdBy: "me",
    createdAt: T0,
    ...over,
  };
}

function week(start = T0): { days: number[]; window: TimeWindow } {
  return {
    days: Array.from({ length: 7 }, (_, i) => start + i * DAY),
    window: { start, end: start + 7 * DAY },
  };
}

describe("goalProgress — target scaling", () => {
  it("scales the weekly target by day count (31-day month)", () => {
    const days = Array.from({ length: 31 }, (_, i) => T0 + i * DAY);
    const window: TimeWindow = { start: T0, end: T0 + 31 * DAY };
    const p = goalProgress(goal(), 0, days, window, T0);
    expect(p.targetMs).toBeCloseTo(7 * HOUR * (31 / 7), 6);
  });

  it("a DST week still counts as exactly one week (7 day starts)", () => {
    // Berlin spring-forward week: 7 local days spanning 167 real hours.
    // Scaling uses days.length, not elapsed ms — the target stays 7h.
    const { days, window } = week();
    const dstWindow: TimeWindow = { start: window.start, end: window.end - HOUR };
    const p = goalProgress(goal(), 0, days, dstWindow, window.start);
    expect(p.targetMs).toBe(7 * HOUR);
  });
});

describe("goalProgress — at-least (a target to reach)", () => {
  it("met when actual >= target, even mid-window", () => {
    const { days, window } = week();
    const p = goalProgress(goal(), 7 * HOUR, days, window, T0 + 2 * DAY);
    expect(p.judgment).toBe("met");
  });

  it("on-track when at/ahead of pace mid-window", () => {
    const { days, window } = week();
    // 3 of 7 days elapsed → expected 3/7 of 7h = 3h. 3h tracked = on pace.
    const p = goalProgress(goal(), 3 * HOUR, days, window, T0 + 3 * DAY);
    expect(p.judgment).toBe("on-track");
    expect(p.expected).toBeCloseTo(3 / 7, 6);
  });

  it("behind when under pace mid-window", () => {
    const { days, window } = week();
    const p = goalProgress(goal(), 1 * HOUR, days, window, T0 + 3 * DAY);
    expect(p.judgment).toBe("behind");
  });

  it("a fully-past window is met or behind — never on-track", () => {
    const { days, window } = week();
    const after = window.end + DAY;
    expect(goalProgress(goal(), 7 * HOUR, days, window, after).judgment).toBe("met");
    expect(goalProgress(goal(), 5 * HOUR, days, window, after).judgment).toBe("behind");
    expect(goalProgress(goal(), 5 * HOUR, days, window, after).expected).toBeNull();
  });
});

describe("goalProgress — at-most (a budget cap)", () => {
  const budget = () => goal({ direction: "at-most" });

  it("over when the budget is blown", () => {
    const { days, window } = week();
    const p = goalProgress(budget(), 8 * HOUR, days, window, T0 + 3 * DAY);
    expect(p.judgment).toBe("over");
  });

  it("behind (running hot) when above pace but under the cap", () => {
    const { days, window } = week();
    // 2 of 7 days elapsed → pace 2h; 5h spent is hot but under 7h.
    const p = goalProgress(budget(), 5 * HOUR, days, window, T0 + 2 * DAY);
    expect(p.judgment).toBe("behind");
  });

  it("on-track at/under pace, and for past windows that stayed under", () => {
    const { days, window } = week();
    const mid = goalProgress(budget(), 1 * HOUR, days, window, T0 + 2 * DAY);
    expect(mid.judgment).toBe("on-track");
    const past = goalProgress(budget(), 6 * HOUR, days, window, window.end + DAY);
    expect(past.judgment).toBe("on-track");
  });
});

describe("goalProgress — pace fraction", () => {
  it("is 0 before the window and includes the partial current day", () => {
    const { days, window } = week();
    expect(goalProgress(goal(), 0, days, window, T0 - DAY).expected).toBe(0);
    const halfThroughDay3 = T0 + 2 * DAY + 12 * HOUR;
    expect(goalProgress(goal(), 0, days, window, halfThroughDay3).expected).toBeCloseTo(
      2.5 / 7,
      6,
    );
  });

  it("handles empty windows without dividing by zero", () => {
    const p = goalProgress(goal(), 0, [], { start: T0, end: T0 }, T0);
    expect(p.expected).toBeNull();
    expect(p.targetMs).toBe(0);
    // A zero-day window scales the target to 0, which is trivially met.
    expect(p.judgment).toBe("met");
    expect(p.ratio).toBe(0);
  });
});
