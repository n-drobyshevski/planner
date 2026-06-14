import { describe, it, expect } from "vitest";
import {
  comparisonNoun,
  deriveOverviewLede,
  deriveTrendsLede,
  derivePatternsLede,
  deriveTasksLede,
} from "@/lib/insights/ledes";
import type { Usage } from "@/lib/analytics/usage";
import type { TaskStats } from "@/lib/analytics/task-stats";
import type { Fragmentation } from "@/lib/analytics/patterns";

const H = 3_600_000;
const M = 60_000;

function usage(totalMs: number): Usage {
  return {
    summary: {
      totalMs,
      eventCount: 0,
      activeDays: 0,
      dailyAverageMs: 0,
      busiestDay: null,
    },
    perDay: [],
    byCategory: [],
    byMember: [],
  };
}

function taskStats(over: Partial<TaskStats> = {}): TaskStats {
  return {
    createdCount: 0,
    completedCount: 0,
    dueCount: 0,
    adherenceRate: null,
    overdueOpenCount: 0,
    completionRate: null,
    medianLeadTimeMs: null,
    ...over,
  };
}

const emptyFrag: Fragmentation = {
  blockCount: 0,
  avgBlockMs: null,
  medianBlockMs: null,
  longestBlockMs: null,
  shortBlockShare: null,
  avgGapMs: null,
};

describe("comparisonNoun", () => {
  it("names the calendar unit for calendar presets, 'period' otherwise", () => {
    expect(comparisonNoun("this-week")).toBe("week");
    expect(comparisonNoun("last-week")).toBe("week");
    expect(comparisonNoun("this-month")).toBe("month");
    expect(comparisonNoun("last-30d")).toBe("period");
    expect(comparisonNoun("last-90d")).toBe("period");
    expect(comparisonNoun("custom")).toBe("period");
  });
});

describe("deriveOverviewLede", () => {
  it("returns null with no tracked time (tab owns the empty state)", () => {
    expect(
      deriveOverviewLede({
        usage: usage(0),
        prevUsage: usage(0),
        preset: "this-week",
        topContext: null,
      }),
    ).toBeNull();
  });

  it("states the total, the change, and the top context", () => {
    const lede = deriveOverviewLede({
      usage: usage(31 * H),
      prevUsage: usage(28 * H),
      preset: "this-week",
      topContext: { name: "Work", ms: 14 * H },
    });
    expect(lede).not.toBeNull();
    expect(lede!.tone).toBe("neutral");
    expect(lede!.headline).toBe(
      "You tracked 31h, up 11% (3h) vs the previous week.",
    );
    expect(lede!.support).toBe("Most of it went to Work (45%).");
  });

  it("drops the change clause when the previous window was empty", () => {
    const lede = deriveOverviewLede({
      usage: usage(5 * H),
      prevUsage: usage(0),
      preset: "this-month",
      topContext: null,
    });
    expect(lede!.headline).toBe("You tracked 5h.");
  });

  it("says 'level' when nothing changed", () => {
    const lede = deriveOverviewLede({
      usage: usage(10 * H),
      prevUsage: usage(10 * H),
      preset: "last-30d",
      topContext: null,
    });
    expect(lede!.headline).toBe("You tracked 10h, level with the previous period.");
  });
});

describe("deriveTrendsLede", () => {
  it("coaches when there isn't enough history for a direction", () => {
    const lede = deriveTrendsLede({
      trend: { slopeMsPerBucket: null, direction: null },
      granularity: "day",
      busiest: null,
    });
    expect(lede.tone).toBe("neutral");
    expect(lede.headline).toBe("Not enough history yet to call a trend.");
  });

  it("reports an upward trend with its per-bucket rate and the busiest bucket", () => {
    const lede = deriveTrendsLede({
      trend: { slopeMsPerBucket: 18 * M, direction: "up" },
      granularity: "day",
      busiest: { full: "Wed 10 Jun", ms: 24 * H },
    });
    expect(lede.headline).toBe("Your tracked time is trending up, about +18m per day.");
    expect(lede.support).toBe("Busiest day: Wed 10 Jun (24h).");
  });

  it("reads 'holding steady' when flat", () => {
    const lede = deriveTrendsLede({
      trend: { slopeMsPerBucket: 0, direction: "flat" },
      granularity: "week",
      busiest: null,
    });
    expect(lede.headline).toBe("Your tracked time is holding steady across the period.");
  });
});

describe("derivePatternsLede", () => {
  it("returns null when there's no weekday load", () => {
    expect(
      derivePatternsLede({ topWeekday: null, bestDaypart: null, frag: emptyFrag }),
    ).toBeNull();
  });

  it("names the heaviest weekday and the best-rated daypart", () => {
    const lede = derivePatternsLede({
      topWeekday: { full: "Wednesday", avgMs: 5 * H + 20 * M },
      bestDaypart: "Morning",
      frag: emptyFrag,
    });
    expect(lede!.headline).toBe(
      "Wednesday is your heaviest weekday, averaging 5h 20m.",
    );
    expect(lede!.support).toBe("You rate your morning work the highest.");
  });

  it("falls back to the typical block when no daypart is rated", () => {
    const lede = derivePatternsLede({
      topWeekday: { full: "Monday", avgMs: 2 * H },
      bestDaypart: null,
      frag: { ...emptyFrag, medianBlockMs: 45 * M },
    });
    expect(lede!.support).toBe("Your typical unbroken block runs 45m.");
  });
});

describe("deriveTasksLede", () => {
  it("raises attention for overdue tasks", () => {
    const lede = deriveTasksLede({
      stats: taskStats({ overdueOpenCount: 3, completedCount: 5 }),
      prevStats: taskStats(),
      preset: "this-week",
    });
    expect(lede.tone).toBe("attention");
    expect(lede.headline).toBe("3 tasks are overdue and still open.");
    expect(lede.support).toBe("You finished 5 tasks in this period.");
  });

  it("compares completions to the previous unit", () => {
    const lede = deriveTasksLede({
      stats: taskStats({ completedCount: 9, adherenceRate: 0.8 }),
      prevStats: taskStats({ completedCount: 7 }),
      preset: "this-week",
    });
    expect(lede.tone).toBe("neutral");
    expect(lede.headline).toBe(
      "You finished 9 tasks in this period, 2 more than the previous week.",
    );
    expect(lede.support).toBe("80% of due tasks landed on time.");
  });

  it("omits the comparison when the previous window had no completions", () => {
    const lede = deriveTasksLede({
      stats: taskStats({ completedCount: 4 }),
      prevStats: taskStats({ completedCount: 0 }),
      preset: "last-30d",
    });
    expect(lede.headline).toBe("You finished 4 tasks in this period.");
  });
});
