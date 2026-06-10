// Period model for the Insights views. Resolves a preset (or custom range)
// into a concrete half-open [start, end) window with its day list, bucket grid
// (by granularity), and the comparison window that precedes it. Pure +
// side-effect-free; all boundaries land on local midnight in an explicit IANA
// zone (DST-correct via @date-fns/tz), mirroring lib/datetime/window.ts.

import {
  format,
  startOfDay,
  startOfWeek,
  startOfMonth,
  addDays,
  addWeeks,
  addMonths,
  getTime,
} from "date-fns";
import { tz } from "@date-fns/tz";
import { toDateParam, parseDateParam } from "@/lib/datetime/format";
import type { TimeWindow } from "@/lib/types";

export type PeriodPreset =
  | "this-week"
  | "last-week"
  | "this-month"
  | "last-30d"
  | "last-90d"
  | "custom";

export type Granularity = "day" | "week" | "month";

export type InsightsTab =
  | "overview"
  | "trends"
  | "patterns"
  | "balance"
  | "tasks"
  | "optimize";

/** All tabs in display order. Phase 3 appends "sleep" here. */
export const INSIGHTS_TABS: InsightsTab[] = [
  "overview",
  "trends",
  "patterns",
  "balance",
  "tasks",
  "optimize",
];

export interface PeriodState {
  preset: PeriodPreset;
  /** custom only: any ms within the first day of the range */
  customFrom?: number;
  /** custom only: any ms within the last (inclusive) day of the range */
  customTo?: number;
  granularity: Granularity;
}

/** Half-open [start, end) aggregation bucket, day-aligned in the viewer zone. */
export interface Bucket {
  start: number;
  end: number;
}

export interface ResolvedPeriod {
  /** [start, end) of the focused range, day-aligned in the viewer zone */
  window: TimeWindow;
  /** start-of-day ms per day of the window (computeUsage-compatible) */
  days: number[];
  /** aggregation buckets by the effective granularity; edge buckets are
   *  clipped to the window so they tile it exactly */
  buckets: Bucket[];
  /** the granularity the buckets were built with (sanitized against the
   *  window length when the requested one isn't allowed) */
  granularity: Granularity;
  /** the comparison range: the previous calendar unit for calendar presets,
   *  the immediately preceding equal-length window for rolling/custom ones */
  prevWindow: TimeWindow;
  prevDays: number[];
  /** human label, e.g. "This week · 8 – 14 Jun 2026" */
  label: string;
  /** true when a custom range was clamped to MAX_CUSTOM_DAYS */
  clamped: boolean;
}

interface PeriodOpts {
  /** IANA zone the day boundaries are computed in */
  timeZone: string;
  weekStartsOn?: 0 | 1;
  /** "now" for preset anchoring (default: Date.now()) — injectable for tests */
  now?: number;
}

const DEFAULT_WEEK_STARTS_ON = 1 as const;

/** Longest custom range we aggregate over (keeps worst-case expansion bounded). */
export const MAX_CUSTOM_DAYS = 366;

const DAY_MS = 86_400_000;

/** Start-of-day ms for each local day of [start, end), DST-correct. */
function listDays(start: number, end: number, ctx: ReturnType<typeof tz>): number[] {
  const days: number[] = [];
  let cursor = startOfDay(start, { in: ctx });
  while (getTime(cursor) < end) {
    days.push(getTime(cursor));
    cursor = startOfDay(addDays(cursor, 1, { in: ctx }), { in: ctx });
  }
  return days;
}

/** Buckets tiling [start, end) at `granularity`, edges clipped to the window. */
function listBuckets(
  window: TimeWindow,
  days: number[],
  granularity: Granularity,
  ctx: ReturnType<typeof tz>,
  weekStartsOn: 0 | 1,
): Bucket[] {
  if (granularity === "day") {
    return days.map((dayMs, i) => ({
      start: dayMs,
      end: i + 1 < days.length ? days[i + 1] : window.end,
    }));
  }
  const align = (d: number): number =>
    getTime(
      granularity === "week"
        ? startOfWeek(d, { weekStartsOn, in: ctx })
        : startOfMonth(d, { in: ctx }),
    );
  const step = (d: number): number =>
    getTime(
      granularity === "week" ? addWeeks(d, 1, { in: ctx }) : addMonths(d, 1, { in: ctx }),
    );

  const buckets: Bucket[] = [];
  let cursor = window.start;
  while (cursor < window.end) {
    // Next calendar boundary after `cursor` (cursor itself may be mid-unit
    // when the window doesn't start on one — the first bucket is clipped).
    const boundary = step(align(cursor));
    const end = Math.min(boundary, window.end);
    buckets.push({ start: cursor, end });
    cursor = end;
  }
  return buckets;
}

/** Allowed granularities for a window length: day ≤ 35d, week ≥ 14d, month ≥ 60d. */
export function granularityChoices(window: TimeWindow): Granularity[] {
  const days = Math.round((window.end - window.start) / DAY_MS);
  const choices: Granularity[] = [];
  if (days <= 35) choices.push("day");
  if (days >= 14) choices.push("week");
  if (days >= 60) choices.push("month");
  return choices;
}

/** The granularity a preset/window defaults to when none is pinned. */
export function defaultGranularity(
  preset: PeriodPreset,
  window: TimeWindow,
): Granularity {
  if (preset === "last-90d") return "week";
  if (preset !== "custom") return "day";
  const days = Math.round((window.end - window.start) / DAY_MS);
  if (days <= 35) return "day";
  if (days <= 182) return "week";
  return "month";
}

const PRESET_LABELS: Record<Exclude<PeriodPreset, "custom">, string> = {
  "this-week": "This week",
  "last-week": "Last week",
  "this-month": "This month",
  "last-30d": "Last 30 days",
  "last-90d": "Last 90 days",
};

/** "8 – 14 Jun 2026" / "28 May – 3 Jun 2026" / "30 Dec 2025 – 4 Jan 2026". */
function rangeText(window: TimeWindow, ctx: ReturnType<typeof tz>): string {
  const lastDay = window.end - 1; // exclusive end → a ms inside the last day
  const sameMonth =
    format(window.start, "MMM yyyy", { in: ctx }) ===
    format(lastDay, "MMM yyyy", { in: ctx });
  const sameYear =
    format(window.start, "yyyy", { in: ctx }) === format(lastDay, "yyyy", { in: ctx });
  const left = sameMonth
    ? format(window.start, "d", { in: ctx })
    : sameYear
      ? format(window.start, "d MMM", { in: ctx })
      : format(window.start, "d MMM yyyy", { in: ctx });
  return `${left} – ${format(lastDay, "d MMM yyyy", { in: ctx })}`;
}

/**
 * Resolve a period state into concrete windows, day lists, and buckets.
 *
 * Previous-period semantics: calendar presets compare to the previous calendar
 * unit (this-week → last week, this-month → last month); rolling presets and
 * custom ranges compare to the immediately preceding window of equal day count.
 */
export function resolvePeriod(state: PeriodState, opts: PeriodOpts): ResolvedPeriod {
  const ctx = tz(opts.timeZone);
  const weekStartsOn = opts.weekStartsOn ?? DEFAULT_WEEK_STARTS_ON;
  const now = opts.now ?? Date.now();
  const today = startOfDay(now, { in: ctx });

  let start: number;
  let end: number;
  let prevStart: number;
  let prevEnd: number;
  let clamped = false;

  switch (state.preset) {
    case "this-week": {
      const s = startOfWeek(now, { weekStartsOn, in: ctx });
      start = getTime(s);
      end = getTime(addDays(s, 7, { in: ctx }));
      prevStart = getTime(addWeeks(s, -1, { in: ctx }));
      prevEnd = start;
      break;
    }
    case "last-week": {
      const thisWeek = startOfWeek(now, { weekStartsOn, in: ctx });
      const s = addWeeks(thisWeek, -1, { in: ctx });
      start = getTime(s);
      end = getTime(thisWeek);
      prevStart = getTime(addWeeks(s, -1, { in: ctx }));
      prevEnd = start;
      break;
    }
    case "this-month": {
      const s = startOfMonth(now, { in: ctx });
      start = getTime(s);
      end = getTime(addMonths(s, 1, { in: ctx }));
      prevStart = getTime(addMonths(s, -1, { in: ctx }));
      prevEnd = start;
      break;
    }
    case "last-30d":
    case "last-90d": {
      const count = state.preset === "last-30d" ? 30 : 90;
      // Rolling window ending today (inclusive).
      const e = addDays(today, 1, { in: ctx });
      end = getTime(e);
      start = getTime(addDays(e, -count, { in: ctx }));
      prevEnd = start;
      prevStart = getTime(addDays(start, -count, { in: ctx }));
      break;
    }
    case "custom": {
      // Fall back to this-week when the range is missing/invalid.
      if (state.customFrom == null || state.customTo == null) {
        return resolvePeriod({ ...state, preset: "this-week" }, opts);
      }
      let fromDay = getTime(startOfDay(state.customFrom, { in: ctx }));
      let toDay = getTime(startOfDay(state.customTo, { in: ctx }));
      if (fromDay > toDay) [fromDay, toDay] = [toDay, fromDay];
      start = fromDay;
      end = getTime(addDays(toDay, 1, { in: ctx }));
      // Clamp over-long ranges to the most recent MAX_CUSTOM_DAYS days.
      const dayCount = Math.round((end - start) / DAY_MS);
      if (dayCount > MAX_CUSTOM_DAYS) {
        start = getTime(addDays(end, -MAX_CUSTOM_DAYS, { in: ctx }));
        clamped = true;
      }
      const len = Math.round((end - start) / DAY_MS);
      prevEnd = start;
      prevStart = getTime(addDays(start, -len, { in: ctx }));
      break;
    }
  }

  const window: TimeWindow = { start, end };
  const prevWindow: TimeWindow = { start: prevStart, end: prevEnd };
  const days = listDays(start, end, ctx);
  const prevDays = listDays(prevStart, prevEnd, ctx);

  const allowed = granularityChoices(window);
  const granularity = allowed.includes(state.granularity)
    ? state.granularity
    : defaultGranularity(state.preset, window);
  const buckets = listBuckets(window, days, granularity, ctx, weekStartsOn);

  const range = rangeText(window, ctx);
  const label =
    state.preset === "custom" ? range : `${PRESET_LABELS[state.preset]} · ${range}`;

  return { window, days, buckets, granularity, prevWindow, prevDays, label, clamped };
}

// --- URL codec (mirrors the calendar's view/date param helpers) ---

/** URL token ↔ preset. Rolling presets use the short "30d"/"90d" tokens. */
const RANGE_TOKENS: Record<string, PeriodPreset> = {
  "this-week": "this-week",
  "last-week": "last-week",
  "this-month": "this-month",
  "30d": "last-30d",
  "90d": "last-90d",
  custom: "custom",
};
const TOKEN_BY_PRESET: Record<PeriodPreset, string> = {
  "this-week": "this-week",
  "last-week": "last-week",
  "this-month": "this-month",
  "last-30d": "30d",
  "last-90d": "90d",
  custom: "custom",
};

export function parseRangeParam(value: string | undefined): PeriodPreset {
  return (value && RANGE_TOKENS[value]) || "this-week";
}

export function parseGranularityParam(value: string | undefined): Granularity | null {
  return value === "day" || value === "week" || value === "month" ? value : null;
}

export function parseTabParam(value: string | undefined): InsightsTab {
  return INSIGHTS_TABS.includes(value as InsightsTab)
    ? (value as InsightsTab)
    : "overview";
}

/**
 * Parse the /insights searchParams into a PeriodState. A `custom` range needs
 * both `from` and `to` (yyyy-MM-dd); otherwise it degrades to this-week. The
 * coarse y-m-d seeds are re-normalized to the viewer's zone by resolvePeriod
 * (same approach as the calendar's date param).
 */
export function parsePeriodSearch(sp: {
  range?: string;
  from?: string;
  to?: string;
  granularity?: string;
}): PeriodState {
  let preset = parseRangeParam(sp.range);
  let customFrom: number | undefined;
  let customTo: number | undefined;
  if (preset === "custom") {
    if (sp.from && sp.to) {
      customFrom = parseDateParam(sp.from);
      customTo = parseDateParam(sp.to);
    } else {
      preset = "this-week";
    }
  }
  return {
    preset,
    customFrom,
    customTo,
    // null → the shell substitutes defaultGranularity once the window is known.
    granularity: parseGranularityParam(sp.granularity) ?? "day",
  };
}

/** Encode period + tab as an /insights query string (leading "?"). */
export function periodToSearch(
  state: PeriodState,
  tab: InsightsTab,
  timeZone: string,
): string {
  const params = new URLSearchParams();
  params.set("range", TOKEN_BY_PRESET[state.preset]);
  if (state.preset === "custom" && state.customFrom != null && state.customTo != null) {
    params.set("from", toDateParam(state.customFrom, timeZone));
    params.set("to", toDateParam(state.customTo, timeZone));
  }
  params.set("granularity", state.granularity);
  if (tab !== "overview") params.set("tab", tab);
  return `?${params.toString()}`;
}
