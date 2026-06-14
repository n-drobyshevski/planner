import { describe, it, expect } from "vitest";
import { createTranslator } from "next-intl";
import {
  comparisonNoun,
  deriveOverviewLede,
  deriveTrendsLede,
  derivePatternsLede,
  deriveTasksLede,
} from "@/lib/insights/ledes";
import enInsights from "@/messages/en/insights.json";
import type { Usage } from "@/lib/analytics/usage";
import type { TaskStats } from "@/lib/analytics/task-stats";
import type { Fragmentation } from "@/lib/analytics/patterns";

const H = 3_600_000;
const M = 60_000;

// A real English translator over the actual `insights` catalog, so these tests
// exercise the same ICU messages the app renders (the lede builders now assemble
// their sentences from messages/en/insights.json rather than inline strings).
const t = createTranslator({
  locale: "en",
  messages: { insights: enInsights },
  namespace: "insights",
}) as (key: string, values?: Record<string, string | number>) => string;
const locale = "en";

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
        t,
        locale,
      }),
    ).toBeNull();
  });

  it("states the total, the change, and the top context", () => {
    const lede = deriveOverviewLede({
      usage: usage(31 * H),
      prevUsage: usage(28 * H),
      preset: "this-week",
      topContext: { name: "Work", ms: 14 * H },
      t,
      locale,
    });
    expect(lede).not.toBeNull();
    expect(lede!.tone).toBe("neutral");
    expect(lede!.headline).toContain("31h");
    expect(lede!.headline).toContain("11%");
    expect(lede!.headline).toContain("(3h)");
    expect(lede!.headline).toMatch(/up/);
    expect(lede!.headline).toContain("week");
    expect(lede!.support).toContain("Work");
    expect(lede!.support).toContain("45%");
  });

  it("drops the change clause when the previous window was empty", () => {
    const lede = deriveOverviewLede({
      usage: usage(5 * H),
      prevUsage: usage(0),
      preset: "this-month",
      topContext: null,
      t,
      locale,
    });
    expect(lede!.headline).toContain("5h");
    expect(lede!.headline).not.toMatch(/vs the previous/);
  });

  it("says 'level' when nothing changed", () => {
    const lede = deriveOverviewLede({
      usage: usage(10 * H),
      prevUsage: usage(10 * H),
      preset: "last-30d",
      topContext: null,
      t,
      locale,
    });
    expect(lede!.headline).toContain("10h");
    expect(lede!.headline).toMatch(/level/);
    expect(lede!.headline).toContain("period");
  });
});

describe("deriveTrendsLede", () => {
  it("coaches when there isn't enough history for a direction", () => {
    const lede = deriveTrendsLede({
      trend: { slopeMsPerBucket: null, direction: null },
      granularity: "day",
      busiest: null,
      t,
      locale,
    });
    expect(lede.tone).toBe("neutral");
    expect(lede.headline).toContain("Not enough history");
  });

  it("reports an upward trend with its per-bucket rate and the busiest bucket", () => {
    const lede = deriveTrendsLede({
      trend: { slopeMsPerBucket: 18 * M, direction: "up" },
      granularity: "day",
      busiest: { full: "Wed 10 Jun", ms: 24 * H },
      t,
      locale,
    });
    expect(lede.headline).toMatch(/trending up/);
    expect(lede.headline).toContain("18m");
    expect(lede.headline).toContain("day");
    expect(lede.support).toContain("Wed 10 Jun");
    expect(lede.support).toContain("24h");
  });

  it("reads 'holding steady' when flat", () => {
    const lede = deriveTrendsLede({
      trend: { slopeMsPerBucket: 0, direction: "flat" },
      granularity: "week",
      busiest: null,
      t,
      locale,
    });
    expect(lede.headline).toContain("holding steady");
  });
});

describe("derivePatternsLede", () => {
  it("returns null when there's no weekday load", () => {
    expect(
      derivePatternsLede({
        topWeekday: null,
        bestDaypart: null,
        frag: emptyFrag,
        t,
        locale,
      }),
    ).toBeNull();
  });

  it("names the heaviest weekday and the best-rated daypart", () => {
    const lede = derivePatternsLede({
      topWeekday: { full: "Wednesday", avgMs: 5 * H + 20 * M },
      bestDaypart: "Morning",
      frag: emptyFrag,
      t,
      locale,
    });
    expect(lede!.headline).toContain("Wednesday");
    expect(lede!.headline).toContain("5h 20m");
    expect(lede!.support).toMatch(/morning/i);
  });

  it("falls back to the typical block when no daypart is rated", () => {
    const lede = derivePatternsLede({
      topWeekday: { full: "Monday", avgMs: 2 * H },
      bestDaypart: null,
      frag: { ...emptyFrag, medianBlockMs: 45 * M },
      t,
      locale,
    });
    expect(lede!.support).toContain("45m");
  });
});

describe("deriveTasksLede", () => {
  it("raises attention for overdue tasks", () => {
    const lede = deriveTasksLede({
      stats: taskStats({ overdueOpenCount: 3, completedCount: 5 }),
      prevStats: taskStats(),
      preset: "this-week",
      t,
      locale,
    });
    expect(lede.tone).toBe("attention");
    expect(lede.headline).toContain("3 tasks");
    expect(lede.headline).toContain("overdue");
    expect(lede.support).toContain("5 tasks");
  });

  it("compares completions to the previous unit", () => {
    const lede = deriveTasksLede({
      stats: taskStats({ completedCount: 9, adherenceRate: 0.8 }),
      prevStats: taskStats({ completedCount: 7 }),
      preset: "this-week",
      t,
      locale,
    });
    expect(lede.tone).toBe("neutral");
    expect(lede.headline).toContain("9 tasks");
    expect(lede.headline).toContain("2 more");
    expect(lede.headline).toContain("week");
    expect(lede.support).toContain("80%");
  });

  it("omits the comparison when the previous window had no completions", () => {
    const lede = deriveTasksLede({
      stats: taskStats({ completedCount: 4 }),
      prevStats: taskStats({ completedCount: 0 }),
      preset: "last-30d",
      t,
      locale,
    });
    expect(lede.headline).toContain("4 tasks");
    expect(lede.headline).not.toMatch(/than the previous/);
  });
});
