/**
 * Insights fixtures, area "selectors-patterns" (owner: T3): the Patterns tab's
 * view logic and the hour heatmap's quantization, from
 * lib/insights/view-selectors.ts (`topWeekday`, `bestDaypart`, `worstDaypart`,
 * `energySummary`, `hasAttributes`, `weekdayTotal`, `stepOf`, `heatmapBands`).
 *
 * ```ts
 * type WeekdayUsageJson = { weekday: number; totalMs: Ms; avgMs: number; dayCount: number };
 * type DaypartRatingJson = { daypart: "morning" | "midday" | "evening" | "night"; agg: { mean: number; n: number; ms: Ms } };
 * type EnergyDayLoadJson = { dayMs: Ms; weightedMs: Ms; ratedMs: Ms; totalMs: Ms };
 * type EnergySummaryJson = { meanEnergy: number | null; ratedMs: Ms; totalMs: Ms; coveragePct: number | null };
 * sections: {
 *   topWeekday:    { name; input: { rows: WeekdayUsageJson[] }; expected: WeekdayUsageJson }[];
 *   bestDaypart:   { name; input: { rows: DaypartRatingJson[] }; expected: DaypartRatingJson | null }[];
 *   worstDaypart:  { name; input: { rows: DaypartRatingJson[] }; expected: DaypartRatingJson | null }[];
 *   energySummary: { name; input: { days: EnergyDayLoadJson[] }; expected: EnergySummaryJson }[];
 *   hasAttributes: {
 *     name;
 *     input: {
 *       deep: { deepMs: Ms; shallowMs: Ms; unratedMs: Ms; share: number | null };
 *       best: DaypartRatingJson | null;
 *       energy: EnergySummaryJson;
 *     };
 *     expected: boolean;
 *   }[];
 *   weekdayTotal:  { name; input: { rows: WeekdayUsageJson[] }; expected: Ms }[];
 *   stepOf:        { name; input: { ms: Ms }; expected: number }[];   // 0..4
 *   heatmapBands: {
 *     name;
 *     input: { cells: Ms[] };   // compact: cells[weekday * 24 + hour] is that cell's ms (168)
 *     expected: Ms[];           // 42 bands, index weekday * 6 + hour / 4
 *   }[];
 * }
 * ```
 *
 * Hand cases cover the ties (strict `>` / `<`, the first row wins), the
 * MIN_DAYPART_RATINGS edge (n = 4 and 5), a single rated daypart, coverage
 * rounding at exactly .5 (JS `Math.round`, half up), the hasAttributes truth
 * table and every stepOf edge. Real-data cases feed the patterns area's
 * `scenarioMatrix()` through the real `byWeekday`, `satisfactionByDaypart`,
 * `energyLoadPerDay` and `hourHeatmap`, so every zone (the Berlin repeated hour
 * included) reaches the selectors with the shapes the tab actually passes.
 */
import { byWeekday, hourHeatmap, type HeatmapCell, type WeekdayUsage } from "@/lib/analytics/patterns";
import {
  deepWorkShare,
  energyLoadPerDay,
  satisfactionByDaypart,
  type EnergyDayLoad,
} from "@/lib/analytics/correlations";
import {
  bestDaypart,
  energySummary,
  hasAttributes,
  heatmapBands,
  stepOf,
  topWeekday,
  weekdayTotal,
  worstDaypart,
  type EnergySummary,
} from "@/lib/insights/view-selectors";
import { scenarioMatrix, type ScenarioCase } from "./patterns";
import { HOUR, MINUTE, span, toOccurrence, wall, type Case, type Ms } from "./shared";

export const sections = [
  "topWeekday",
  "bestDaypart",
  "worstDaypart",
  "energySummary",
  "hasAttributes",
  "weekdayTotal",
  "stepOf",
  "heatmapBands",
] as const;

type DaypartRating = ReturnType<typeof satisfactionByDaypart>[number];
type Daypart = DaypartRating["daypart"];
type DeepWorkShare = ReturnType<typeof deepWorkShare>;

const DAYPARTS: Daypart[] = ["morning", "midday", "evening", "night"];

// --- Inputs ----------------------------------------------------------------------------

/** Seven Monday-first weekday rows from per-weekday totals (dayCount 1 unless given), as byWeekday builds them. */
function weekdays(totals: Ms[], dayCounts: number[] = totals.map(() => 1)): WeekdayUsage[] {
  return totals.map((totalMs, weekday) => ({
    weekday,
    totalMs,
    avgMs: dayCounts[weekday] > 0 ? totalMs / dayCounts[weekday] : 0,
    dayCount: dayCounts[weekday],
  }));
}

/** The four dayparts in DAYPARTS order from [mean, n] pairs (ms = n hours). */
function dayparts(parts: [number, number][]): DaypartRating[] {
  return parts.map(([mean, n], i) => ({ daypart: DAYPARTS[i], agg: { mean, n, ms: n * HOUR } }));
}

/** An energy day load (weighted = rated × mean). */
function load(dayMs: Ms, ratedMs: Ms, totalMs: Ms, mean: number): EnergyDayLoad {
  return { dayMs, weightedMs: ratedMs * mean, ratedMs, totalMs };
}

/** The real tab inputs of one scenario. */
function scenarioInputs(s: ScenarioCase) {
  const occurrences = s.spans.map(toOccurrence);
  return {
    weekdays: byWeekday(occurrences, s.days, s.window, s.zone),
    dayparts: satisfactionByDaypart(occurrences, s.window, s.zone),
    energy: energyLoadPerDay(occurrences, s.days, s.window),
    deep: deepWorkShare(occurrences, s.window),
    heatmap: hourHeatmap(occurrences, s.window, s.zone),
  };
}

const D0 = Date.UTC(2026, 5, 1);

// --- Sections ---------------------------------------------------------------------------

function topWeekdayCases(matrix: ScenarioCase[]): Case[] {
  const c = (name: string, rows: WeekdayUsage[]): Case => ({ name, input: { rows }, expected: topWeekday(rows) });
  const cases = [
    c("single peak on Thursday", weekdays([1, 2, 3, 9, 4, 0, 0].map((h) => h * HOUR))),
    c("all zero: Monday", weekdays([0, 0, 0, 0, 0, 0, 0])),
    c("tie between Tuesday and Friday: Tuesday wins", weekdays([1, 5, 2, 3, 5, 1, 0].map((h) => h * HOUR))),
    c("tie on Monday and Sunday: Monday wins", weekdays([4, 1, 1, 1, 1, 1, 4].map((h) => h * HOUR))),
    c(
      "the average decides, not the total",
      weekdays([10 * HOUR, 3 * HOUR, HOUR, HOUR, HOUR, HOUR, HOUR], [5, 1, 1, 1, 1, 1, 1]),
    ),
    c(
      "fractional averages a hair apart",
      weekdays([10 * HOUR, 10 * HOUR + 1, HOUR, 0, 0, 0, 0], [3, 3, 3, 3, 3, 2, 2]),
    ),
    c("Sunday only", weekdays([0, 0, 0, 0, 0, 0, 30 * MINUTE])),
  ];
  for (const s of matrix) cases.push(c(s.label, scenarioInputs(s).weekdays));
  return cases;
}

function daypartRows(): [string, DaypartRating[]][] {
  return [
    ["none rated", dayparts([[0, 0], [0, 0], [0, 0], [0, 0]])],
    ["all below the minimum (n = 4)", dayparts([[3.5, 4], [2, 4], [4, 4], [1, 4]])],
    ["a single part at exactly n = 5", dayparts([[3.2, 5], [2, 4], [4, 4], [0, 0]])],
    ["two rated parts", dayparts([[3.2, 5], [2.8, 6], [4, 4], [0, 0]])],
    ["all rated, distinct means", dayparts([[3.1, 7], [2.4, 9], [3.8, 5], [1.9, 12]])],
    ["tie for best: the first wins", dayparts([[3.5, 5], [3.5, 8], [2, 6], [1, 4]])],
    ["tie for worst: the first wins", dayparts([[3.5, 5], [2, 8], [2, 6], [3, 4]])],
    ["all rated parts equal", dayparts([[3, 5], [3, 5], [3, 5], [3, 5]])],
    ["an unrated part with a higher mean is skipped", dayparts([[2, 5], [4, 4], [1.5, 6], [0, 0]])],
  ];
}

function bestDaypartCases(matrix: ScenarioCase[]): Case[] {
  const c = (name: string, rows: DaypartRating[]): Case => ({ name, input: { rows }, expected: bestDaypart(rows) });
  const cases = daypartRows().map(([name, rows]) => c(name, rows));
  for (const s of matrix) cases.push(c(s.label, scenarioInputs(s).dayparts));
  return cases;
}

function worstDaypartCases(matrix: ScenarioCase[]): Case[] {
  const c = (name: string, rows: DaypartRating[]): Case => ({ name, input: { rows }, expected: worstDaypart(rows) });
  const cases = daypartRows().map(([name, rows]) => c(name, rows));
  for (const s of matrix) cases.push(c(s.label, scenarioInputs(s).dayparts));
  return cases;
}

function energySummaryCases(matrix: ScenarioCase[]): Case[] {
  const c = (name: string, days: EnergyDayLoad[]): Case => ({ name, input: { days }, expected: energySummary(days) });
  const cases = [
    c("no days", []),
    c("no ratings", [load(D0, 0, 3 * HOUR, 0), load(D0 + 86_400_000, 0, 2 * HOUR, 0)]),
    c("fully rated", [load(D0, 2 * HOUR, 2 * HOUR, 3)]),
    c("coverage 12.5% rounds up to 13", [load(D0, HOUR, 8 * HOUR, 2)]),
    c("coverage 37.5% rounds up to 38", [load(D0, 3 * HOUR, 8 * HOUR, 4)]),
    c("coverage 62.5% rounds up to 63", [load(D0, 5 * HOUR, 8 * HOUR, 1)]),
    c("coverage just under .5 rounds down", [load(D0, HOUR - 1, 8 * HOUR, 2)]),
    c("weighted mean across days", [load(D0, 2 * HOUR, 5 * HOUR, 4), load(D0 + 86_400_000, 3 * HOUR, 3 * HOUR, 1)]),
    c("ratings without tracked total", [load(D0, HOUR, 0, 3)]),
  ];
  // The .5 cases must really sit on .5, or they test nothing.
  for (const [rated, total] of [[1, 8], [3, 8], [5, 8]]) {
    if ((((rated * HOUR) / (total * HOUR)) * 100) % 1 !== 0.5) {
      throw new Error(`selectors-patterns: ${rated}/${total} is not an exact .5 coverage`);
    }
  }
  for (const s of matrix) cases.push(c(s.label, scenarioInputs(s).energy));
  return cases;
}

function hasAttributesCases(matrix: ScenarioCase[]): Case[] {
  const deepOf = (deepMs: Ms | null, shallowMs = 0): DeepWorkShare =>
    deepMs === null
      ? { deepMs: 0, shallowMs: 0, unratedMs: 2 * HOUR, share: null }
      : { deepMs, shallowMs, unratedMs: HOUR, share: deepMs / (deepMs + shallowMs) };
  const bestOf = (rated: boolean): DaypartRating | null =>
    rated ? { daypart: "midday", agg: { mean: 3.4, n: 6, ms: 6 * HOUR } } : null;
  const energyOf = (rated: boolean): EnergySummary =>
    rated
      ? { meanEnergy: 2.5, ratedMs: 2 * HOUR, totalMs: 4 * HOUR, coveragePct: 50 }
      : { meanEnergy: null, ratedMs: 0, totalMs: 4 * HOUR, coveragePct: null };
  const c = (name: string, deep: DeepWorkShare, best: DaypartRating | null, energy: EnergySummary): Case => ({
    name,
    input: { deep, best, energy },
    expected: hasAttributes(deep, best, energy),
  });
  const cases: Case[] = [];
  for (const d of [false, true]) {
    for (const b of [false, true]) {
      for (const e of [false, true]) {
        const name = `deep ${d ? "rated" : "none"}, best ${b ? "set" : "none"}, energy ${e ? "rated" : "none"}`;
        cases.push(c(name, deepOf(d ? 3 * HOUR : null, 2 * HOUR), bestOf(b), energyOf(e)));
      }
    }
  }
  cases.push(c("a deep share of exactly 0 still counts", deepOf(0, 4 * HOUR), null, energyOf(false)));
  for (const s of matrix) {
    const inputs = scenarioInputs(s);
    cases.push(c(s.label, inputs.deep, bestDaypart(inputs.dayparts), energySummary(inputs.energy)));
  }
  return cases;
}

function weekdayTotalCases(matrix: ScenarioCase[]): Case[] {
  const c = (name: string, rows: WeekdayUsage[]): Case => ({ name, input: { rows }, expected: weekdayTotal(rows) });
  const cases = [
    c("all zero", weekdays([0, 0, 0, 0, 0, 0, 0])),
    c("sums totals, not averages", weekdays([HOUR, 2 * HOUR, 0, 0, 0, 0, 3 * HOUR], [2, 1, 1, 1, 1, 1, 3])),
  ];
  for (const s of matrix) cases.push(c(s.label, scenarioInputs(s).weekdays));
  return cases;
}

function stepOfCases(): Case[] {
  const values: [string, Ms][] = [
    ["negative", -1],
    ["0", 0],
    ["1 ms", 1],
    ["29:59.999", 30 * MINUTE - 1],
    ["30:00", 30 * MINUTE],
    ["59:59.999", 60 * MINUTE - 1],
    ["60:00", 60 * MINUTE],
    ["119:59.999", 120 * MINUTE - 1],
    ["120:00", 120 * MINUTE],
    ["a whole band (4 h)", 4 * HOUR],
    ["a week", 7 * 24 * HOUR],
  ];
  return values.map(([name, ms]) => ({ name, input: { ms }, expected: stepOf(ms) }));
}

function heatmapBandsCases(matrix: ScenarioCase[]): Case[] {
  const c = (name: string, cells: HeatmapCell[]): Case => ({
    name,
    input: { cells: cells.map((x) => x.ms) },
    expected: heatmapBands(cells),
  });
  const grid = (fill: (weekday: number, hour: number) => Ms): HeatmapCell[] =>
    Array.from({ length: 7 * 24 }, (_, i) => {
      const weekday = Math.floor(i / 24);
      const hour = i % 24;
      return { weekday, hour, ms: fill(weekday, hour) };
    });
  const BERLIN = "Europe/Berlin";
  // Sun 25 Oct 2026, 01:30–03:30 CEST/CET: 02:00–03:00 local happens twice.
  const repeated = [span({ key: "fallback", start: wall(BERLIN, "2026-10-25T01:30"), end: Date.UTC(2026, 9, 25, 2, 30) })];
  const repeatedWindow = { start: wall(BERLIN, "2026-10-19T00:00"), end: wall(BERLIN, "2026-10-26T00:00") };
  const cases = [
    c("all zero", grid(() => 0)),
    c("band edges: hours 3 and 4 fall in different bands", grid((w, h) => (w === 2 && (h === 3 || h === 4) ? (h + 1) * MINUTE : 0))),
    c("every cell distinct", grid((w, h) => w * 24 * MINUTE + h * MINUTE + 1)),
    c("last band of Sunday", grid((w, h) => (w === 6 && h >= 20 ? 45 * MINUTE : 0))),
    c(
      "Berlin repeated hour counts twice",
      hourHeatmap(repeated.map(toOccurrence), repeatedWindow, BERLIN).cells,
    ),
  ];
  for (const s of matrix) cases.push(c(s.label, scenarioInputs(s).heatmap.cells));
  return cases;
}

export function build(): Record<(typeof sections)[number], Case[]> {
  const matrix = scenarioMatrix();
  return {
    topWeekday: topWeekdayCases(matrix),
    bestDaypart: bestDaypartCases(matrix),
    worstDaypart: worstDaypartCases(matrix),
    energySummary: energySummaryCases(matrix),
    hasAttributes: hasAttributesCases(matrix),
    weekdayTotal: weekdayTotalCases(matrix),
    stepOf: stepOfCases(),
    heatmapBands: heatmapBandsCases(matrix),
  };
}
