/**
 * Insights fixtures, area "ledes" (owner: A3): lib/insights/ledes.ts, the
 * one-sentence answer above each tab, compared as structured lines (message
 * key + ICU arguments) instead of rendered text.
 *
 * ```ts
 * type PresetId = "this-week" | "last-week" | "this-month" | "last-7d" | "last-30d" | "last-90d" | "custom";
 * type TaskStatsJson = {
 *   createdCount: number; completedCount: number; dueCount: number; adherenceRate: number | null;
 *   overdueOpenCount: number; completionRate: number | null; medianLeadTimeMs: number | null;
 * };
 * type LedeLineJson = { key: string; args: Record<string, string | number> };   // args in TS call order
 * type LedeJson = { tone: "neutral" | "attention"; headline: LedeLineJson; support: LedeLineJson | null };
 * sections: {
 *   comparisonNoun: { name; input: { preset: PresetId }; expected: "week" | "month" | "period" }[];
 *   overview: {
 *     name;
 *     input: { totalMs: Ms; prevTotalMs: Ms; preset: PresetId; topContext: { seriesKey: string; ms: Ms } | null };
 *     expected: LedeJson | null;
 *   }[];
 *   trends: {
 *     name;
 *     input: {
 *       trend: { slopeMsPerBucket: number | null; direction: "up" | "down" | "flat" | null };
 *       granularity: "day" | "week" | "month";
 *       busiest: { start: Ms; end: Ms; ms: Ms } | null;
 *     };
 *     expected: LedeJson;
 *   }[];
 *   patterns: {
 *     name;
 *     input: {
 *       topWeekday: { weekday: number; avgMs: number } | null;   // 0 = Monday
 *       bestDaypart: "morning" | "midday" | "evening" | "night" | null;
 *       medianBlockMs: number | null;
 *     };
 *     expected: LedeJson | null;
 *   }[];
 *   tasks: { name; input: { stats: TaskStatsJson; prevStats: TaskStatsJson; preset: PresetId }; expected: LedeJson }[];
 * }
 * ```
 *
 * Recording: the real derive*Lede runs with shared.ts `recordingTranslator()`
 * and locale "en", and each line is parsed back into `{ key, args }`. So the
 * args hold what the web passes: durations already formatted by
 * `formatDuration(…, "en")`, counts and percentages as numbers, select tokens
 * as strings, and sentinels where the web passes a display label —
 * "CATEGORY:<seriesKey>", "BUCKET:<start>-<end>", "WEEKDAY:<index>",
 * "DAYPART:<id>" — which the Kotlin encoder reproduces from its LedeArgs.
 * Overview's `Usage` objects carry only `summary.totalMs`, like ledes.test.ts.
 */
import {
  comparisonNoun,
  deriveOverviewLede,
  derivePatternsLede,
  deriveTasksLede,
  deriveTrendsLede,
  type Lede,
} from "@/lib/insights/ledes";
import type { Usage } from "@/lib/analytics/usage";
import type { TaskStats } from "@/lib/analytics/task-stats";
import type { Fragmentation } from "@/lib/analytics/patterns";
import type { TrendDirection } from "@/lib/analytics/momentum";
import type { Daypart } from "@/lib/analytics/correlations";
import type { Granularity, PeriodPreset } from "@/lib/insights/period";
import { DAY, HOUR, MINUTE, recordingTranslator, type Case, type Ms } from "./shared";

export const sections = ["comparisonNoun", "overview", "trends", "patterns", "tasks"] as const;

const t = recordingTranslator();
const locale = "en";

const PRESETS: PeriodPreset[] = [
  "this-week",
  "last-week",
  "this-month",
  "last-7d",
  "last-30d",
  "last-90d",
  "custom",
];
/** One preset per comparison unit. */
const UNIT_PRESETS: PeriodPreset[] = ["this-week", "this-month", "last-30d"];
const GRANULARITIES: Granularity[] = ["day", "week", "month"];
const DAYPARTS: Daypart[] = ["morning", "midday", "evening", "night"];

interface LineJson {
  key: string;
  args: Record<string, string | number>;
}

function line(recorded: string): LineJson {
  return JSON.parse(recorded) as LineJson;
}

function ledeJson(lede: Lede | null) {
  if (lede === null) return null;
  return {
    tone: lede.tone,
    headline: line(lede.headline),
    support: lede.support === undefined ? null : line(lede.support),
  };
}

// --- overview -----------------------------------------------------------------

function usage(totalMs: number): Usage {
  return {
    summary: { totalMs, eventCount: 0, activeDays: 0, dailyAverageMs: 0, busiestDay: null },
    perDay: [],
    byCategory: [],
    byMember: [],
  };
}

function overviewCase(
  name: string,
  totalMs: Ms,
  prevTotalMs: Ms,
  preset: PeriodPreset,
  topContext: { seriesKey: string; ms: Ms } | null = null,
): Case {
  return {
    name,
    input: { totalMs, prevTotalMs, preset, topContext },
    expected: ledeJson(
      deriveOverviewLede({
        usage: usage(totalMs),
        prevUsage: usage(prevTotalMs),
        preset,
        topContext: topContext && { name: `CATEGORY:${topContext.seriesKey}`, ms: topContext.ms },
        t,
        locale,
      }),
    ),
  };
}

function overviewCases(): Case[] {
  const d = "deriveOverviewLede";
  const cases: Case[] = [
    overviewCase(`${d} / returns null with no tracked time (tab owns the empty state)`, 0, 0, "this-week"),
    overviewCase(`${d} / states the total, the change, and the top context`, 31 * HOUR, 28 * HOUR, "this-week", {
      seriesKey: "c1",
      ms: 14 * HOUR,
    }),
    overviewCase(`${d} / drops the change clause when the previous window was empty`, 5 * HOUR, 0, "this-month"),
    overviewCase(`${d} / says 'level' when nothing changed`, 10 * HOUR, 10 * HOUR, "last-30d"),
  ];
  // Every direction × unit (none: prev 0; level; up; down).
  const totals: [string, Ms, Ms][] = [
    ["none", 6 * HOUR, 0],
    ["level", 6 * HOUR, 6 * HOUR],
    ["up", 9 * HOUR + 17 * MINUTE, 6 * HOUR],
    ["down", 4 * HOUR + 3 * MINUTE, 6 * HOUR],
  ];
  for (const preset of PRESETS) {
    for (const [dir, total, prev] of totals) {
      cases.push(overviewCase(`${dir} × ${preset}`, total, prev, preset));
    }
  }
  cases.push(
    overviewCase("pct rounds .5 up (+12.5%)", 9 * HOUR, 8 * HOUR, "this-week"),
    overviewCase("pct rounds .5 up on a decrease (−12.5%)", 7 * HOUR, 8 * HOUR, "this-week"),
    overviewCase("pct just under .5 (+0.4999%)", 10_000 * MINUTE + 49_990, 10_000 * MINUTE, "last-7d"),
    overviewCase("pct over 100%", 25 * HOUR, 2 * HOUR, "last-90d"),
    overviewCase("total of 0 with a previous total", 0, 3 * HOUR, "this-week"),
    overviewCase("magnitude under a minute rounds to 0m", 2 * HOUR + 20_000, 2 * HOUR, "this-week"),
    overviewCase("seconds-level totals round to whole minutes", 90 * MINUTE + 29_999, 61 * MINUTE + 30_000, "custom"),
    overviewCase("366-day total", 366 * 9 * HOUR, 366 * 8 * HOUR, "custom", { seriesKey: "c2", ms: 366 * 3 * HOUR }),
    overviewCase("support pct rounds .5 up (12.5%)", 8 * HOUR, 8 * HOUR, "this-week", { seriesKey: "c3", ms: HOUR }),
    overviewCase("support: the whole total", 3 * HOUR, 2 * HOUR, "this-week", { seriesKey: "c4", ms: 3 * HOUR }),
    overviewCase("support: uncategorized series", 3 * HOUR, 2 * HOUR, "this-month", {
      seriesKey: "__uncategorized__",
      ms: 2 * HOUR,
    }),
    overviewCase("no support when the top context has 0 ms", 3 * HOUR, 2 * HOUR, "this-week", {
      seriesKey: "c5",
      ms: 0,
    }),
    overviewCase("support under 1%", 300 * HOUR, 200 * HOUR, "last-90d", { seriesKey: "c6", ms: MINUTE }),
  );
  return cases;
}

// --- trends -------------------------------------------------------------------

function trendsCase(
  name: string,
  trend: TrendDirection,
  granularity: Granularity,
  busiest: { start: Ms; end: Ms; ms: Ms } | null = null,
): Case {
  return {
    name,
    input: { trend, granularity, busiest },
    expected: ledeJson(
      deriveTrendsLede({
        trend,
        granularity,
        busiest: busiest && { full: `BUCKET:${busiest.start}-${busiest.end}`, ms: busiest.ms },
        t,
        locale,
      }),
    ),
  };
}

function trendsCases(): Case[] {
  const d = "deriveTrendsLede";
  const day = Date.UTC(2026, 5, 10);
  const cases: Case[] = [
    trendsCase(
      `${d} / coaches when there isn't enough history for a direction`,
      { slopeMsPerBucket: null, direction: null },
      "day",
    ),
    trendsCase(
      `${d} / reports an upward trend with its per-bucket rate and the busiest bucket`,
      { slopeMsPerBucket: 18 * MINUTE, direction: "up" },
      "day",
      { start: day, end: day + DAY, ms: 24 * HOUR },
    ),
    trendsCase(`${d} / reads 'holding steady' when flat`, { slopeMsPerBucket: 0, direction: "flat" }, "week"),
  ];
  const week = { start: Date.UTC(2026, 5, 8), end: Date.UTC(2026, 5, 15), ms: 31 * HOUR + 5 * MINUTE };
  const month = { start: Date.UTC(2026, 5, 1), end: Date.UTC(2026, 6, 1), ms: 120 * HOUR };
  const busiestOf: Record<Granularity, { start: Ms; end: Ms; ms: Ms }> = {
    day: { start: day, end: day + DAY, ms: 9 * HOUR + 45 * MINUTE },
    week,
    month,
  };
  const trends: [string, TrendDirection][] = [
    ["flat", { slopeMsPerBucket: 2 * MINUTE, direction: "flat" }],
    ["up", { slopeMsPerBucket: 75 * MINUTE, direction: "up" }],
    ["down", { slopeMsPerBucket: -40 * MINUTE, direction: "down" }],
    ["none", { slopeMsPerBucket: null, direction: null }],
  ];
  for (const g of GRANULARITIES) {
    for (const [label, trend] of trends) {
      cases.push(trendsCase(`${label} × ${g}`, trend, g, busiestOf[g]));
      cases.push(trendsCase(`${label} × ${g}, no busiest bucket`, trend, g));
    }
  }
  cases.push(
    trendsCase("negative fractional slope", { slopeMsPerBucket: -5_432_109.5, direction: "down" }, "week", week),
    trendsCase("up, |slope| under a minute", { slopeMsPerBucket: 29_999, direction: "up" }, "day"),
    trendsCase("down, |slope| under a minute", { slopeMsPerBucket: -30_000, direction: "down" }, "day"),
    trendsCase("flat with a negative slope", { slopeMsPerBucket: -1_500, direction: "flat" }, "month", month),
    trendsCase("flat with a zero slope", { slopeMsPerBucket: 0, direction: "flat" }, "day"),
    trendsCase("busiest bucket with 0 ms", { slopeMsPerBucket: 0, direction: "flat" }, "week", { ...week, ms: 0 }),
    trendsCase("busiest bucket of a DST week (Berlin fall-back)", { slopeMsPerBucket: HOUR, direction: "up" }, "week", {
      start: Date.UTC(2026, 9, 18, 22),
      end: Date.UTC(2026, 9, 25, 23),
      ms: 40 * HOUR,
    }),
  );
  return cases;
}

// --- patterns -----------------------------------------------------------------

const emptyFrag: Fragmentation = {
  blockCount: 0,
  avgBlockMs: null,
  medianBlockMs: null,
  longestBlockMs: null,
  shortBlockShare: null,
  avgGapMs: null,
};

function patternsCase(
  name: string,
  topWeekday: { weekday: number; avgMs: number } | null,
  bestDaypart: Daypart | null,
  medianBlockMs: number | null,
): Case {
  return {
    name,
    input: { topWeekday, bestDaypart, medianBlockMs },
    expected: ledeJson(
      derivePatternsLede({
        topWeekday: topWeekday && { full: `WEEKDAY:${topWeekday.weekday}`, avgMs: topWeekday.avgMs },
        bestDaypart: bestDaypart && `DAYPART:${bestDaypart}`,
        frag: { ...emptyFrag, medianBlockMs },
        t,
        locale,
      }),
    ),
  };
}

function patternsCases(): Case[] {
  const d = "derivePatternsLede";
  const cases: Case[] = [
    patternsCase(`${d} / returns null when there's no weekday load`, null, null, null),
    patternsCase(
      `${d} / names the heaviest weekday and the best-rated daypart`,
      { weekday: 2, avgMs: 5 * HOUR + 20 * MINUTE },
      "morning",
      null,
    ),
    patternsCase(
      `${d} / falls back to the typical block when no daypart is rated`,
      { weekday: 0, avgMs: 2 * HOUR },
      null,
      45 * MINUTE,
    ),
    patternsCase("null when the top weekday's average is 0", { weekday: 4, avgMs: 0 }, "evening", 30 * MINUTE),
    patternsCase("no support without a daypart or a median", { weekday: 6, avgMs: 3 * HOUR }, null, null),
    patternsCase("the daypart wins over the median", { weekday: 5, avgMs: HOUR }, "night", 50 * MINUTE),
    patternsCase("fractional average", { weekday: 3, avgMs: (17 * HOUR + 1) / 3 }, null, 37.5 * MINUTE),
    patternsCase("average under a minute", { weekday: 1, avgMs: 29_999.5 }, null, 0),
    patternsCase("even-count median (x.5 ms)", { weekday: 2, avgMs: 4 * HOUR }, null, 59 * MINUTE + 29_999.5),
  ];
  for (let weekday = 0; weekday < 7; weekday++) {
    cases.push(patternsCase(`weekday ${weekday}`, { weekday, avgMs: (weekday + 1) * 47 * MINUTE }, null, null));
  }
  for (const daypart of DAYPARTS) {
    cases.push(patternsCase(`daypart ${daypart}`, { weekday: 0, avgMs: 2 * HOUR }, daypart, 20 * MINUTE));
  }
  return cases;
}

// --- tasks --------------------------------------------------------------------

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

function tasksCase(name: string, stats: TaskStats, prevStats: TaskStats, preset: PeriodPreset): Case {
  return {
    name,
    input: { stats, prevStats, preset },
    expected: ledeJson(deriveTasksLede({ stats, prevStats, preset, t, locale })),
  };
}

function tasksCases(): Case[] {
  const d = "deriveTasksLede";
  const cases: Case[] = [
    tasksCase(
      `${d} / raises attention for overdue tasks`,
      taskStats({ overdueOpenCount: 3, completedCount: 5 }),
      taskStats(),
      "this-week",
    ),
    tasksCase(
      `${d} / compares completions to the previous unit`,
      taskStats({ completedCount: 9, adherenceRate: 0.8 }),
      taskStats({ completedCount: 7 }),
      "this-week",
    ),
    tasksCase(
      `${d} / omits the comparison when the previous window had no completions`,
      taskStats({ completedCount: 4 }),
      taskStats({ completedCount: 0 }),
      "last-30d",
    ),
  ];
  const moves: [string, number, number][] = [
    ["more", 12, 5],
    ["fewer", 3, 8],
    ["level (equal)", 6, 6],
    ["level (no previous)", 6, 0],
  ];
  for (const preset of UNIT_PRESETS) {
    for (const [label, done, prev] of moves) {
      cases.push(
        tasksCase(
          `${label} × ${preset}`,
          taskStats({ completedCount: done, createdCount: done + 2 }),
          taskStats({ completedCount: prev }),
          preset,
        ),
      );
    }
  }
  cases.push(
    tasksCase("overdue: one task, nothing done", taskStats({ overdueOpenCount: 1 }), taskStats(), "this-month"),
    tasksCase(
      "overdue wins over adherence and a comparison",
      taskStats({ overdueOpenCount: 2, completedCount: 7, adherenceRate: 0.5 }),
      taskStats({ completedCount: 3 }),
      "last-7d",
    ),
    tasksCase("zero done, zero before", taskStats(), taskStats(), "custom"),
    tasksCase("fewer down to zero", taskStats(), taskStats({ completedCount: 4 }), "last-week"),
    tasksCase(
      "adherence rounds .5 up (12.5%)",
      taskStats({ completedCount: 1, adherenceRate: 0.125 }),
      taskStats({ completedCount: 1 }),
      "this-week",
    ),
    tasksCase(
      "adherence 2/3",
      taskStats({ completedCount: 3, adherenceRate: 2 / 3 }),
      taskStats({ completedCount: 1 }),
      "last-90d",
    ),
    tasksCase(
      "adherence 0",
      taskStats({ completedCount: 2, adherenceRate: 0 }),
      taskStats({ completedCount: 5 }),
      "this-month",
    ),
    tasksCase(
      "adherence 1",
      taskStats({ completedCount: 2, adherenceRate: 1 }),
      taskStats({ completedCount: 2 }),
      "this-week",
    ),
  );
  return cases;
}

export function build(): Record<(typeof sections)[number], Case[]> {
  const nounIt = "comparisonNoun / names the calendar unit for calendar presets, 'period' otherwise";
  return {
    comparisonNoun: PRESETS.map((preset) => ({
      name: `${nounIt} (${preset})`,
      input: { preset },
      expected: comparisonNoun(preset),
    })),
    overview: overviewCases(),
    trends: trendsCases(),
    patterns: patternsCases(),
    tasks: tasksCases(),
  };
}
