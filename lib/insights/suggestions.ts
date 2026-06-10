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
import { dateInputToMs, dateKeyInZone } from "@/lib/datetime/local";
import { formatDuration } from "@/lib/datetime/format";
import { hasAnyAttribute } from "@/lib/attributes/schema";
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
const TOTAL_CAP = 6;

export type SuggestionKind =
  | "overloaded-day"
  | "fragmentation"
  | "late-night"
  | "category-drift"
  | "unscheduled-task"
  | "stranded-flexible";

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
}

const KIND_PRIORITY: Record<SuggestionKind, number> = {
  "unscheduled-task": 0,
  "overloaded-day": 1,
  "late-night": 2,
  "stranded-flexible": 3,
  fragmentation: 4,
  "category-drift": 5,
};

function median(sortedAsc: number[]): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sortedAsc[mid] : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
}

export function computeSuggestions(input: SuggestionsInput): Suggestion[] {
  const { window, prevWindow, days, prevDays, timeZone, now, categoryName } = input;
  const ctx = tz(timeZone);
  const dayLabel = (ms: number) => format(ms, "EEE d MMM", { in: ctx });

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
      });
    }
  }

  // --- Order + total cap ----------------------------------------------------
  out.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "attention" ? -1 : 1;
    if (KIND_PRIORITY[a.kind] !== KIND_PRIORITY[b.kind])
      return KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
    return a.id.localeCompare(b.id);
  });
  return out.slice(0, TOTAL_CAP);
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
