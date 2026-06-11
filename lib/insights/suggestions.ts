// Pure rule engine behind the Optimize tab. Takes the insights-filtered
// occurrence sets (current + previous period, the same data every other tab
// sees) and emits a small, capped list of calm suggestions.
//
// Conventions, shared with lib/analytics/*: epoch ms, half-open [start, end)
// intervals, day labels in an explicit IANA zone (DST-correct).
//
// Inputs are PRE-FILTERED by lib/insights/filters.ts (tracked + member +
// category). They may still contain inactive (sleep) occurrences when the
// include-inactive toggle is on — every rule here works on the non-inactive
// subset so sleep blocks can never read as "overload" or "late work".
//
// Known limitation, by design: rule data is the selected period's fetch, so a
// task block scheduled after the period's end is invisible to the
// unscheduled-task rule — its copy says "in this period" and the rule is
// suppressed entirely for fully past periods.

import { format } from "date-fns";
import { tz } from "@date-fns/tz";

import { computeUsage } from "@/lib/analytics/usage";
import { fragmentation } from "@/lib/analytics/patterns";
import { categoryShares } from "@/lib/analytics/balance";
import {
  satisfactionByCategory,
  MIN_CATEGORY_RATINGS,
} from "@/lib/analytics/correlations";
import { median } from "@/lib/analytics/stats";
import { dateInputToMs, dateKeyInZone } from "@/lib/datetime/local";
import { formatDuration } from "@/lib/datetime/format";
import { hasAnyAttribute } from "@/lib/attributes/schema";
import type { Anomaly, Streak } from "@/lib/analytics/momentum";
import type { Forecast } from "@/lib/analytics/forecast";
import type { SleepDayPair } from "@/lib/analytics/sleep-cross";
import type { GoalProgress } from "@/lib/insights/goals";
import type { Occurrence, TaskRow, TimeWindow } from "@/lib/types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const OVERLOAD_FLOOR_MS = 6 * HOUR;
const OVERLOAD_SPARSE_MS = 8 * HOUR;
const OVERLOAD_ATTENTION_MS = 10 * HOUR;
const OVERLOAD_TYPICAL_FACTOR = 1.5;
const OVERLOAD_MIN_SAMPLE = 5;
const REST_GAP_MS = 8 * HOUR;
const DRIFT_MIN_TOTAL_MS = 8 * HOUR;
const DRIFT_MIN_SHARE = 0.15;
const DRIFT_MIN_CATEGORY_MS = 3 * HOUR;
const FRAG_MIN_BLOCKS = 5;
const FRAG_SHORT_SHARE_DELTA = 0.15;
const FRAG_AVG_BLOCK_RATIO = 0.75;
const DUE_HORIZON_MS = 7 * DAY;
const DUE_ATTENTION_MS = 2 * DAY;
const GOAL_OVER_ATTENTION_RATIO = 1.25;
const GOAL_KIND_CAP = 2;
const FORECAST_HEAVY_RATIO = 1.1;
const FORECAST_ATTENTION_RATIO = 1.3;
const ANOMALY_KIND_CAP = 2;
const STREAK_NOTABLE_DAYS = 5;
const SLEEP_SHORT_NIGHT_MS = 7 * HOUR;
const SLEEP_RECENT_NIGHTS = 7;
const SLEEP_SHORT_COUNT = 3;
const SATISFACTION_LOW_MEAN = 2.5;
const TOTAL_CAP = 8;

export type SuggestionKind =
  | "overloaded-day"
  | "fragmentation"
  | "late-night"
  | "category-drift"
  | "unscheduled-task"
  | "stranded-flexible"
  | "goal-over-budget"
  | "goal-under-budget"
  | "streak-broken"
  | "anomaly"
  | "forecast-overload"
  | "sleep-debt"
  | "correlation-insight";

/** "Why am I seeing this" — the exact data behind a card, for the disclosure. */
export interface SuggestionEvidence {
  /** the numbers that fired, in words ("11h on Mon vs a 4h typical day") */
  summary: string;
  /** sample size, when the rule is statistical */
  n?: number;
  /** the trigger, in words ("fires above 1.5× your typical day") */
  threshold: string;
  /** the data window the rule looked at */
  windowLabel: string;
}

/** At most ONE action per card (research: one tap, never a menu). */
export interface SuggestionAction {
  label: string;
  /** in-app deep link (a calendar day, the tasks board, an insights tab) */
  href: string;
}

export interface Suggestion {
  /** `${kind}:${discriminator}` — stable for the same data; the dismissal
   *  STORAGE key adds the period window, so dismissals reset per period. */
  id: string;
  kind: SuggestionKind;
  /** Two calm levels, rendered as icon + text label (never color alone). */
  severity: "attention" | "info";
  title: string;
  body: string;
  /** Small fact chips (tabular-nums in the UI). */
  meta?: string[];
  evidence: SuggestionEvidence;
  action?: SuggestionAction;
}

export interface SuggestionsInput {
  /** Insights-filtered occurrences of the selected period. */
  occurrences: Occurrence[];
  /** Same filter, previous comparison period. */
  prevOccurrences: Occurrence[];
  tasks: TaskRow[];
  window: TimeWindow;
  prevWindow: TimeWindow;
  /** Viewer-zone day starts (ms) per period, from ResolvedPeriod. */
  days: number[];
  prevDays: number[];
  timeZone: string;
  now: number;
  /** Display-name resolver so the engine stays free of Category plumbing. */
  categoryName: (id: string | null) => string;
  // --- Advice-v2 inputs, all optional: absent means the rule stays silent. --
  /** Period-scaled goal judgments (lib/insights/goals.ts). */
  goals?: GoalProgress[];
  /** Capacity forecast over the NEXT window; null for fully-past periods. */
  forecast?: Forecast | null;
  /** Robust day anomalies over the focused window (lib/analytics/momentum). */
  anomalies?: Anomaly[];
  /** Active-day streak computed over days up to `now` — NOT over future days,
   *  which would always read as a broken streak mid-period. */
  streak?: Streak | null;
  /** The VIEWER's sleep/day pairs; null whenever the lens isn't strictly
   *  "me" — the sleep-debt rule must never see partner-influenced data. */
  sleepPairs?: SleepDayPair[] | null;
  /** Kinds the member muted via feedback; filtered out before the cap. */
  suppressedKinds?: ReadonlySet<string>;
  /** Human label of the focused period, for evidence ("This week"). Falls
   *  back to the window's date range. */
  periodLabel?: string;
}

const KIND_PRIORITY: Record<SuggestionKind, number> = {
  "unscheduled-task": 0,
  "forecast-overload": 1,
  "overloaded-day": 2,
  "goal-over-budget": 3,
  "goal-under-budget": 4,
  "late-night": 5,
  "sleep-debt": 6,
  "stranded-flexible": 7,
  fragmentation: 8,
  anomaly: 9,
  "streak-broken": 10,
  "category-drift": 11,
  "correlation-insight": 12,
};

export function computeSuggestions(input: SuggestionsInput): Suggestion[] {
  const { window, prevWindow, days, prevDays, timeZone, now, categoryName } = input;
  const ctx = tz(timeZone);
  const dayLabel = (ms: number) => format(ms, "EEE d MMM", { in: ctx });
  const windowLabel =
    input.periodLabel ??
    `${format(window.start, "d MMM", { in: ctx })} – ${format(window.end - 1, "d MMM", { in: ctx })}`;
  const calendarDayHref = (dayMs: number) =>
    `/calendar?date=${dateKeyInZone(dayMs, timeZone)}&view=day`;

  // Sleep blocks must never read as workload (see module header).
  const active = input.occurrences.filter((o) => !o.inactive);
  const prevActive = input.prevOccurrences.filter((o) => !o.inactive);

  const curUsage = computeUsage(active, days, window, { includeInactive: true });
  const prevUsage = computeUsage(prevActive, prevDays, prevWindow, {
    includeInactive: true,
  });

  const out: Suggestion[] = [];

  // --- (a) Overloaded days -------------------------------------------------
  // "Typical" = median nonzero day across prev + current; a day is heavy when
  // it clearly exceeds it (1.5×, floored at 6h). Median rather than P90: with
  // a week or two of data the nearest-rank P90 IS the heaviest day, which
  // would shield every heavy day from ever being flagged.
  const nonzero = [...curUsage.perDay, ...prevUsage.perDay]
    .map((d) => d.ms)
    .filter((ms) => ms > 0)
    .sort((a, b) => a - b);
  const typicalMs = median(nonzero);
  const overloadThreshold =
    nonzero.length >= OVERLOAD_MIN_SAMPLE
      ? Math.max(OVERLOAD_TYPICAL_FACTOR * typicalMs, OVERLOAD_FLOOR_MS)
      : OVERLOAD_SPARSE_MS;

  const overloadedDays = curUsage.perDay
    .filter((d) => d.ms > overloadThreshold)
    .sort((a, b) => b.ms - a.ms);

  for (const d of overloadedDays.slice(0, 3)) {
    out.push({
      id: `overloaded-day:${dateKeyInZone(d.dayMs, timeZone)}`,
      kind: "overloaded-day",
      severity: d.ms >= OVERLOAD_ATTENTION_MS ? "attention" : "info",
      title: `Heavy day: ${dayLabel(d.dayMs)}`,
      body: "Noticeably more scheduled time than a typical day — worth keeping some buffer.",
      meta: [
        `${formatDuration(d.ms)} scheduled`,
        `typical day ${formatDuration(typicalMs)}`,
      ],
      evidence: {
        summary: `${formatDuration(d.ms)} scheduled on ${dayLabel(d.dayMs)} vs a ${formatDuration(typicalMs)} typical day.`,
        n: nonzero.length,
        threshold:
          nonzero.length >= OVERLOAD_MIN_SAMPLE
            ? "Fires when a day exceeds 1.5× the median active day of this and the previous period (at least 6h)."
            : "Fires above 8h when there are too few active days for a typical-day baseline.",
        windowLabel,
      },
      action: { label: "See the day", href: calendarDayHref(d.dayMs) },
    });
  }

  // --- (f) Stranded movable items on those days ----------------------------
  // Uses the PRE-CAP overloaded set so a 4th heavy day still gets its nudge.
  const lightest = curUsage.perDay.reduce(
    (min, d) => (d.ms < min.ms ? d : min),
    curUsage.perDay[0] ?? { dayMs: window.start, ms: 0 },
  );
  let stranded = 0;
  for (const d of overloadedDays) {
    if (stranded >= 2) break;
    const dayEnd = days[days.indexOf(d.dayMs) + 1] ?? window.end;
    const movable = active.filter(
      (o) =>
        o.start < dayEnd &&
        o.end > d.dayMs &&
        (o.attributes.flexibility === "movable" ||
          o.attributes.flexibility === "flexible"),
    );
    if (movable.length === 0) continue;
    stranded += 1;
    const names = movable
      .slice(0, 2)
      .map((o) => `“${o.title}”`)
      .join(" and ");
    out.push({
      id: `stranded-flexible:${dateKeyInZone(d.dayMs, timeZone)}`,
      kind: "stranded-flexible",
      severity: "info",
      title: `Movable items on ${dayLabel(d.dayMs)}`,
      body: `${names} ${movable.length === 1 ? "is" : "are"} marked movable — ${dayLabel(
        lightest.dayMs,
      )} looks lighter.`,
      evidence: {
        summary: `${movable.length} movable item${movable.length === 1 ? "" : "s"} sit${movable.length === 1 ? "s" : ""} on ${dayLabel(d.dayMs)}, a day above your overload threshold; ${dayLabel(lightest.dayMs)} has the least scheduled time.`,
        threshold:
          "Fires when items marked movable or flexible fall on a day above the heavy-day threshold.",
        windowLabel,
      },
      action: { label: "See the day", href: calendarDayHref(d.dayMs) },
    });
  }

  // --- (b) Fragmentation regression ----------------------------------------
  const curFrag = fragmentation(active, window, timeZone);
  const prevFrag = fragmentation(prevActive, prevWindow, timeZone);
  if (curFrag.blockCount >= FRAG_MIN_BLOCKS && prevFrag.blockCount >= FRAG_MIN_BLOCKS) {
    const shareJump =
      curFrag.shortBlockShare !== null &&
      prevFrag.shortBlockShare !== null &&
      curFrag.shortBlockShare - prevFrag.shortBlockShare >= FRAG_SHORT_SHARE_DELTA;
    const avgDrop =
      curFrag.avgBlockMs !== null &&
      prevFrag.avgBlockMs !== null &&
      curFrag.avgBlockMs <= FRAG_AVG_BLOCK_RATIO * prevFrag.avgBlockMs;
    if (shareJump || avgDrop) {
      out.push({
        id: "fragmentation:regression",
        kind: "fragmentation",
        severity: "info",
        title: "Days are getting choppier",
        body: "More short scattered blocks than last period — batching similar items protects focus.",
        meta:
          curFrag.avgBlockMs !== null && prevFrag.avgBlockMs !== null
            ? [
                `avg block ${formatDuration(curFrag.avgBlockMs)}`,
                `was ${formatDuration(prevFrag.avgBlockMs)}`,
              ]
            : undefined,
        evidence: {
          summary:
            curFrag.avgBlockMs !== null && prevFrag.avgBlockMs !== null
              ? `Average busy block is ${formatDuration(curFrag.avgBlockMs)}, down from ${formatDuration(prevFrag.avgBlockMs)} last period.`
              : "The share of short scattered blocks jumped vs the previous period.",
          n: curFrag.blockCount,
          threshold:
            "Fires when the short-block share jumps 15+ points, or the average block drops to ≤75% of last period's, over at least 5 blocks in each.",
          windowLabel,
        },
      });
    }
  }

  // --- (c) Late night before an early start --------------------------------
  // Per consecutive day pair: latest "late end" (≥23:00 on the evening, or
  // <04:00 after midnight) vs earliest 04:00–07:59 start the next morning;
  // flag a real elapsed gap under 8h (wall-clock illusions across DST nights
  // don't fire — the elapsed time is what was actually slept).
  const lateEndByMorning = new Map<number, number>();
  const earlyStartByMorning = new Map<number, number>();
  const dayIndexOf = (ms: number): number => {
    if (ms < window.start || ms >= window.end) return -1;
    let i = days.length - 1;
    while (i > 0 && ms < days[i]) i--;
    return i;
  };
  for (const o of active) {
    const endIdx = dayIndexOf(o.end);
    if (endIdx >= 0) {
      const endHour = Number(format(o.end, "H", { in: ctx }));
      const morning = endHour >= 23 ? endIdx + 1 : endHour < 4 ? endIdx : -1;
      if (morning >= 0 && morning < days.length)
        lateEndByMorning.set(morning, Math.max(lateEndByMorning.get(morning) ?? 0, o.end));
    }
    const startIdx = dayIndexOf(o.start);
    if (startIdx >= 0) {
      const startHour = Number(format(o.start, "H", { in: ctx }));
      if (startHour >= 4 && startHour < 8)
        earlyStartByMorning.set(
          startIdx,
          Math.min(earlyStartByMorning.get(startIdx) ?? Infinity, o.start),
        );
    }
  }
  let lateNights = 0;
  for (let m = 0; m < days.length && lateNights < 2; m++) {
    const lateEnd = lateEndByMorning.get(m);
    const earlyStart = earlyStartByMorning.get(m);
    if (lateEnd === undefined || earlyStart === undefined) continue;
    const gap = earlyStart - lateEnd;
    if (gap >= REST_GAP_MS) continue;
    lateNights += 1;
    out.push({
      id: `late-night:${dateKeyInZone(days[m], timeZone)}`,
      kind: "late-night",
      severity: "info",
      title: `Short night into ${dayLabel(days[m])}`,
      body: "A late evening ran close to an early start — under 8 hours between them.",
      meta: [`${formatDuration(Math.max(0, gap))} of rest`],
      evidence: {
        summary: `${formatDuration(Math.max(0, gap))} of real elapsed time between the late end and the ${dayLabel(days[m])} early start.`,
        threshold:
          "Fires when under 8 hours separate an evening ending at 23:00 or later (or past midnight) from a 4–8 am start the next morning.",
        windowLabel,
      },
      action: { label: "See the morning", href: calendarDayHref(days[m]) },
    });
  }

  // --- (d) Category drift vs the previous period ---------------------------
  if (
    curUsage.summary.totalMs >= DRIFT_MIN_TOTAL_MS &&
    prevUsage.summary.totalMs >= DRIFT_MIN_TOTAL_MS
  ) {
    const drifted = categoryShares(active, prevActive, window, prevWindow)
      .filter(
        (s) =>
          Math.abs(s.deltaShare) >= DRIFT_MIN_SHARE &&
          Math.max(s.ms, s.prevMs) >= DRIFT_MIN_CATEGORY_MS,
      )
      .sort((a, b) => Math.abs(b.deltaShare) - Math.abs(a.deltaShare));
    const top = drifted[0];
    if (top) {
      const name = categoryName(top.categoryId);
      const pts = Math.round(Math.abs(top.deltaShare) * 100);
      const direction = top.deltaShare > 0 ? "larger" : "smaller";
      out.push({
        id: `category-drift:${top.categoryId ?? "uncategorized"}`,
        kind: "category-drift",
        severity: "info",
        title: `${name} shifted ${pts} pts`,
        body: `${name} took a noticeably ${direction} share of your time than in the previous period.`,
        meta: [
          `now ${Math.round(top.share * 100)}%`,
          `was ${Math.round(top.prevShare * 100)}%`,
        ],
        evidence: {
          summary: `${name} holds ${Math.round(top.share * 100)}% of tracked time, vs ${Math.round(top.prevShare * 100)}% in the previous period.`,
          threshold:
            "Fires on a 15+ point share shift with at least 3h in either period and 8h tracked in both.",
          windowLabel,
        },
      });
    }
  }

  // --- (e) Unscheduled high-priority tasks due soon -------------------------
  if (window.end > now) {
    const startOfToday = dateInputToMs(dateKeyInZone(now, timeZone), timeZone);
    const candidates = input.tasks
      .filter((t) => {
        if (t.parentId !== null || t.status === "done") return false;
        if (t.priority !== 3 || t.dueDate === null) return false;
        const dueMs = dateInputToMs(t.dueDate, timeZone);
        if (dueMs < startOfToday || dueMs >= startOfToday + DUE_HORIZON_MS) return false;
        // "Scheduled" = an upcoming block in this period's fetch.
        return !input.occurrences.some((o) => o.taskId === t.id && o.end > now);
      })
      .sort(
        (a, b) =>
          (a.dueDate as string).localeCompare(b.dueDate as string) ||
          a.title.localeCompare(b.title),
      );
    for (const t of candidates.slice(0, 2)) {
      const dueMs = dateInputToMs(t.dueDate as string, timeZone);
      out.push({
        id: `unscheduled-task:${t.id}`,
        kind: "unscheduled-task",
        severity: dueMs - startOfToday <= DUE_ATTENTION_MS ? "attention" : "info",
        title: `Due soon: ${t.title}`,
        body: `High priority and due ${dayLabel(dueMs)}, with no upcoming time blocked in this period.`,
        evidence: {
          summary: `“${t.title}” is high priority, due ${dayLabel(dueMs)}, and has no upcoming block in this period's calendar.`,
          threshold:
            "Fires for open high-priority tasks due within 7 days that have no upcoming scheduled block.",
          windowLabel,
        },
        action: { label: "Open tasks", href: "/tasks" },
      });
    }
  }

  // --- (g) Goal budgets and targets (lib/insights/goals.ts judgments) -------
  const goals = input.goals ?? [];
  const blownBudgets = goals
    .filter((g) => g.goal.direction === "at-most" && g.judgment === "over")
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, GOAL_KIND_CAP);
  for (const g of blownBudgets) {
    const name = categoryName(g.goal.categoryId);
    out.push({
      id: `goal-over-budget:${g.goal.categoryId}`,
      kind: "goal-over-budget",
      severity: g.ratio >= GOAL_OVER_ATTENTION_RATIO ? "attention" : "info",
      title: `${name} is over budget`,
      body: `Time in ${name} has passed the cap you set for this period.`,
      meta: [
        `${formatDuration(g.actualMs)} tracked`,
        `cap ${formatDuration(g.targetMs)}`,
      ],
      evidence: {
        summary: `${formatDuration(g.actualMs)} tracked against a ${formatDuration(g.targetMs)} cap (the weekly budget scaled to this period).`,
        threshold: "Fires when tracked time passes an at-most goal's period-scaled cap.",
        windowLabel,
      },
      action: { label: "Review goals", href: "/insights?tab=balance" },
    });
  }
  // Behind-pace targets only fire mid-window — a finished window has no pace
  // left to catch up on, and goal bullets already tell that story.
  const laggingTargets = goals
    .filter(
      (g) =>
        g.goal.direction === "at-least" &&
        g.judgment === "behind" &&
        g.expected !== null,
    )
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, GOAL_KIND_CAP);
  for (const g of laggingTargets) {
    const name = categoryName(g.goal.categoryId);
    out.push({
      id: `goal-under-budget:${g.goal.categoryId}`,
      kind: "goal-under-budget",
      severity: "info",
      title: `${name} is behind pace`,
      body: `There's still room to reach the ${name} target — a block or two would close the gap.`,
      meta: [
        `${formatDuration(g.actualMs)} of ${formatDuration(g.targetMs)}`,
      ],
      evidence: {
        summary: `${formatDuration(g.actualMs)} tracked where the elapsed share of the period implies ${formatDuration((g.expected as number) * g.targetMs)} to stay on pace for ${formatDuration(g.targetMs)}.`,
        threshold:
          "Fires mid-window when tracked time is under the pace an at-least target implies.",
        windowLabel,
      },
      action: { label: "Open the calendar", href: "/calendar" },
    });
  }

  // --- (h) Next-window capacity forecast ------------------------------------
  const forecast = input.forecast;
  if (
    window.end > now &&
    forecast &&
    forecast.capacityRatio !== null &&
    forecast.capacityRatio >= FORECAST_HEAVY_RATIO
  ) {
    const committedMs = forecast.perDay.reduce((s, d) => s + d.committedMs, 0);
    const pct = Math.round(forecast.capacityRatio * 100);
    out.push({
      id: "forecast-overload:next-window",
      kind: "forecast-overload",
      severity:
        forecast.capacityRatio >= FORECAST_ATTENTION_RATIO ? "attention" : "info",
      title: "Next period already looks heavy",
      body: "More time is committed ahead than you typically track — worth rebalancing before it starts.",
      meta: [
        `${formatDuration(committedMs)} committed`,
        `${pct}% of typical pace`,
      ],
      evidence: {
        summary: `${formatDuration(committedMs)} already scheduled next period — ${pct}% of your typical pace (${formatDuration(forecast.typicalDayMs)}/day over ${forecast.perDay.length} days).`,
        threshold:
          "Fires when committed time for the next window exceeds 110% of the typical-day pace.",
        windowLabel,
      },
      action: forecast.busiestDay
        ? { label: "See the busiest day", href: calendarDayHref(forecast.busiestDay.dayMs) }
        : { label: "Open the calendar", href: "/calendar" },
    });
  }

  // --- (i) Out-of-pattern days (robust anomalies) ----------------------------
  // Heavy days the overload rule already flags are skipped — one day, one card.
  const overloadedDayMs = new Set(overloadedDays.map((d) => d.dayMs));
  const anomalies = (input.anomalies ?? [])
    .filter((a) => !overloadedDayMs.has(a.dayMs))
    .slice(0, ANOMALY_KIND_CAP);
  for (const a of anomalies) {
    out.push({
      id: `anomaly:${dateKeyInZone(a.dayMs, timeZone)}`,
      kind: "anomaly",
      severity: "info",
      title: `Out-of-pattern day: ${dayLabel(a.dayMs)}`,
      body:
        a.direction === "high"
          ? "Tracked time sat far above your usual day — worth a look at what piled up."
          : "Tracked time sat far below your usual day — fine if it was a rest day, worth a look if not.",
      meta: [`${formatDuration(a.ms)} tracked`],
      evidence: {
        summary: `${formatDuration(a.ms)} on ${dayLabel(a.dayMs)} — a robust z-score of ${a.z.toFixed(1)} against the period's median day.`,
        threshold:
          "Fires at |z| ≥ 3 (median/MAD) over at least 14 active days, so single odd days on short ranges never alarm.",
        windowLabel,
      },
      action: { label: "See the day", href: calendarDayHref(a.dayMs) },
    });
  }

  // --- (j) A notable streak ended -------------------------------------------
  const streak = input.streak;
  if (streak && streak.current === 0 && streak.longest >= STREAK_NOTABLE_DAYS) {
    out.push({
      id: `streak-broken:${streak.longest}`,
      kind: "streak-broken",
      severity: "info",
      title: `A ${streak.longest}-day streak ended`,
      body: "You tracked time several days in a row earlier in this period — one small block today restarts the run.",
      meta: [`longest run ${streak.longest} days`],
      evidence: {
        summary: `The longest run of consecutive active days this period reached ${streak.longest}; the most recent day has nothing tracked.`,
        threshold: "Fires when a streak of 5+ active days ends within the period.",
        windowLabel,
      },
    });
  }

  // --- (k) Sleep running short (viewer-only) ---------------------------------
  // `sleepPairs` is null unless the lens is strictly "me" — this rule never
  // sees (or hints at) the partner's sleep.
  if (input.sleepPairs && input.sleepPairs.length > 0) {
    const recent = input.sleepPairs
      .filter((p) => p.durationMs !== null)
      .slice(-SLEEP_RECENT_NIGHTS);
    const short = recent.filter(
      (p) => (p.durationMs as number) < SLEEP_SHORT_NIGHT_MS,
    );
    if (short.length >= SLEEP_SHORT_COUNT) {
      const avgMs =
        recent.reduce((s, p) => s + (p.durationMs as number), 0) / recent.length;
      out.push({
        id: "sleep-debt:recent",
        kind: "sleep-debt",
        severity: "info",
        title: "Sleep is running short",
        body: "Several recent nights came in under 7 hours — an earlier evening or two would pay it back.",
        meta: [`avg ${formatDuration(Math.round(avgMs))}`, `${short.length} short nights`],
        evidence: {
          summary: `${short.length} of your last ${recent.length} logged nights were under 7h (average ${formatDuration(Math.round(avgMs))}).`,
          n: recent.length,
          threshold: "Fires when 3 of the last 7 logged nights are under 7 hours.",
          windowLabel,
        },
        action: { label: "Open the Sleep tab", href: "/insights?tab=sleep" },
      });
    }
  }

  // --- (l) A context that keeps rating low ----------------------------------
  const rated = satisfactionByCategory(active, window);
  const lowest = rated[rated.length - 1];
  if (lowest && lowest.agg.mean <= SATISFACTION_LOW_MEAN) {
    const name = categoryName(lowest.categoryId);
    out.push({
      id: `correlation-insight:satisfaction:${lowest.categoryId ?? "uncategorized"}`,
      kind: "correlation-insight",
      severity: "info",
      title: `${name} keeps rating low`,
      body: `Time in ${name} averaged ${lowest.agg.mean.toFixed(1)} of 5 satisfaction — worth a look at what makes it drag.`,
      meta: [`${lowest.agg.mean.toFixed(1)}/5`, `n ${lowest.agg.n}`],
      evidence: {
        summary: `${lowest.agg.n} rated items in ${name} average ${lowest.agg.mean.toFixed(1)} of 5, duration-weighted. A pattern, not a cause — only you know why.`,
        n: lowest.agg.n,
        threshold: `Fires when a context's duration-weighted satisfaction averages ≤2.5 of 5 over at least ${MIN_CATEGORY_RATINGS} rated items.`,
        windowLabel,
      },
    });
  }

  // --- Suppression, order, total cap -----------------------------------------
  const suppressed = input.suppressedKinds;
  const visible = suppressed ? out.filter((s) => !suppressed.has(s.kind)) : out;
  visible.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "attention" ? -1 : 1;
    if (KIND_PRIORITY[a.kind] !== KIND_PRIORITY[b.kind])
      return KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
    return a.id.localeCompare(b.id);
  });
  return visible.slice(0, TOTAL_CAP);
}

/**
 * Share of (non-inactive) occurrences carrying any known optimization
 * attribute — the Optimize tab's coverage nudge. `share` is null when there is
 * nothing to count.
 */
export function attributeCoverage(occurrences: Occurrence[]): {
  tracked: number;
  withAttributes: number;
  share: number | null;
} {
  let tracked = 0;
  let withAttributes = 0;
  for (const o of occurrences) {
    if (o.inactive) continue;
    tracked += 1;
    if (hasAnyAttribute(o.attributes)) withAttributes += 1;
  }
  return { tracked, withAttributes, share: tracked > 0 ? withAttributes / tracked : null };
}
