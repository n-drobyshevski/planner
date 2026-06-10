// Pattern aggregations for the Insights views: weekday profile, weekday×hour
// heatmap, and fragmentation (merged focus blocks + gaps). Pure +
// side-effect-free; epoch ms, half-open [start, end) intervals. Labels
// (weekday, hour, day) are taken in an explicit IANA zone, DST-correct.
//
// Callers pass occurrences already filtered for insights (tracked + member +
// category via lib/insights/filters.ts) — nothing is dropped here.

import { format, startOfDay, addDays, getTime } from "date-fns";
import { tz } from "@date-fns/tz";
import type { Occurrence, TimeWindow } from "@/lib/types";

const HOUR_MS = 3_600_000;
const SHORT_BLOCK_MS = 30 * 60_000;

export interface WeekdayUsage {
  /** 0 = Monday … 6 = Sunday */
  weekday: number;
  totalMs: number;
  /** totalMs / dayCount — fair when the range covers weekdays unevenly */
  avgMs: number;
  /** how many days of this weekday the range contains */
  dayCount: number;
}

export interface HeatmapCell {
  /** 0 = Monday … 6 = Sunday */
  weekday: number;
  /** local hour 0..23 */
  hour: number;
  ms: number;
}

export interface HourHeatmap {
  /** 168 cells indexed weekday*24+hour */
  cells: HeatmapCell[];
  /** busiest cell's ms (0 when empty) — drives the color scale */
  maxMs: number;
}

export interface Fragmentation {
  /** merged blocks across the window (overlaps/adjacency joined per day) */
  blockCount: number;
  avgBlockMs: number | null;
  medianBlockMs: number | null;
  longestBlockMs: number | null;
  /** share of blocks shorter than 30 minutes */
  shortBlockShare: number | null;
  /** average gap between consecutive blocks within a day */
  avgGapMs: number | null;
}

/** Overlap (ms, ≥ 0) of half-open [aStart, aEnd) with [bStart, bEnd). */
function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/** Monday-first weekday (0..6) of an instant in `ctx`. */
function weekdayOf(ms: number, ctx: ReturnType<typeof tz>): number {
  return Number(format(ms, "i", { in: ctx })) - 1; // ISO day 1..7 → 0..6
}

/**
 * Total + average tracked ms per weekday (Monday-first). Day buckets span
 * [days[i], days[i+1] ?? window.end) like computeUsage, so DST day lengths
 * are honoured; the average divides by how often that weekday occurs in the
 * range so uneven ranges (e.g. 10 days) don't skew the profile.
 */
export function byWeekday(
  occurrences: Occurrence[],
  days: number[],
  window: TimeWindow,
  timeZone: string,
): WeekdayUsage[] {
  const ctx = tz(timeZone);
  const rows: WeekdayUsage[] = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    totalMs: 0,
    avgMs: 0,
    dayCount: 0,
  }));
  days.forEach((dayMs, i) => {
    const dayEnd = i + 1 < days.length ? days[i + 1] : window.end;
    const row = rows[weekdayOf(dayMs, ctx)];
    row.dayCount += 1;
    for (const o of occurrences) row.totalMs += overlap(o.start, o.end, dayMs, dayEnd);
  });
  for (const row of rows) row.avgMs = row.dayCount > 0 ? row.totalMs / row.dayCount : 0;
  return rows;
}

/**
 * Next local hour boundary after `ms`: local minutes/seconds measure the
 * distance to it, which stays correct across DST jumps and for zones with
 * fractional-hour offsets (their local minute still runs 0..59).
 */
function nextHourBoundary(ms: number, ctx: ReturnType<typeof tz>): number {
  const minute = Number(format(ms, "m", { in: ctx }));
  const second = Number(format(ms, "s", { in: ctx }));
  const intoHour = minute * 60_000 + second * 1000 + (ms % 1000);
  return ms + (HOUR_MS - intoHour);
}

/**
 * Weekday×hour grid (168 cells) of tracked ms, clipped to the window. Slices
 * are attributed to the *local* hour they occur in; during a spring-forward
 * night the skipped hour simply receives nothing.
 */
export function hourHeatmap(
  occurrences: Occurrence[],
  window: TimeWindow,
  timeZone: string,
): HourHeatmap {
  const ctx = tz(timeZone);
  const cells: HeatmapCell[] = Array.from({ length: 168 }, (_, i) => ({
    weekday: Math.floor(i / 24),
    hour: i % 24,
    ms: 0,
  }));

  for (const o of occurrences) {
    let cursor = Math.max(o.start, window.start);
    const end = Math.min(o.end, window.end);
    while (cursor < end) {
      const sliceEnd = Math.min(nextHourBoundary(cursor, ctx), end);
      const weekday = weekdayOf(cursor, ctx);
      const hour = Number(format(cursor, "H", { in: ctx }));
      cells[weekday * 24 + hour].ms += sliceEnd - cursor;
      cursor = sliceEnd;
    }
  }

  let maxMs = 0;
  for (const c of cells) if (c.ms > maxMs) maxMs = c.ms;
  return { cells, maxMs };
}

/**
 * Fragmentation profile: occurrences are clipped to the window, split at
 * local midnights, and merged per day when they overlap or touch — the
 * resulting "blocks" approximate uninterrupted busy stretches. Gaps are
 * measured between consecutive blocks within the same day only.
 */
export function fragmentation(
  occurrences: Occurrence[],
  window: TimeWindow,
  timeZone: string,
): Fragmentation {
  const ctx = tz(timeZone);

  // Clip + split at local midnights, grouped by day start.
  const byDay = new Map<number, { start: number; end: number }[]>();
  for (const o of occurrences) {
    let cursor = Math.max(o.start, window.start);
    const end = Math.min(o.end, window.end);
    while (cursor < end) {
      const dayStart = getTime(startOfDay(cursor, { in: ctx }));
      const dayEnd = getTime(startOfDay(addDays(cursor, 1, { in: ctx }), { in: ctx }));
      const pieceEnd = Math.min(dayEnd, end);
      const list = byDay.get(dayStart) ?? [];
      list.push({ start: cursor, end: pieceEnd });
      byDay.set(dayStart, list);
      cursor = pieceEnd;
    }
  }

  const blocks: number[] = [];
  const gaps: number[] = [];
  for (const pieces of byDay.values()) {
    pieces.sort((a, b) => a.start - b.start || a.end - b.end);
    let curStart = pieces[0].start;
    let curEnd = pieces[0].end;
    for (let i = 1; i < pieces.length; i++) {
      const p = pieces[i];
      if (p.start <= curEnd) {
        curEnd = Math.max(curEnd, p.end);
      } else {
        blocks.push(curEnd - curStart);
        gaps.push(p.start - curEnd);
        curStart = p.start;
        curEnd = p.end;
      }
    }
    blocks.push(curEnd - curStart);
  }

  if (blocks.length === 0) {
    return {
      blockCount: 0,
      avgBlockMs: null,
      medianBlockMs: null,
      longestBlockMs: null,
      shortBlockShare: null,
      avgGapMs: null,
    };
  }

  const sorted = [...blocks].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianBlockMs =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const total = blocks.reduce((s, b) => s + b, 0);

  return {
    blockCount: blocks.length,
    avgBlockMs: total / blocks.length,
    medianBlockMs,
    longestBlockMs: sorted[sorted.length - 1],
    shortBlockShare: blocks.filter((b) => b < SHORT_BLOCK_MS).length / blocks.length,
    avgGapMs: gaps.length > 0 ? gaps.reduce((s, g) => s + g, 0) / gaps.length : null,
  };
}
