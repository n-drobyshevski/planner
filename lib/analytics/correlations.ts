// Attribute cross-analysis for the Insights views: satisfaction by category /
// daypart, energy-weighted load per day, and the deep-work share. Pure +
// side-effect-free; epoch ms, half-open [start, end) intervals; daypart
// boundaries are read in an explicit IANA zone (DST-correct).
//
// Callers pass occurrences already filtered for insights (tracked + member +
// category via lib/insights/filters.ts). They may still contain inactive
// (sleep) occurrences when the include-inactive toggle is on — every
// aggregate here skips them. All means are DURATION-WEIGHTED by the
// occurrence's ms clipped to the window, so a 4-hour block counts four times
// a 1-hour one.

import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import type { Occurrence, TimeWindow } from "@/lib/types";

const HOUR_MS = 3_600_000;

/** Minimum rated occurrences before a category row is reported. */
export const MIN_CATEGORY_RATINGS = 5;

export interface RatedAggregate {
  /** duration-weighted mean rating (0 when n is 0) */
  mean: number;
  /** rated occurrences contributing */
  n: number;
  /** rated clipped ms behind the mean */
  ms: number;
}

/** Overlap (ms, ≥ 0) of half-open [aStart, aEnd) with [bStart, bEnd). */
function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Duration-weighted mean satisfaction per category, over occurrences carrying
 * a satisfaction rating. Only categories with at least MIN_CATEGORY_RATINGS
 * rated occurrences are reported (a single 5-star outing shouldn't crown a
 * category); sorted by mean descending.
 */
export function satisfactionByCategory(
  occurrences: Occurrence[],
  window: TimeWindow,
): { categoryId: string | null; agg: RatedAggregate }[] {
  const acc = new Map<string | null, { weighted: number; n: number; ms: number }>();
  for (const o of occurrences) {
    if (o.inactive) continue;
    const satisfaction = o.attributes.satisfaction;
    if (satisfaction === undefined) continue;
    const ms = overlap(o.start, o.end, window.start, window.end);
    if (ms <= 0) continue;
    const row = acc.get(o.categoryId) ?? { weighted: 0, n: 0, ms: 0 };
    row.weighted += ms * satisfaction;
    row.n += 1;
    row.ms += ms;
    acc.set(o.categoryId, row);
  }
  return [...acc.entries()]
    .filter(([, r]) => r.n >= MIN_CATEGORY_RATINGS)
    .map(([categoryId, r]) => ({
      categoryId,
      agg: { mean: r.weighted / r.ms, n: r.n, ms: r.ms },
    }))
    .sort((a, b) => b.agg.mean - a.agg.mean);
}

export interface EnergyDayLoad {
  /** start-of-day epoch ms (matches a getVisibleDays entry) */
  dayMs: number;
  /** Σ clipped ms × energy (1..3) over energy-rated occurrences */
  weightedMs: number;
  /** clipped ms of energy-rated occurrences */
  ratedMs: number;
  /** clipped ms of all (non-inactive) occurrences */
  totalMs: number;
}

/**
 * Energy-weighted load per day. Day buckets span [days[i], days[i+1] ??
 * window.end) like computeUsage's perDay, so multi-day occurrences split at
 * the same boundaries and DST day lengths are honoured. `ratedMs / totalMs`
 * tells callers how much of a day the weighting actually covers.
 */
export function energyLoadPerDay(
  occurrences: Occurrence[],
  days: number[],
  window: TimeWindow,
): EnergyDayLoad[] {
  const active = occurrences.filter((o) => !o.inactive);
  return days.map((dayMs, i) => {
    const dayEnd = i + 1 < days.length ? days[i + 1] : window.end;
    let weightedMs = 0;
    let ratedMs = 0;
    let totalMs = 0;
    for (const o of active) {
      const ms = overlap(o.start, o.end, dayMs, dayEnd);
      if (ms <= 0) continue;
      totalMs += ms;
      const energy = o.attributes.energy;
      if (energy === undefined) continue;
      ratedMs += ms;
      weightedMs += ms * energy;
    }
    return { dayMs, weightedMs, ratedMs, totalMs };
  });
}

/**
 * Deep vs shallow focus time across the window. `share` is deep over rated
 * (deep + shallow) ms — null when nothing carries a focus rating, so a
 * no-data window can't render as "0% deep work".
 */
export function deepWorkShare(
  occurrences: Occurrence[],
  window: TimeWindow,
): { deepMs: number; shallowMs: number; unratedMs: number; share: number | null } {
  let deepMs = 0;
  let shallowMs = 0;
  let unratedMs = 0;
  for (const o of occurrences) {
    if (o.inactive) continue;
    const ms = overlap(o.start, o.end, window.start, window.end);
    if (ms <= 0) continue;
    const focus = o.attributes.focus;
    if (focus === "deep") deepMs += ms;
    else if (focus === "shallow") shallowMs += ms;
    else unratedMs += ms;
  }
  const ratedMs = deepMs + shallowMs;
  return { deepMs, shallowMs, unratedMs, share: ratedMs > 0 ? deepMs / ratedMs : null };
}

export type Daypart = "morning" | "midday" | "evening" | "night";

/** Display order. Local-hour boundaries: morning 5–12, midday 12–17,
 *  evening 17–22, night 22–5 (wrapping past midnight). */
export const DAYPARTS: Daypart[] = ["morning", "midday", "evening", "night"];

function daypartOfHour(hour: number): Daypart {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "midday";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

/**
 * Next local hour boundary after `ms` (same approach as hourHeatmap): local
 * minutes/seconds measure the distance to it, which stays correct across DST
 * jumps and for zones with fractional-hour offsets.
 */
function nextHourBoundary(ms: number, ctx: ReturnType<typeof tz>): number {
  const minute = Number(format(ms, "m", { in: ctx }));
  const second = Number(format(ms, "s", { in: ctx }));
  const intoHour = minute * 60_000 + second * 1000 + (ms % 1000);
  return ms + (HOUR_MS - intoHour);
}

/**
 * Duration-weighted mean satisfaction per daypart. A rated occurrence's
 * window-clipped ms is attributed to dayparts by overlap, sliced at local
 * hour boundaries (so a block spanning 11:00–13:00 feeds both morning and
 * midday, and DST nights attribute by the hours that actually happen). All 4
 * rows are always returned in display order; `n` counts each occurrence once
 * per daypart it touches and may be 0.
 */
export function satisfactionByDaypart(
  occurrences: Occurrence[],
  window: TimeWindow,
  timeZone: string,
): { daypart: Daypart; agg: RatedAggregate }[] {
  const ctx = tz(timeZone);
  const acc = new Map<Daypart, { weighted: number; n: number; ms: number }>(
    DAYPARTS.map((d) => [d, { weighted: 0, n: 0, ms: 0 }]),
  );
  for (const o of occurrences) {
    if (o.inactive) continue;
    const satisfaction = o.attributes.satisfaction;
    if (satisfaction === undefined) continue;
    const touched = new Set<Daypart>();
    let cursor = Math.max(o.start, window.start);
    const end = Math.min(o.end, window.end);
    while (cursor < end) {
      const sliceEnd = Math.min(nextHourBoundary(cursor, ctx), end);
      const daypart = daypartOfHour(Number(format(cursor, "H", { in: ctx })));
      const row = acc.get(daypart)!;
      row.weighted += (sliceEnd - cursor) * satisfaction;
      row.ms += sliceEnd - cursor;
      touched.add(daypart);
      cursor = sliceEnd;
    }
    for (const d of touched) acc.get(d)!.n += 1;
  }
  return DAYPARTS.map((daypart) => {
    const r = acc.get(daypart)!;
    return {
      daypart,
      agg: { mean: r.ms > 0 ? r.weighted / r.ms : 0, n: r.n, ms: r.ms },
    };
  });
}
