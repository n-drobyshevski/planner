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

import { delta, type Delta } from "@/lib/analytics/trends";
import type { Usage } from "@/lib/analytics/usage";
import type { TaskStats } from "@/lib/analytics/task-stats";
import type { Fragmentation } from "@/lib/analytics/patterns";
import type { TrendDirection } from "@/lib/analytics/momentum";
import type { Granularity, PeriodPreset } from "@/lib/insights/period";
import { formatDuration } from "@/lib/datetime/format";

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
 */
export function comparisonNoun(preset: PeriodPreset): string {
  if (preset === "this-week" || preset === "last-week") return "week";
  if (preset === "this-month") return "month";
  return "period";
}

const pct = (part: number, whole: number): string =>
  `${whole > 0 ? Math.round((part / whole) * 100) : 0}%`;

/**
 * Plain change clause from a delta, e.g. " — up 12% (3h) vs the previous week".
 * `magnitude` formats the absolute delta for the metric (a duration, a count).
 * Returns "" when there is nothing useful to compare — no movement, or no
 * previous window to compare against (the bare number speaks for itself).
 */
function changeClause(
  d: Delta,
  unit: string,
  magnitude: (absDelta: number) => string,
): string {
  if (d.deltaPct === null) return ""; // previous window was empty
  if (d.deltaPct === 0) return ` — level with the previous ${unit}`;
  const dir = d.deltaPct > 0 ? "up" : "down";
  return ` — ${dir} ${Math.round(Math.abs(d.deltaPct) * 100)}% (${magnitude(
    Math.abs(d.delta),
  )}) vs the previous ${unit}`;
}

// --- Overview ---------------------------------------------------------------

export function deriveOverviewLede(args: {
  usage: Usage;
  prevUsage: Usage;
  preset: PeriodPreset;
  /** the top context by tracked ms, name already resolved (seriesMeta) */
  topContext: { name: string; ms: number } | null;
}): Lede | null {
  const total = args.usage.summary.totalMs;
  if (total === 0) return null; // the tab renders its own empty state
  const unit = comparisonNoun(args.preset);
  const d = delta(total, args.prevUsage.summary.totalMs);
  const headline = `You tracked ${formatDuration(total)}${changeClause(d, unit, formatDuration)}.`;
  const support =
    args.topContext && args.topContext.ms > 0
      ? `Most of it went to ${args.topContext.name} (${pct(args.topContext.ms, total)}).`
      : undefined;
  return { headline, tone: "neutral", support };
}

// --- Trends -----------------------------------------------------------------

export function deriveTrendsLede(args: {
  trend: TrendDirection;
  granularity: Granularity;
  busiest: { full: string; ms: number } | null;
}): Lede {
  if (args.trend.direction === null) {
    return {
      headline: "Not enough history yet to call a trend.",
      tone: "neutral",
      support: "Keep tracking and a direction will show up here.",
    };
  }
  const g = args.granularity;
  let headline: string;
  if (args.trend.direction === "flat") {
    headline = "Your tracked time is holding steady across the period.";
  } else {
    const rate =
      args.trend.slopeMsPerBucket !== null
        ? ` — about ${args.trend.slopeMsPerBucket > 0 ? "+" : "−"}${formatDuration(
            Math.abs(args.trend.slopeMsPerBucket),
          )} per ${g}`
        : "";
    headline = `Your tracked time is trending ${args.trend.direction}${rate}.`;
  }
  const support = args.busiest
    ? `Busiest ${g}: ${args.busiest.full} (${formatDuration(args.busiest.ms)}).`
    : undefined;
  return { headline, tone: "neutral", support };
}

// --- Patterns ---------------------------------------------------------------

export function derivePatternsLede(args: {
  topWeekday: { full: string; avgMs: number } | null;
  /** best-rated daypart label (e.g. "Morning"), or null below the sample gate */
  bestDaypart: string | null;
  frag: Fragmentation;
}): Lede | null {
  if (!args.topWeekday || args.topWeekday.avgMs <= 0) return null;
  const headline = `${args.topWeekday.full} is your heaviest weekday, averaging ${formatDuration(
    args.topWeekday.avgMs,
  )}.`;
  let support: string | undefined;
  if (args.bestDaypart) {
    support = `You rate your ${args.bestDaypart.toLowerCase()} work the highest.`;
  } else if (args.frag.medianBlockMs !== null) {
    support = `Your typical unbroken block runs ${formatDuration(args.frag.medianBlockMs)}.`;
  }
  return { headline, tone: "neutral", support };
}

// --- Tasks ------------------------------------------------------------------

export function deriveTasksLede(args: {
  stats: TaskStats;
  prevStats: TaskStats;
  preset: PeriodPreset;
}): Lede {
  const unit = comparisonNoun(args.preset);
  const done = args.stats.completedCount;
  const tasksWord = (n: number) => (n === 1 ? "task" : "tasks");

  if (args.stats.overdueOpenCount > 0) {
    const n = args.stats.overdueOpenCount;
    return {
      headline: `${n} ${n === 1 ? "task is" : "tasks are"} overdue and still open.`,
      tone: "attention",
      support: `You finished ${done} ${tasksWord(done)} in this period.`,
    };
  }

  const d = delta(done, args.prevStats.completedCount);
  let headline: string;
  if (d.deltaPct === null || d.delta === 0) {
    headline = `You finished ${done} ${tasksWord(done)} in this period.`;
  } else {
    const diff = Math.abs(d.delta);
    headline = `You finished ${done} ${tasksWord(done)} in this period — ${diff} ${
      d.delta > 0 ? "more" : "fewer"
    } than the previous ${unit}.`;
  }
  const support =
    args.stats.adherenceRate !== null
      ? `${Math.round(args.stats.adherenceRate * 100)}% of due tasks landed on time.`
      : undefined;
  return { headline, tone: "neutral", support };
}
