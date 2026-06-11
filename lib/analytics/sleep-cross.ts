// Sleep ↔ next-day cross-analysis for the Sleep tab: pairs each sleep log
// (keyed by its wake date) with the day the member woke INTO, then measures
// the sleep/next-day relations via Spearman. Pure + side-effect-free; epoch
// ms, half-open [start, end) intervals; the zone-free wake-date token is
// interpreted in the viewer zone via dateInputToMs.
//
// Fragmentation scalar: of the Fragmentation shape, avgBlockMs is used —
// average merged-block length is the steadiest single-day signal (the share
// metrics are too coarse over the handful of blocks one day produces). Null
// when the day has no tracked blocks.

import { fragmentation } from "@/lib/analytics/patterns";
import { spearman } from "@/lib/analytics/stats";
import { dateInputToMs } from "@/lib/datetime/local";
import type { Occurrence, SleepLog, TimeWindow } from "@/lib/types";

export interface SleepDayPair {
  /** start-of-day ms of the wake date in the viewer zone */
  wakeDayMs: number;
  /** wokeAt − bedtimeAt when both are present, else null */
  durationMs: number | null;
  /** 1–5 rating, or null when unrated */
  quality: number | null;
  /** the day the member woke INTO (the wake date itself) */
  nextDay: {
    /** non-inactive ms clipped to the day */
    trackedMs: number;
    /** avgBlockMs over the single-day window (see module header); null when empty */
    fragmentation: number | null;
    /** duration-weighted mean satisfaction; null when nothing is rated */
    meanSatisfaction: number | null;
  };
}

/** Overlap (ms, ≥ 0) of half-open [aStart, aEnd) with [bStart, bEnd). */
function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Pair sleep logs with their wake day's tracked profile. A log's `date` is
 * matched to a `days` entry via dateInputToMs in the viewer zone; logs whose
 * wake day is outside the window are skipped. Day buckets span [days[i],
 * days[i+1] ?? window.end) like computeUsage's perDay (DST-correct). Sorted
 * by wake day ascending.
 */
export function buildSleepDayPairs(
  logs: SleepLog[],
  occurrences: Occurrence[],
  days: number[],
  window: TimeWindow,
  timeZone: string,
): SleepDayPair[] {
  const active = occurrences.filter((o) => !o.inactive);
  const dayIndex = new Map(days.map((d, i) => [d, i]));

  const out: SleepDayPair[] = [];
  for (const log of logs) {
    const wakeDayMs = dateInputToMs(log.date, timeZone);
    const i = dayIndex.get(wakeDayMs);
    if (i === undefined) continue; // wake day outside the window
    const dayEnd = i + 1 < days.length ? days[i + 1] : window.end;

    let trackedMs = 0;
    let ratedMs = 0;
    let weighted = 0;
    for (const o of active) {
      const ms = overlap(o.start, o.end, wakeDayMs, dayEnd);
      if (ms <= 0) continue;
      trackedMs += ms;
      const satisfaction = o.attributes.satisfaction;
      if (satisfaction === undefined) continue;
      ratedMs += ms;
      weighted += ms * satisfaction;
    }

    out.push({
      wakeDayMs,
      durationMs:
        log.bedtimeAt !== null && log.wokeAt !== null
          ? log.wokeAt - log.bedtimeAt
          : null,
      quality: log.quality,
      nextDay: {
        trackedMs,
        fragmentation: fragmentation(active, { start: wakeDayMs, end: dayEnd }, timeZone)
          .avgBlockMs,
        meanSatisfaction: ratedMs > 0 ? weighted / ratedMs : null,
      },
    });
  }
  return out.sort((a, b) => a.wakeDayMs - b.wakeDayMs);
}

export interface SleepCorrelation {
  metric: "load" | "fragmentation" | "satisfaction";
  vs: "duration" | "quality";
  /** Spearman rho; null under MIN_CORRELATION_PAIRS complete pairs */
  rho: number | null;
  /** pairs where both sides were non-null */
  n: number;
}

const METRICS = ["load", "fragmentation", "satisfaction"] as const;
const SIDES = ["duration", "quality"] as const;

function metricOf(pair: SleepDayPair, metric: (typeof METRICS)[number]): number | null {
  switch (metric) {
    case "load":
      return pair.nextDay.trackedMs;
    case "fragmentation":
      return pair.nextDay.fragmentation;
    case "satisfaction":
      return pair.nextDay.meanSatisfaction;
  }
}

/**
 * All 6 metric × sleep-side Spearman correlations, in METRICS × SIDES order.
 * Each combo uses only the pairs where both sides are non-null (`n`); rho is
 * null below MIN_CORRELATION_PAIRS such pairs (spearman's own gate).
 */
export function sleepCorrelations(pairs: SleepDayPair[]): SleepCorrelation[] {
  const out: SleepCorrelation[] = [];
  for (const metric of METRICS) {
    for (const vs of SIDES) {
      const samples: (readonly [number, number])[] = [];
      for (const p of pairs) {
        const m = metricOf(p, metric);
        const s = vs === "duration" ? p.durationMs : p.quality;
        if (m === null || s === null) continue;
        samples.push([m, s] as const);
      }
      out.push({ metric, vs, rho: spearman(samples), n: samples.length });
    }
  }
  return out;
}
