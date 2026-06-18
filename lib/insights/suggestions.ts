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
import { tz, TZDate } from "@date-fns/tz";

import { dateFnsLocale } from "@/lib/datetime/date-locale";
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

/** The "insights"-namespace translator from `useTranslations("insights")`. */
type Translator = (key: string, values?: Record<string, string | number>) => string;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const OVERLOAD_FLOOR_MS = 6 * HOUR;
const OVERLOAD_SPARSE_MS = 8 * HOUR;
const OVERLOAD_ATTENTION_MS = 10 * HOUR;
const OVERLOAD_TYPICAL_FACTOR = 1.5;
const OVERLOAD_MIN_SAMPLE = 5;
const REST_GAP_MS = 8 * HOUR;
// Rest-window rule: on a heavy day, the smallest open daytime gap worth naming,
// and how many heavy days to surface (mirrors the stranded-flexible cap).
const REST_WINDOW_MIN_GAP_MS = 60 * 60_000;
const REST_WINDOW_MAX = 2;
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
const SATISFACTION_LOW_MEAN = 2.0;
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
  | "rest-window"
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
  /** Viewer-zone day-start (ms) a day-anchored card refers to, when it has a
   *  single one. Cards about a day before "today" sort below today/future ones;
   *  window/category/goal cards leave it undefined and rank with the present. */
  dayMs?: number;
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
  /** "insights"-namespace translator; every user-visible string is built from
   *  "suggestions.<kind>.<field>" keys through it. */
  t: Translator;
  /** App locale ("en" | "ru") — localizes date-fns day labels and durations. */
  locale: string;
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
  /** The viewer's waking-day bounds, derived from MemberSleepPrefs: the night
   *  window is [startHour evening → endHour wake-day], so waking hours are
   *  [endHour, startHour). Absent → the rest-window rule stays silent. */
  nightWindow?: { startHour: number; endHour: number } | null;
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
  "rest-window": 7,
  "stranded-flexible": 8,
  fragmentation: 9,
  anomaly: 10,
  "streak-broken": 11,
  "category-drift": 12,
  "correlation-insight": 13,
};

export function computeSuggestions(input: SuggestionsInput): Suggestion[] {
  const { t, locale, window, prevWindow, days, prevDays, timeZone, now, categoryName } =
    input;
  const ctx = tz(timeZone);
  const dfLocale = dateFnsLocale(locale);
  const dayLabel = (ms: number) =>
    format(ms, "EEE d MMM", { in: ctx, locale: dfLocale });
  const dur = (ms: number) => formatDuration(ms, locale);
  const windowLabel =
    input.periodLabel ??
    `${format(window.start, "d MMM", { in: ctx, locale: dfLocale })} – ${format(window.end - 1, "d MMM", { in: ctx, locale: dfLocale })}`;
  const calendarDayHref = (dayMs: number) =>
    `/calendar?date=${dateKeyInZone(dayMs, timeZone)}&view=day`;
  // Start of the viewer's "today" — the cutoff between days you can still act on
  // (reschedule onto) and days that have already happened. Reused by the
  // forward-only reschedule rule (f), the due-soon rule (e), and the final sort.
  const startOfToday = dateInputToMs(dateKeyInZone(now, timeZone), timeZone);

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
      dayMs: d.dayMs,
      severity: d.ms >= OVERLOAD_ATTENTION_MS ? "attention" : "info",
      title: t("suggestions.overloadedDay.title", { day: dayLabel(d.dayMs) }),
      body: t("suggestions.overloadedDay.body"),
      meta: [
        t("suggestions.overloadedDay.metaScheduled", { duration: dur(d.ms) }),
        t("suggestions.overloadedDay.metaTypical", { duration: dur(typicalMs) }),
      ],
      evidence: {
        summary: t("suggestions.overloadedDay.evidenceSummary", {
          duration: dur(d.ms),
          day: dayLabel(d.dayMs),
          typical: dur(typicalMs),
        }),
        n: nonzero.length,
        threshold:
          nonzero.length >= OVERLOAD_MIN_SAMPLE
            ? t("suggestions.overloadedDay.evidenceThreshold")
            : t("suggestions.overloadedDay.evidenceThresholdSparse"),
        windowLabel,
      },
      action: {
        label: t("suggestions.actionSeeDay"),
        href: calendarDayHref(d.dayMs),
      },
    });
  }

  // --- (a2) Rest windows on heavy days -------------------------------------
  // On a genuinely heavy day, where does rest actually fit? Look only at WAKING
  // hours — the day minus the configured night window [endHour, startHour) — and
  // find the largest stretch with nothing tracked. Reuses the heavy-day set, so
  // it never fires on an ordinary day. Reflective (info), factual, non-color.
  if (input.nightWindow) {
    const { startHour, endHour } = input.nightWindow;
    let restCards = 0;
    for (const d of overloadedDays) {
      if (restCards >= REST_WINDOW_MAX) break;
      if (endHour >= startHour) break; // misconfigured window → no waking span
      const [y, mo, dd] = dateKeyInZone(d.dayMs, timeZone).split("-").map(Number);
      const wakeStart = new TZDate(y, mo - 1, dd, endHour, 0, 0, timeZone).getTime();
      const wakeEnd = new TZDate(y, mo - 1, dd, startHour, 0, 0, timeZone).getTime();
      // Tracked blocks clipped to the waking window, scanned left to right; the
      // running cursor absorbs overlaps so no pre-merge is needed.
      const blocks = active
        .filter((o) => o.start < wakeEnd && o.end > wakeStart)
        .map((o) => ({
          start: Math.max(o.start, wakeStart),
          end: Math.min(o.end, wakeEnd),
        }))
        .sort((p, q) => p.start - q.start);
      let cursor = wakeStart;
      let bestGap = 0;
      let bestStart = wakeStart;
      for (const b of blocks) {
        if (b.start - cursor > bestGap) {
          bestGap = b.start - cursor;
          bestStart = cursor;
        }
        cursor = Math.max(cursor, b.end);
      }
      if (wakeEnd - cursor > bestGap) {
        bestGap = wakeEnd - cursor;
        bestStart = cursor;
      }
      if (bestGap < REST_WINDOW_MIN_GAP_MS) continue;
      restCards += 1;
      const gapTime = format(bestStart, "HH:mm", { in: ctx });
      out.push({
        id: `rest-window:${dateKeyInZone(d.dayMs, timeZone)}`,
        kind: "rest-window",
        dayMs: d.dayMs,
        severity: "info",
        title: t("suggestions.restWindow.title", { day: dayLabel(d.dayMs) }),
        body: t("suggestions.restWindow.body"),
        meta: [
          t("suggestions.restWindow.metaGap", {
            duration: dur(bestGap),
            time: gapTime,
          }),
        ],
        evidence: {
          summary: t("suggestions.restWindow.evidenceSummary", {
            tracked: dur(d.ms),
            day: dayLabel(d.dayMs),
            gap: dur(bestGap),
            time: gapTime,
          }),
          threshold: t("suggestions.restWindow.evidenceThreshold"),
          windowLabel,
        },
        action: {
          label: t("suggestions.actionSeeDay"),
          href: calendarDayHref(d.dayMs),
        },
      });
    }
  }

  // --- (f) Stranded movable items on those days ----------------------------
  // Uses the PRE-CAP overloaded set so a 4th heavy day still gets its nudge.
  // This is an actionable "move it to a freer day" nudge, so it only ever points
  // at today or a future day — you cannot reschedule a task onto a day that has
  // already happened. The lightest target is chosen among today-or-future days,
  // and only overloaded days you can still act on get a card.
  const futureDays = curUsage.perDay.filter((d) => d.dayMs >= startOfToday);
  const lightest = futureDays.length
    ? futureDays.reduce((min, d) => (d.ms < min.ms ? d : min), futureDays[0])
    : null;
  let stranded = 0;
  for (const d of overloadedDays) {
    if (!lightest) break; // no today-or-future day to move onto
    if (stranded >= 2) break;
    if (d.dayMs < startOfToday) continue; // past day — nothing left to reschedule
    if (lightest.dayMs === d.dayMs) continue; // no freer day to move onto
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
      .map((o) => t("suggestions.strandedFlexible.quotedName", { name: o.title }))
      .join(t("suggestions.strandedFlexible.nameJoin"));
    out.push({
      id: `stranded-flexible:${dateKeyInZone(d.dayMs, timeZone)}`,
      kind: "stranded-flexible",
      dayMs: d.dayMs,
      severity: "info",
      title: t("suggestions.strandedFlexible.title", { day: dayLabel(d.dayMs) }),
      body: t("suggestions.strandedFlexible.body", {
        names,
        count: movable.length,
        lighterDay: dayLabel(lightest.dayMs),
      }),
      evidence: {
        summary: t("suggestions.strandedFlexible.evidenceSummary", {
          count: movable.length,
          day: dayLabel(d.dayMs),
          lighterDay: dayLabel(lightest.dayMs),
        }),
        threshold: t("suggestions.strandedFlexible.evidenceThreshold"),
        windowLabel,
      },
      action: {
        label: t("suggestions.actionSeeDay"),
        href: calendarDayHref(d.dayMs),
      },
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
        title: t("suggestions.fragmentation.title"),
        body: t("suggestions.fragmentation.body"),
        meta:
          curFrag.avgBlockMs !== null && prevFrag.avgBlockMs !== null
            ? [
                t("suggestions.fragmentation.metaAvg", {
                  duration: dur(curFrag.avgBlockMs),
                }),
                t("suggestions.fragmentation.metaWas", {
                  duration: dur(prevFrag.avgBlockMs),
                }),
              ]
            : undefined,
        evidence: {
          summary:
            curFrag.avgBlockMs !== null && prevFrag.avgBlockMs !== null
              ? t("suggestions.fragmentation.evidenceSummary", {
                  duration: dur(curFrag.avgBlockMs),
                  prev: dur(prevFrag.avgBlockMs),
                })
              : t("suggestions.fragmentation.evidenceSummaryShare"),
          n: curFrag.blockCount,
          threshold: t("suggestions.fragmentation.evidenceThreshold"),
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
      dayMs: days[m],
      severity: "info",
      title: t("suggestions.lateNight.title", { day: dayLabel(days[m]) }),
      body: t("suggestions.lateNight.body"),
      meta: [
        t("suggestions.lateNight.metaRest", { duration: dur(Math.max(0, gap)) }),
      ],
      evidence: {
        summary: t("suggestions.lateNight.evidenceSummary", {
          duration: dur(Math.max(0, gap)),
          day: dayLabel(days[m]),
        }),
        threshold: t("suggestions.lateNight.evidenceThreshold"),
        windowLabel,
      },
      action: {
        label: t("suggestions.lateNight.action"),
        href: calendarDayHref(days[m]),
      },
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
      const direction = top.deltaShare > 0 ? "up" : "down";
      out.push({
        id: `category-drift:${top.categoryId ?? "uncategorized"}`,
        kind: "category-drift",
        severity: "info",
        title: t("suggestions.categoryDrift.title", { name, pts }),
        body: t("suggestions.categoryDrift.body", { name, direction, pts }),
        meta: [
          t("suggestions.categoryDrift.metaNow", {
            pct: Math.round(top.share * 100),
          }),
          t("suggestions.categoryDrift.metaWas", {
            pct: Math.round(top.prevShare * 100),
          }),
        ],
        evidence: {
          summary: t("suggestions.categoryDrift.evidenceSummary", {
            name,
            pct: Math.round(top.share * 100),
            prevPct: Math.round(top.prevShare * 100),
          }),
          threshold: t("suggestions.categoryDrift.evidenceThreshold"),
          windowLabel,
        },
      });
    }
  }

  // --- (e) Unscheduled high-priority tasks due soon -------------------------
  if (window.end > now) {
    const candidates = input.tasks
      .filter((task) => {
        if (task.parentId !== null || task.completedAt != null) return false;
        if (task.priority !== 3 || task.dueDate === null) return false;
        const dueMs = dateInputToMs(task.dueDate, timeZone);
        if (dueMs < startOfToday || dueMs >= startOfToday + DUE_HORIZON_MS) return false;
        // "Scheduled" = an upcoming block in this period's fetch.
        return !input.occurrences.some((o) => o.taskId === task.id && o.end > now);
      })
      .sort(
        (a, b) =>
          (a.dueDate as string).localeCompare(b.dueDate as string) ||
          a.title.localeCompare(b.title),
      );
    for (const task of candidates.slice(0, 2)) {
      const dueMs = dateInputToMs(task.dueDate as string, timeZone);
      out.push({
        id: `unscheduled-task:${task.id}`,
        kind: "unscheduled-task",
        severity: dueMs - startOfToday <= DUE_ATTENTION_MS ? "attention" : "info",
        title: t("suggestions.unscheduledTask.title", { title: task.title }),
        body: t("suggestions.unscheduledTask.body", { day: dayLabel(dueMs) }),
        evidence: {
          summary: t("suggestions.unscheduledTask.evidenceSummary", {
            title: task.title,
            day: dayLabel(dueMs),
          }),
          threshold: t("suggestions.unscheduledTask.evidenceThreshold"),
          windowLabel,
        },
        action: {
          label: t("suggestions.unscheduledTask.action"),
          href: "/tasks",
        },
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
      title: t("suggestions.goalOverBudget.title", { name }),
      body: t("suggestions.goalOverBudget.body", { name }),
      meta: [
        t("suggestions.goalOverBudget.metaTracked", { duration: dur(g.actualMs) }),
        t("suggestions.goalOverBudget.metaCap", { duration: dur(g.targetMs) }),
      ],
      evidence: {
        summary: t("suggestions.goalOverBudget.evidenceSummary", {
          duration: dur(g.actualMs),
          cap: dur(g.targetMs),
        }),
        threshold: t("suggestions.goalOverBudget.evidenceThreshold"),
        windowLabel,
      },
      action: {
        label: t("suggestions.goalOverBudget.action"),
        href: "/insights?tab=balance",
      },
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
      title: t("suggestions.goalUnderBudget.title", { name }),
      body: t("suggestions.goalUnderBudget.body", { name }),
      meta: [
        t("suggestions.goalUnderBudget.metaProgress", {
          actual: dur(g.actualMs),
          target: dur(g.targetMs),
        }),
      ],
      evidence: {
        summary: t("suggestions.goalUnderBudget.evidenceSummary", {
          actual: dur(g.actualMs),
          expected: dur((g.expected as number) * g.targetMs),
          target: dur(g.targetMs),
        }),
        threshold: t("suggestions.goalUnderBudget.evidenceThreshold"),
        windowLabel,
      },
      action: {
        label: t("suggestions.actionOpenCalendar"),
        href: "/calendar",
      },
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
      title: t("suggestions.forecastOverload.title"),
      body: t("suggestions.forecastOverload.body"),
      meta: [
        t("suggestions.forecastOverload.metaCommitted", {
          duration: dur(committedMs),
        }),
        t("suggestions.forecastOverload.metaPace", { pct }),
      ],
      evidence: {
        summary: t("suggestions.forecastOverload.evidenceSummary", {
          duration: dur(committedMs),
          pct,
          typical: dur(forecast.typicalDayMs),
          days: forecast.perDay.length,
        }),
        threshold: t("suggestions.forecastOverload.evidenceThreshold"),
        windowLabel,
      },
      action: forecast.busiestDay
        ? {
            label: t("suggestions.forecastOverload.actionBusiest"),
            href: calendarDayHref(forecast.busiestDay.dayMs),
          }
        : { label: t("suggestions.actionOpenCalendar"), href: "/calendar" },
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
      dayMs: a.dayMs,
      severity: "info",
      title: t("suggestions.anomaly.title", { day: dayLabel(a.dayMs) }),
      body: t("suggestions.anomaly.body", { direction: a.direction }),
      meta: [t("suggestions.anomaly.metaTracked", { duration: dur(a.ms) })],
      evidence: {
        summary: t("suggestions.anomaly.evidenceSummary", {
          duration: dur(a.ms),
          day: dayLabel(a.dayMs),
          z: a.z.toFixed(1),
        }),
        threshold: t("suggestions.anomaly.evidenceThreshold"),
        windowLabel,
      },
      action: {
        label: t("suggestions.actionSeeDay"),
        href: calendarDayHref(a.dayMs),
      },
    });
  }

  // --- (j) A notable streak ended -------------------------------------------
  const streak = input.streak;
  if (streak && streak.current === 0 && streak.longest >= STREAK_NOTABLE_DAYS) {
    out.push({
      id: `streak-broken:${streak.longest}`,
      kind: "streak-broken",
      severity: "info",
      title: t("suggestions.streakBroken.title", { days: streak.longest }),
      body: t("suggestions.streakBroken.body"),
      meta: [t("suggestions.streakBroken.metaLongest", { days: streak.longest })],
      evidence: {
        summary: t("suggestions.streakBroken.evidenceSummary", {
          days: streak.longest,
        }),
        threshold: t("suggestions.streakBroken.evidenceThreshold"),
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
        title: t("suggestions.sleepDebt.title"),
        body: t("suggestions.sleepDebt.body"),
        meta: [
          t("suggestions.sleepDebt.metaAvg", { duration: dur(Math.round(avgMs)) }),
          t("suggestions.sleepDebt.metaShort", { count: short.length }),
        ],
        evidence: {
          summary: t("suggestions.sleepDebt.evidenceSummary", {
            short: short.length,
            total: recent.length,
            avg: dur(Math.round(avgMs)),
          }),
          n: recent.length,
          threshold: t("suggestions.sleepDebt.evidenceThreshold"),
          windowLabel,
        },
        action: {
          label: t("suggestions.sleepDebt.action"),
          href: "/insights?tab=sleep",
        },
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
      title: t("suggestions.correlationInsight.title", { name }),
      body: t("suggestions.correlationInsight.body", {
        name,
        mean: lowest.agg.mean.toFixed(1),
      }),
      meta: [
        t("suggestions.correlationInsight.metaMean", {
          mean: lowest.agg.mean.toFixed(1),
        }),
        t("suggestions.correlationInsight.metaN", { n: lowest.agg.n }),
      ],
      evidence: {
        summary: t("suggestions.correlationInsight.evidenceSummary", {
          n: lowest.agg.n,
          name,
          mean: lowest.agg.mean.toFixed(1),
        }),
        n: lowest.agg.n,
        threshold: t("suggestions.correlationInsight.evidenceThreshold", {
          min: MIN_CATEGORY_RATINGS,
        }),
        windowLabel,
      },
    });
  }

  // --- Suppression, order, total cap -----------------------------------------
  const suppressed = input.suppressedKinds;
  const visible = suppressed ? out.filter((s) => !suppressed.has(s.kind)) : out;
  visible.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "attention" ? -1 : 1;
    // Among equal severity, a card about a past day is less actionable — sink it
    // below today/future-relevant cards (retrospective reflections stay, just lower).
    const aPast = a.dayMs != null && a.dayMs < startOfToday;
    const bPast = b.dayMs != null && b.dayMs < startOfToday;
    if (aPast !== bPast) return aPast ? 1 : -1;
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
