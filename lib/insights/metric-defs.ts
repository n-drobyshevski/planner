// Central copy for the insights metric explainers (the HoverCard that opens
// from the small info affordance on a MetricCard / InsightCard header). Kept
// here, away from JSX, so the wording for "what is this and how is it worked
// out" lives in one place and reads consistently across tabs. Pure data.

export interface MetricDef {
  /** one sentence: what the number means */
  definition: string;
  /** one sentence: how it's derived, plainly */
  howComputed: string;
  /** optional caveat — sample-size gate, what's excluded, etc. */
  note?: string;
}

export type MetricKey =
  // Overview / shared
  | "total"
  | "daily-avg"
  | "events"
  | "avg-session"
  | "busiest-day"
  | "active-days"
  // Tasks
  | "tasks-done"
  | "on-time"
  | "overdue"
  | "done-of-created"
  | "lead-time"
  // Trends momentum
  | "current-streak"
  | "longest-streak"
  | "consistency"
  | "trend-rate"
  // Patterns
  | "deep-work"
  | "best-time"
  | "toughest-time"
  | "energy-level"
  | "busy-blocks"
  | "typical-block"
  | "longest-block"
  | "short-blocks"
  | "typical-gap"
  // Optimize outlook
  | "committed"
  | "of-typical-pace"
  | "outlook-busiest"
  // Sleep
  | "avg-per-night"
  | "avg-bedtime"
  | "bedtime-spread"
  | "debt-vs-target"
  | "sleep-correlation";

export const METRIC_DEFS: Record<MetricKey, MetricDef> = {
  total: {
    definition: "All tracked time in the selected period.",
    howComputed:
      "Sums the duration of every timed event, clipped to the period. All-day and grayed-out (inactive) blocks are excluded.",
  },
  "daily-avg": {
    definition: "Tracked time per day across the period.",
    howComputed: "Total tracked time divided by the number of days in the range — including days with nothing tracked.",
  },
  events: {
    definition: "How many timed events you tracked this period.",
    howComputed: "Counts tracked events that overlap the period (all-day and inactive blocks excluded).",
  },
  "avg-session": {
    definition: "Typical length of a tracked event.",
    howComputed: "Total tracked time divided by the number of tracked events.",
  },
  "busiest-day": {
    definition: "The single day with the most tracked time.",
    howComputed: "The day whose tracked total is highest across the period.",
  },
  "active-days": {
    definition: "Days with any tracked time, out of the whole range.",
    howComputed: "Counts days holding at least one tracked event, shown against the period's day count.",
  },
  "tasks-done": {
    definition: "Top-level tasks completed in this period.",
    howComputed: "Counts tasks marked done with a completion date inside the period. Subtasks count toward their parent.",
  },
  "on-time": {
    definition: "Share of due tasks finished on or before their due day.",
    howComputed: "Of tasks due this period, the fraction completed by their due date.",
    note: "Shown only once something was due in the period.",
  },
  overdue: {
    definition: "Open tasks now past their due day.",
    howComputed: "Counts incomplete top-level tasks whose due day is before today.",
  },
  "done-of-created": {
    definition: "Of the tasks created this period, how many are already done.",
    howComputed: "Completed ÷ created, both scoped to tasks created within the period.",
  },
  "lead-time": {
    definition: "Typical time from creating a task to finishing it.",
    howComputed: "The median of (completed − created) over tasks completed this period.",
  },
  "current-streak": {
    definition: "Consecutive active days ending at the period's last day.",
    howComputed: "Counts back from the final day while each day has tracked time.",
  },
  "longest-streak": {
    definition: "Longest run of consecutive active days in the period.",
    howComputed: "The longest unbroken stretch of days with tracked time.",
  },
  consistency: {
    definition: "How steady your daily load is.",
    howComputed: "Share of active days whose tracked time lands within ±50% of your median active day.",
    note: "Needs at least 7 active days.",
  },
  "trend-rate": {
    definition: "The steady drift in daily tracked time across the period.",
    howComputed: "A Theil–Sen slope over the day series — robust to one-off spikes — reported per day.",
    note: "Needs at least 4 buckets.",
  },
  "deep-work": {
    definition: "Share of focus-rated time spent in deep (vs shallow) work.",
    howComputed: "Deep-rated minutes ÷ all focus-rated minutes. Unrated time is left out.",
  },
  "best-time": {
    definition: "The part of day your events score best for satisfaction.",
    howComputed: "Duration-weighted mean satisfaction per daypart; the highest-scoring one wins.",
    note: "Each daypart needs at least 5 rated items.",
  },
  "toughest-time": {
    definition: "The part of day your events score lowest for satisfaction.",
    howComputed: "Same as best time of day, taking the lowest-scoring daypart.",
    note: "Each daypart needs at least 5 rated items.",
  },
  "energy-level": {
    definition: "Your typical energy across rated time, on a 1–3 scale.",
    howComputed: "Duration-weighted mean of the energy you set on events.",
  },
  "busy-blocks": {
    definition: "Distinct stretches of activity in the period.",
    howComputed: "Back-to-back events merge into one block; this counts the blocks.",
  },
  "typical-block": {
    definition: "How long a busy block usually runs.",
    howComputed: "The median length of the merged blocks.",
  },
  "longest-block": {
    definition: "Your longest uninterrupted stretch.",
    howComputed: "The longest merged block in the period.",
  },
  "short-blocks": {
    definition: "Share of blocks under 30 minutes — a fragmentation signal.",
    howComputed: "Blocks shorter than 30 minutes ÷ all blocks.",
  },
  "typical-gap": {
    definition: "Usual break between blocks on the same day.",
    howComputed: "The average same-day gap between consecutive blocks.",
  },
  committed: {
    definition: "Time already scheduled in the upcoming window.",
    howComputed: "Sums committed time from events already on the calendar (recurring series expanded forward).",
  },
  "of-typical-pace": {
    definition: "How the upcoming load compares with a normal day.",
    howComputed: "Committed daily pace ÷ the typical day of the trailing two windows.",
    note: "Over 110% is flagged as a heavy outlook.",
  },
  "outlook-busiest": {
    definition: "The heaviest day already scheduled ahead.",
    howComputed: "The upcoming day with the most committed time.",
  },
  "avg-per-night": {
    definition: "Average time in bed per night this period.",
    howComputed: "Mean of logged bedtimes→wake (preferred) or the calendar-derived night length.",
  },
  "avg-bedtime": {
    definition: "Your typical bedtime.",
    howComputed: "Mean of logged or derived bedtimes, measured from the previous local noon to avoid midnight wrap.",
  },
  "bedtime-spread": {
    definition: "How regular your bedtime is — lower is steadier.",
    howComputed: "The standard deviation of your bedtimes across the period.",
  },
  "debt-vs-target": {
    definition: "Shortfall against your in-bed target, summed over the period.",
    howComputed: "Adds up, per night, how far below your target time-in-bed you fell.",
    note: "Target comes from your sleep settings (cycles + onset latency).",
  },
  "sleep-correlation": {
    definition: "How strongly a night relates to the day you woke into.",
    howComputed: "Spearman rank correlation between the sleep measure and the next-day measure, over paired nights.",
    note: "Shown once enough complete pairs exist; |ρ| near 0 means no clear link.",
  },
};
