// Pure view logic of the Insights tabs, lifted verbatim out of the components
// (overview-tab, trends-tab, patterns-tab, hour-heatmap, tasks-tab,
// day-detail-sheet) so it can be fixture-tested against the Android port
// (scripts/insights-fixtures/selectors-*.ts, day-detail.ts). No React, no
// next-intl: display strings (names, colors, pre-formatted labels) stay with
// the caller, which builds them from the shapes returned here.

import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import { delta, rollingAverage, type CategoryBuckets } from "@/lib/analytics/trends";
import type { CategoryUsage, DayUsage, UsageSummary } from "@/lib/analytics/usage";
import type { CategoryShare } from "@/lib/analytics/balance";
import type { WeekdayUsage, HeatmapCell } from "@/lib/analytics/patterns";
import type {
  EnergyDayLoad,
  deepWorkShare,
  satisfactionByDaypart,
} from "@/lib/analytics/correlations";
import type { Anomaly, Streak, TrendDirection } from "@/lib/analytics/momentum";
import type { Granularity, ResolvedPeriod } from "@/lib/insights/period";
import { dateFnsLocale } from "@/lib/datetime/date-locale";
import type { Occurrence, TaskRow } from "@/lib/types";

type DaypartRating = ReturnType<typeof satisfactionByDaypart>[number];
type DeepWorkShare = ReturnType<typeof deepWorkShare>;

// --- Overview ----------------------------------------------------------------

/** Categories shown individually in the share bar before collapsing into "Other". */
export const TOP_CATEGORIES = 6;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface PerDayPoint {
  key: string;
  ms: number;
  avg: number;
  /** previous period aligned by position; undefined past its end */
  prevMs: number | undefined;
}

/** The per-day chart rows: tracked ms, 7-day average, and the aligned previous day. */
export function perDaySeries(cur: DayUsage[], prev: DayUsage[]): PerDayPoint[] {
  const avg = rollingAverage(cur, 7);
  return cur.map((d, i) => ({
    key: String(d.dayMs),
    ms: d.ms,
    avg: avg[i].avgMs,
    // Previous period aligned by position (day 1 vs day 1, …).
    prevMs: prev[i]?.ms,
  }));
}

/**
 * "Typical day" baseline: median nonzero day across both windows — the same
 * baseline the Optimize overload rule judges against.
 */
export function typicalDayMs(cur: DayUsage[], prev: DayUsage[]): number {
  return median([...cur, ...prev].map((d) => d.ms).filter((ms) => ms > 0));
}

/** A share-bar row: a series key (category or uncategorized), or the folded rest. */
export type ShareRow =
  | { id: string; seriesKey: string; ms: number }
  | { id: "other"; seriesKey: null; ms: number };

/** byCategory folded to the top TOP_CATEGORIES plus "other" (only when more). */
export function shareRows(byCategory: CategoryUsage[]): ShareRow[] {
  const rows: ShareRow[] = byCategory.map((c) => ({
    id: c.categoryId ?? "uncategorized",
    seriesKey: c.categoryId ?? "__uncategorized__",
    ms: c.ms,
  }));
  if (rows.length <= TOP_CATEGORIES) return rows;
  const head = rows.slice(0, TOP_CATEGORIES);
  const restMs = rows.slice(TOP_CATEGORIES).reduce((s, r) => s + r.ms, 0);
  return [...head, { id: "other", seriesKey: null, ms: restMs }];
}

/**
 * Biggest share shifts vs the previous period (only meaningful with data on
 * both sides).
 */
export function shiftChips(
  shares: CategoryShare[],
  curTotal: number,
  prevTotal: number,
): CategoryShare[] {
  if (curTotal === 0 || prevTotal === 0) return [];
  return shares
    .filter((s) => Math.abs(s.deltaShare) >= 0.02)
    .sort((a, b) => Math.abs(b.deltaShare) - Math.abs(a.deltaShare))
    .slice(0, 3);
}

export type TotalTrend = "none" | "level" | "up" | "down";

/** Total direction vs the previous period, for the per-day headline. */
export function totalChange(
  total: number,
  prevTotal: number,
): { trend: TotalTrend; pct: number } {
  const totalDelta = delta(total, prevTotal);
  return {
    trend:
      totalDelta.deltaPct === null
        ? "none"
        : totalDelta.deltaPct === 0
          ? "level"
          : totalDelta.deltaPct > 0
            ? "up"
            : "down",
    pct:
      totalDelta.deltaPct === null
        ? 0
        : Math.round(Math.abs(totalDelta.deltaPct) * 100),
  };
}

/** Average tracked ms per event, or null with no events. */
export function avgSessionMs(summary: UsageSummary): number | null {
  return summary.eventCount > 0 ? summary.totalMs / summary.eventCount : null;
}

// --- Trends --------------------------------------------------------------------

/** The bucket with the most time; the first wins ties (undefined when empty). */
export function busiestBucket<T extends { ms: number }>(rows: T[]): T {
  return rows.reduce((a, b) => (b.ms > a.ms ? b : a), rows[0]);
}

/** Day-level series, only at day granularity (where buckets ≡ days). */
export function perDayFromBuckets(
  buckets: { start: number; ms: number }[],
  granularity: Granularity,
): DayUsage[] | null {
  return granularity === "day"
    ? buckets.map((b) => ({ dayMs: b.start, ms: b.ms }))
    : null;
}

/** Total ms per series key over all rows (row order, then key order). */
export function categoryTotals(cb: CategoryBuckets): Map<string, number> {
  const totals = new Map<string, number>();
  for (const r of cb.rows) {
    for (const [k, ms] of Object.entries(r.byKey)) {
      totals.set(k, (totals.get(k) ?? 0) + ms);
    }
  }
  return totals;
}

/** The series key with the largest total; the first wins ties (null when none). */
export function topCategory(
  cb: CategoryBuckets,
  totals: Map<string, number>,
): string | null {
  return cb.seriesKeys.length
    ? cb.seriesKeys.reduce((a, b) => ((totals.get(b) ?? 0) > (totals.get(a) ?? 0) ? b : a))
    : null;
}

/** Whether the Momentum section has anything to show (day granularity only). */
export function showMomentum(
  perDay: DayUsage[] | null,
  streak: Streak | null,
  steadiness: number | null,
  anomalies: Anomaly[],
  trend: TrendDirection,
): boolean {
  return Boolean(
    perDay &&
      (streak ||
        steadiness !== null ||
        anomalies.length > 0 ||
        trend.direction !== null),
  );
}

// --- Patterns ------------------------------------------------------------------

/** Minimum rated occurrences before a daypart verdict is worth showing. */
export const MIN_DAYPART_RATINGS = 5;

/** Total tracked ms over the weekday rows (0 → the empty state). */
export function weekdayTotal(rows: WeekdayUsage[]): number {
  return rows.reduce((s, w) => s + w.totalMs, 0);
}

/** The weekday with the highest average; Monday-first wins ties. */
export function topWeekday(rows: WeekdayUsage[]): WeekdayUsage {
  return rows.reduce((a, b) => (b.avgMs > a.avgMs ? b : a), rows[0]);
}

/** The best-rated daypart with enough ratings, or null. */
export function bestDaypart(rows: DaypartRating[]): DaypartRating | null {
  const ratedParts = rows.filter((d) => d.agg.n >= MIN_DAYPART_RATINGS);
  return ratedParts.length
    ? ratedParts.reduce((a, b) => (b.agg.mean > a.agg.mean ? b : a))
    : null;
}

/** The worst-rated daypart, when at least two have enough ratings. */
export function worstDaypart(rows: DaypartRating[]): DaypartRating | null {
  const ratedParts = rows.filter((d) => d.agg.n >= MIN_DAYPART_RATINGS);
  return ratedParts.length >= 2
    ? ratedParts.reduce((a, b) => (b.agg.mean < a.agg.mean ? b : a))
    : null;
}

export interface EnergySummary {
  /** duration-weighted mean energy on the 1..4 scale; null with no ratings */
  meanEnergy: number | null;
  ratedMs: number;
  totalMs: number;
  /** rated share of the tracked time, in whole percent; null when not shown */
  coveragePct: number | null;
}

export function energySummary(days: EnergyDayLoad[]): EnergySummary {
  const energyRatedMs = days.reduce((s, d) => s + d.ratedMs, 0);
  const energyWeightedMs = days.reduce((s, d) => s + d.weightedMs, 0);
  const energyTotalMs = days.reduce((s, d) => s + d.totalMs, 0);
  // weighted / rated = duration-weighted mean energy on the 1..4 scale.
  const meanEnergy = energyRatedMs > 0 ? energyWeightedMs / energyRatedMs : null;
  return {
    meanEnergy,
    ratedMs: energyRatedMs,
    totalMs: energyTotalMs,
    coveragePct:
      meanEnergy !== null && energyTotalMs > 0
        ? Math.round((energyRatedMs / energyTotalMs) * 100)
        : null,
  };
}

/** Whether any attribute lens has data (else the section shows its empty state). */
export function hasAttributes(
  deep: DeepWorkShare,
  best: DaypartRating | null,
  energy: EnergySummary,
): boolean {
  return deep.share !== null || best !== null || energy.meanEnergy !== null;
}

// --- Hour heatmap --------------------------------------------------------------

/** Quantize a cell to one of 5 steps: 0 · <30m · <1h · <2h · 2h+. */
export function stepOf(ms: number): number {
  if (ms <= 0) return 0;
  if (ms < 30 * 60_000) return 1;
  if (ms < 60 * 60_000) return 2;
  if (ms < 120 * 60_000) return 3;
  return 4;
}

/** Alpha of --chart-1 per step (step 0 renders the muted track instead). */
export const STEP_ALPHA = [0, 25, 45, 70, 100];

/** The 168 hour cells folded into 7 × 6 four-hour bands (index weekday*6 + hour/4). */
export function heatmapBands(cells: HeatmapCell[]): number[] {
  const out: number[] = Array.from({ length: 7 * 6 }, () => 0);
  for (const c of cells) {
    out[c.weekday * 6 + Math.floor(c.hour / 4)] += c.ms;
  }
  return out;
}

// --- Tasks ---------------------------------------------------------------------

export type LeadTimeParts =
  | { kind: "short"; ms: number }
  | { kind: "daysHours"; days: number; hours: number };

/** Lead times run to days/weeks — "9d 17h" reads better than "233h". */
export function leadTimeParts(ms: number): LeadTimeParts {
  const DAY = 86_400_000;
  if (ms < 2 * DAY) return { kind: "short", ms };
  const days = Math.floor(ms / DAY);
  const hours = Math.round((ms % DAY) / 3_600_000);
  return { kind: "daysHours", days, hours };
}

/** Whether any top-level task exists (else the Tasks tab shows its empty state). */
export function hasTopLevelTasks(tasks: TaskRow[]): boolean {
  return tasks.some((t) => t.parentId === null);
}

// --- Day detail ------------------------------------------------------------------

/** Occurrence ms clipped to [dayStart, dayEnd). */
export function clippedMs(o: Occurrence, dayStart: number, dayEnd: number): number {
  return Math.max(0, Math.min(o.end, dayEnd) - Math.max(o.start, dayStart));
}

export interface DayDetail {
  dayEnd: number;
  items: Occurrence[];
  totalMs: number;
}

/**
 * The day sheet's slice: every occurrence touching the day (inactive ones
 * listed but left out of the total), by start then title.
 */
export function buildDayDetail(
  dayMs: number,
  period: Pick<ResolvedPeriod, "days" | "window">,
  occurrences: Occurrence[],
  compareTitles: (a: string, b: string) => number = (a, b) => a.localeCompare(b),
): DayDetail {
  const idx = period.days.indexOf(dayMs);
  const dayEnd = idx >= 0 ? (period.days[idx + 1] ?? period.window.end) : dayMs + 86_400_000;
  const items = occurrences
    .filter((o) => o.start < dayEnd && o.end > dayMs)
    .sort((a, b) => a.start - b.start || compareTitles(a.title, b.title));
  const totalMs = items
    .filter((o) => !o.inactive)
    .reduce((s, o) => s + clippedMs(o, dayMs, dayEnd), 0);
  return { dayEnd, items, totalMs };
}

// --- Labels ----------------------------------------------------------------------

/** "Mon 8 Jun" / "пнд 8 июн." (no comma; the busiest-day hint). */
export function formatWeekdayDayMonthShort(ms: number, timeZone: string, locale: string): string {
  return format(ms, "EEE d MMM", { in: tz(timeZone), locale: dateFnsLocale(locale) });
}

/** "Monday 8 June" (the busiest-day screen-reader line). */
export function formatWeekdayDayMonthLong(ms: number, timeZone: string, locale: string): string {
  return format(ms, "EEEE d MMMM", { in: tz(timeZone), locale: dateFnsLocale(locale) });
}

/** "Monday, 8 Jun 2026" (the day sheet title). */
export function formatDayDetailTitle(ms: number, timeZone: string, locale: string): string {
  return format(ms, "EEEE, d MMM yyyy", { in: tz(timeZone), locale: dateFnsLocale(locale) });
}
