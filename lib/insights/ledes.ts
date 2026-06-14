// Plain-language "lede" derivations for the Insights tabs. Each tab opens with
// one calm, direct sentence — the answer — built from the analytics it already
// computes. Pure + side-effect-free; no React, no fetching, so the phrasing is
// unit-testable on its own.
//
// Phrasing reuses delta() semantics, so a lede never contradicts the DeltaBadge
// beside it: direction is carried by words, magnitude by formatDuration/count,
// never by color. Tone is deliberately two-valued — "neutral" by default,
// "attention" only for the genuinely actionable signals (overdue tasks, sleep
// debt). There is no "good" tone: positive movement is stated plainly, never
// congratulated (no gamification).
//
// Localization: each derive*() takes the "insights" namespace translator `t`
// and the app `locale`. The English/Russian sentences live in
// messages/{en,ru}/insights.json under the "lede" sub-object; direction (up /
// down / level), comparison unit (week / month / period) and counts are folded
// into ICU select/plural there, so the math here only chooses keys and values.

import { delta, type Delta } from "@/lib/analytics/trends";
import type { Usage } from "@/lib/analytics/usage";
import type { TaskStats } from "@/lib/analytics/task-stats";
import type { Fragmentation } from "@/lib/analytics/patterns";
import type { TrendDirection } from "@/lib/analytics/momentum";
import type { Granularity, PeriodPreset } from "@/lib/insights/period";
import { formatDuration } from "@/lib/datetime/format";

/** The "insights"-namespace translator from `useTranslations("insights")`. */
type Translator = (key: string, values?: Record<string, string | number>) => string;

export type LedeTone = "neutral" | "attention";

export interface Lede {
  /** The answer, one plain sentence (aim ≤ ~90 chars). */
  headline: string;
  tone: LedeTone;
  /** Optional second clause: the next-most-useful fact, shown muted. */
  support?: string;
}

/**
 * Comparison unit for the "vs the previous ___" clause, matching
 * resolvePeriod's previous-window semantics: calendar presets compare to the
 * previous calendar unit; rolling and custom ranges to an equal-length window.
 * The returned token feeds an ICU `unit` select (week / month / period).
 */
export function comparisonNoun(preset: PeriodPreset): "week" | "month" | "period" {
  if (preset === "this-week" || preset === "last-week") return "week";
  if (preset === "this-month") return "month";
  return "period";
}

const pct = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

/**
 * ICU `direction` token from a delta, matching the previous English
 * "level / up / down" wording (and "" when there is nothing to compare against —
 * the previous window was empty, so the bare number speaks for itself).
 * Returns null when the change clause should be omitted entirely.
 */
function changeDirection(d: Delta): "level" | "up" | "down" | null {
  if (d.deltaPct === null) return null; // previous window was empty
  if (d.deltaPct === 0) return "level";
  return d.deltaPct > 0 ? "up" : "down";
}

// --- Overview ---------------------------------------------------------------

export function deriveOverviewLede(args: {
  usage: Usage;
  prevUsage: Usage;
  preset: PeriodPreset;
  /** the top context by tracked ms, name already resolved (seriesMeta) */
  topContext: { name: string; ms: number } | null;
  t: Translator;
  locale: string;
}): Lede | null {
  const total = args.usage.summary.totalMs;
  if (total === 0) return null; // the tab renders its own empty state
  const d = delta(total, args.prevUsage.summary.totalMs);
  const dir = changeDirection(d);
  const headline = args.t("lede.overviewHeadline", {
    total: formatDuration(total, args.locale),
    // "none" carries the no-comparison case (no previous window).
    direction: dir ?? "none",
    unit: comparisonNoun(args.preset),
    pct: dir === "up" || dir === "down" ? Math.round(Math.abs(d.deltaPct!) * 100) : 0,
    magnitude: formatDuration(Math.abs(d.delta), args.locale),
  });
  const support =
    args.topContext && args.topContext.ms > 0
      ? args.t("lede.overviewSupport", {
          name: args.topContext.name,
          pct: pct(args.topContext.ms, total),
        })
      : undefined;
  return { headline, tone: "neutral", support };
}

// --- Trends -----------------------------------------------------------------

export function deriveTrendsLede(args: {
  trend: TrendDirection;
  granularity: Granularity;
  busiest: { full: string; ms: number } | null;
  t: Translator;
  locale: string;
}): Lede {
  if (args.trend.direction === null) {
    return {
      headline: args.t("lede.trendsNoneHeadline"),
      tone: "neutral",
      support: args.t("lede.trendsNoneSupport"),
    };
  }
  const g = args.granularity;
  const headline = args.t("lede.trendsHeadline", {
    direction: args.trend.direction, // "up" | "down" | "flat"
    granularity: g,
    // Whether to append the "about ±Xh per <unit>" rate clause.
    hasRate:
      args.trend.direction !== "flat" && args.trend.slopeMsPerBucket !== null
        ? "yes"
        : "no",
    sign: args.trend.slopeMsPerBucket !== null && args.trend.slopeMsPerBucket > 0 ? "+" : "−",
    rate:
      args.trend.slopeMsPerBucket !== null
        ? formatDuration(Math.abs(args.trend.slopeMsPerBucket), args.locale)
        : "",
  });
  const support = args.busiest
    ? args.t("lede.trendsSupport", {
        granularity: g,
        busiest: args.busiest.full,
        ms: formatDuration(args.busiest.ms, args.locale),
      })
    : undefined;
  return { headline, tone: "neutral", support };
}

// --- Patterns ---------------------------------------------------------------

export function derivePatternsLede(args: {
  topWeekday: { full: string; avgMs: number } | null;
  /** best-rated daypart label (e.g. "Morning"), or null below the sample gate */
  bestDaypart: string | null;
  frag: Fragmentation;
  t: Translator;
  locale: string;
}): Lede | null {
  if (!args.topWeekday || args.topWeekday.avgMs <= 0) return null;
  const headline = args.t("lede.patternsHeadline", {
    weekday: args.topWeekday.full,
    ms: formatDuration(args.topWeekday.avgMs, args.locale),
  });
  let support: string | undefined;
  if (args.bestDaypart) {
    support = args.t("lede.patternsSupportDaypart", { daypart: args.bestDaypart });
  } else if (args.frag.medianBlockMs !== null) {
    support = args.t("lede.patternsSupportBlock", {
      ms: formatDuration(args.frag.medianBlockMs, args.locale),
    });
  }
  return { headline, tone: "neutral", support };
}

// --- Tasks ------------------------------------------------------------------

export function deriveTasksLede(args: {
  stats: TaskStats;
  prevStats: TaskStats;
  preset: PeriodPreset;
  t: Translator;
  locale: string;
}): Lede {
  const unit = comparisonNoun(args.preset);
  const done = args.stats.completedCount;

  if (args.stats.overdueOpenCount > 0) {
    const n = args.stats.overdueOpenCount;
    return {
      headline: args.t("lede.tasksOverdueHeadline", { count: n }),
      tone: "attention",
      support: args.t("lede.tasksDoneSupport", { count: done }),
    };
  }

  const d = delta(done, args.prevStats.completedCount);
  const compare = d.deltaPct === null || d.delta === 0;
  const headline = args.t("lede.tasksDoneHeadline", {
    count: done,
    // "level" suppresses the comparison clause (no previous window, or no move).
    direction: compare ? "level" : d.delta > 0 ? "more" : "fewer",
    diff: compare ? 0 : Math.abs(d.delta),
    unit,
  });
  const support =
    args.stats.adherenceRate !== null
      ? args.t("lede.tasksAdherenceSupport", {
          pct: Math.round(args.stats.adherenceRate * 100),
        })
      : undefined;
  return { headline, tone: "neutral", support };
}
