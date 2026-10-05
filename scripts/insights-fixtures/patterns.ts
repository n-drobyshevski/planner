/**
 * Insights fixtures, area "patterns" (owner: A2): lib/analytics/patterns.ts,
 * the weekday profile, the weekday×hour heatmap and fragmentation.
 *
 * ```ts
 * sections: {
 *   byWeekday: {
 *     name; input: { spans: SpanJson[]; days: Ms[]; window: WindowJson; zone: Zone };
 *     expected: { weekday: number; totalMs: Ms; avgMs: number; dayCount: number }[];   // 7 rows, Monday first
 *   }[];
 *   hourHeatmap: {
 *     name; input: { spans: SpanJson[]; window: WindowJson; zone: Zone };
 *     expected: { cells: Ms[]; maxMs: Ms };   // compact: cells[weekday * 24 + hour] is that cell's ms (168)
 *   }[];
 *   fragmentation: {
 *     name; input: { spans: SpanJson[]; window: WindowJson; zone: Zone };
 *     expected: {
 *       blockCount: number; avgBlockMs: number | null; medianBlockMs: number | null;
 *       longestBlockMs: Ms | null; shortBlockShare: number | null; avgGapMs: number | null;
 *     };
 *   }[];
 *   nextHourBoundary: { name; input: { ms: Ms; zone: Zone }; expected: Ms }[];
 * }
 * ```
 *
 * Seeds: every `it` of test/analytics/patterns.test.ts ("<describe> / <it>").
 * Added: DST nights (Berlin and LA, both directions; the Berlin repeated hour
 * accumulates twice into one heatmap cell), the America/Santiago day that
 * starts at 01:00, Kolkata's half-hour offset, window clipping, even medians.
 * Matrix: `scenarioMatrix()` below (every zone; 14 days around each DST
 * transition, the Santiago midnight gap included; 90 days for Kolkata and
 * Moscow), shared with the correlations area.
 *
 * `nextHourBoundary` is private in patterns.ts. Its section mirrors that
 * function (local minute and second plus `ms % 1000`) and cross-checks every
 * value against the real `hourHeatmap`, whose first slice ends exactly there
 * whenever the next local hour has a different label.
 */
import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import { byWeekday, fragmentation, hourHeatmap } from "@/lib/analytics/patterns";
import { filterForInsights } from "@/lib/insights/filters";
import { resolvePeriod, type PeriodPreset } from "@/lib/insights/period";
import {
  DAY,
  HOUR,
  MINUTE,
  addDate,
  crossesHostileTransition,
  dayStart,
  parseSpan,
  scenario,
  span,
  toOccurrence,
  wall,
  type Case,
  type Ms,
  type SpanJson,
  type WindowJson,
  type Zone,
} from "./shared";

export const sections = ["byWeekday", "hourHeatmap", "fragmentation", "nextHourBoundary"] as const;

// --- Shared with the correlations area ------------------------------------------------

/** One matrix entry: viewer-scoped scenario spans over a window and its local days. */
export interface ScenarioCase {
  label: string;
  zone: Zone;
  window: WindowJson;
  days: Ms[];
  spans: SpanJson[];
}

/** Largest span list a matrix case carries (§C.5 size budget). */
const MAX_SCENARIO_SPANS = 120;

const MATRIX: { zone: Zone; first: string; days: number; seed: number; label: string }[] = [
  { zone: "UTC", first: "2026-06-08", days: 14, seed: 201, label: "14 days" },
  { zone: "Europe/Berlin", first: "2026-03-23", days: 14, seed: 202, label: "spring-forward fortnight" },
  { zone: "Europe/Berlin", first: "2026-10-19", days: 14, seed: 203, label: "fall-back fortnight" },
  { zone: "America/Los_Angeles", first: "2026-03-02", days: 14, seed: 204, label: "spring-forward fortnight" },
  { zone: "America/Los_Angeles", first: "2026-10-26", days: 14, seed: 205, label: "fall-back fortnight" },
  { zone: "Asia/Kolkata", first: "2026-06-08", days: 14, seed: 206, label: "14 days" },
  { zone: "Asia/Kolkata", first: "2026-01-05", days: 90, seed: 207, label: "90 days" },
  { zone: "Europe/Moscow", first: "2026-03-23", days: 14, seed: 208, label: "14 days" },
  { zone: "Europe/Moscow", first: "2026-04-06", days: 90, seed: 209, label: "90 days" },
  { zone: "America/Santiago", first: "2026-08-31", days: 14, seed: 210, label: "midnight-gap fortnight" },
];

/** The custom-range period of `days` local days from `first`, via the real resolvePeriod. */
export function customPeriod(zone: Zone, first: string, days: number): { window: WindowJson; days: Ms[] } {
  const last = addDate(first, days - 1);
  // resolvePeriod also derives the previous window (as long again, right before).
  if (crossesHostileTransition(zone, addDate(first, -days), addDate(last, 1))) {
    throw new Error(`customPeriod: ${zone} ${first} +${days}d crosses a hostile transition`);
  }
  const p = resolvePeriod(
    { preset: "custom", customFrom: dayStart(zone, first), customTo: dayStart(zone, last), granularity: "day" },
    { timeZone: zone, now: dayStart(zone, first) },
  );
  return { window: p.window, days: p.days };
}

/** A preset's period at `now` (window and days only). */
export function presetPeriod(zone: Zone, preset: PeriodPreset, now: Ms): { window: WindowJson; days: Ms[] } {
  const p = resolvePeriod({ preset, granularity: "day" }, { timeZone: zone, now });
  return { window: p.window, days: p.days };
}

/**
 * The scenario matrix: per entry, `scenario()` spans from the day before the
 * window to the day after it (so spans cross both edges), scoped like the tabs
 * (`filterForInsights`, viewer "me", inactive kept so the correlations skip is
 * exercised), thinned evenly to at most MAX_SCENARIO_SPANS.
 */
export function scenarioMatrix(): ScenarioCase[] {
  return MATRIX.map(({ zone, first, days, seed, label }) => {
    const period = customPeriod(zone, first, days);
    const raw = scenario({ zone, firstDay: addDate(first, -1), days: days + 2, seed });
    const kept = new Set(
      filterForInsights(raw.map(toOccurrence), {
        viewerId: "me",
        hiddenCategoryIds: new Set<string>(),
        includeInactive: true,
      }).map((o) => o.key),
    );
    const scoped = raw.filter((s) => kept.has(s.key));
    const stride = Math.ceil(scoped.length / MAX_SCENARIO_SPANS);
    const spans = scoped.filter((_, i) => i % stride === 0);
    return { label: `scenario ${zone} ${label} from ${first}`, zone, ...period, spans };
  });
}

// --- Seeds: test/analytics/patterns.test.ts --------------------------------------------

// Mon 1 Jun 2026 UTC.
const T0 = Date.UTC(2026, 5, 1);
const UTC = "UTC";
const BERLIN = "Europe/Berlin";

/** patterns.test.ts `occ()` defaults, as a SpanJson. */
function occ(over: Partial<SpanJson> = {}): SpanJson {
  return span({ key: "e:0", eventId: "e", title: "t", start: T0 + 9 * HOUR, end: T0 + 10 * HOUR, ...over });
}

const days = (n: number) => Array.from({ length: n }, (_, i) => T0 + i * DAY);
const win = (n: number): WindowJson => ({ start: T0, end: T0 + n * DAY });

// --- Case builders ------------------------------------------------------------------------

function weekdayCase(name: string, spans: SpanJson[], dayList: Ms[], window: WindowJson, zone: Zone): Case {
  return {
    name,
    input: { spans, days: dayList, window, zone },
    expected: byWeekday(spans.map(toOccurrence), dayList, window, zone),
  };
}

function heatmapCase(name: string, spans: SpanJson[], window: WindowJson, zone: Zone): Case {
  const h = hourHeatmap(spans.map(toOccurrence), window, zone);
  return { name, input: { spans, window, zone }, expected: { cells: h.cells.map((c) => c.ms), maxMs: h.maxMs } };
}

function fragmentationCase(name: string, spans: SpanJson[], window: WindowJson, zone: Zone): Case {
  return { name, input: { spans, window, zone }, expected: fragmentation(spans.map(toOccurrence), window, zone) };
}

/** patterns.ts `nextHourBoundary` (private there), mirrored. */
function nextHourBoundary(ms: Ms, zone: Zone): Ms {
  const ctx = tz(zone);
  const minute = Number(format(ms, "m", { in: ctx }));
  const second = Number(format(ms, "s", { in: ctx }));
  const intoHour = minute * 60_000 + second * 1000 + (ms % 1000);
  return ms + (HOUR - intoHour);
}

function boundaryCase(name: string, ms: Ms, zone: Zone): Case {
  const expected = nextHourBoundary(ms, zone);
  // Cross-check with the real slicing: a span [ms, ms + 2h) puts exactly
  // `expected - ms` into the start cell when the next hour's label differs.
  const ctx = tz(zone);
  const hourOf = (x: Ms) => Number(format(x, "H", { in: ctx }));
  if (hourOf(expected) !== hourOf(ms)) {
    const weekday = Number(format(ms, "i", { in: ctx })) - 1;
    const cells = hourHeatmap(
      [toOccurrence(span({ key: "probe", start: ms, end: ms + 2 * HOUR }))],
      { start: ms, end: ms + 2 * HOUR },
      zone,
    ).cells;
    const got = cells[weekday * 24 + hourOf(ms)].ms;
    if (got !== expected - ms) {
      throw new Error(`nextHourBoundary mirror disagrees with hourHeatmap for ${name}: ${expected - ms} vs ${got}`);
    }
  }
  return { name, input: { ms, zone }, expected };
}

// --- Hand cases -----------------------------------------------------------------------------

/** One local day (its own window) in `zone`. */
export function dayWindow(zone: Zone, date: string): WindowJson {
  return { start: dayStart(zone, date), end: dayStart(zone, addDate(date, 1)) };
}

// DST stress spans (built from UTC so skipped and repeated hours are unambiguous).
const BERLIN_SPRING = span({ key: "spring", start: Date.UTC(2026, 2, 29, 0, 30), end: Date.UTC(2026, 2, 29, 1, 30) });
// 2026-10-25 01:30 CEST → 03:30 CET: local 02:xx happens twice.
const BERLIN_FALL = span({ key: "fall", start: Date.UTC(2026, 9, 24, 23, 30), end: Date.UTC(2026, 9, 25, 2, 30) });
// 2026-03-08 01:30 PST → 03:30 PDT.
const LA_SPRING = span({ key: "spring", start: Date.UTC(2026, 2, 8, 9, 30), end: Date.UTC(2026, 2, 8, 10, 30) });
// 2026-11-01 00:30 PDT → 02:30 PST: local 01:xx happens twice.
const LA_FALL = span({ key: "fall", start: Date.UTC(2026, 10, 1, 7, 30), end: Date.UTC(2026, 10, 1, 10, 30) });
// 2026-09-05 23:30 (−04) → 2026-09-06 01:30 (−03): local midnight never happens.
const SANTIAGO_GAP = span({ key: "gap", start: Date.UTC(2026, 8, 6, 3, 30), end: Date.UTC(2026, 8, 6, 4, 30) });

const LA = "America/Los_Angeles";
const SANTIAGO = "America/Santiago";
const KOLKATA = "Asia/Kolkata";

function weekdayCases(matrix: ScenarioCase[]): Case[] {
  const cases: Case[] = [
    weekdayCase(
      "byWeekday / returns 7 Monday-first entries with totals on the right weekday",
      [
        occ({ start: T0 + 9 * HOUR, end: T0 + 11 * HOUR }),
        occ({ key: "b", start: T0 + 2 * DAY + 9 * HOUR, end: T0 + 2 * DAY + 10 * HOUR }),
      ],
      days(7),
      win(7),
      UTC,
    ),
    weekdayCase(
      "byWeekday / averages per occurrence-day so uneven ranges stay fair",
      [
        occ({ start: T0 + 9 * HOUR, end: T0 + 12 * HOUR }),
        occ({ key: "b", start: T0 + 7 * DAY + 9 * HOUR, end: T0 + 7 * DAY + 10 * HOUR }),
      ],
      days(8),
      win(8),
      UTC,
    ),
    weekdayCase(
      "byWeekday / counts zero-day weekdays as zero average (empty window slice)",
      [],
      days(2),
      win(2),
      UTC,
    ),
    weekdayCase("no days at all", [occ()], [], win(1), UTC),
    weekdayCase(
      "spans outside the window and across its edges are clipped",
      [
        occ({ key: "before", start: T0 - 3 * HOUR, end: T0 - HOUR }),
        occ({ key: "edge-in", start: T0 - HOUR, end: T0 + 2 * HOUR }),
        occ({ key: "edge-out", start: T0 + 3 * DAY - HOUR, end: T0 + 3 * DAY + 5 * HOUR }),
        occ({ key: "after", start: T0 + 4 * DAY, end: T0 + 4 * DAY + HOUR }),
      ],
      days(3),
      win(3),
      UTC,
    ),
  ];
  const fallWeek = presetPeriod(BERLIN, "this-week", wall(BERLIN, "2026-10-25T12:00"));
  cases.push(
    weekdayCase(
      "Berlin fall-back week: the 25 h Sunday",
      [BERLIN_FALL, parseSpan(BERLIN, "2026-10-25T20:00/2026-10-26T01:00", { key: "late" })],
      fallWeek.days,
      fallWeek.window,
      BERLIN,
    ),
  );
  const springWeek = presetPeriod(BERLIN, "this-week", wall(BERLIN, "2026-03-29T12:00"));
  cases.push(
    weekdayCase(
      "Berlin spring-forward week: the 23 h Sunday",
      [BERLIN_SPRING, parseSpan(BERLIN, "2026-03-29T00:00/2026-03-30T00:00", { key: "whole" })],
      springWeek.days,
      springWeek.window,
      BERLIN,
    ),
  );
  const gapWeek = presetPeriod(SANTIAGO, "this-week", wall(SANTIAGO, "2026-09-06T12:00"));
  cases.push(
    weekdayCase(
      "Santiago: the Sunday that starts at 01:00",
      [SANTIAGO_GAP, parseSpan(SANTIAGO, "2026-09-06T01:00/03:00", { key: "early" })],
      gapWeek.days,
      gapWeek.window,
      SANTIAGO,
    ),
  );
  const kolkata = customPeriod(KOLKATA, "2026-06-08", 10);
  cases.push(
    weekdayCase(
      "Kolkata: a 10-day range covers Monday to Wednesday twice",
      [
        parseSpan(KOLKATA, "2026-06-08T23:30/2026-06-09T00:30", { key: "a" }),
        parseSpan(KOLKATA, "2026-06-15T09:15/11:45", { key: "b" }),
        parseSpan(KOLKATA, "2026-06-17T05:30/06:00", { key: "c" }),
      ],
      kolkata.days,
      kolkata.window,
      KOLKATA,
    ),
  );
  for (const s of matrix) cases.push(weekdayCase(s.label, s.spans, s.days, s.window, s.zone));
  return cases;
}

function heatmapCases(matrix: ScenarioCase[]): Case[] {
  const cases: Case[] = [
    heatmapCase(
      "hourHeatmap / attributes clipped slices to weekday×hour cells",
      [occ({ start: T0 + 9 * HOUR, end: T0 + 11 * HOUR + 30 * MINUTE })],
      win(7),
      UTC,
    ),
    heatmapCase(
      "hourHeatmap / accumulates the same weekday hour across weeks",
      [
        occ({ start: T0 + 9 * HOUR, end: T0 + 10 * HOUR }),
        occ({ key: "b", start: T0 + 7 * DAY + 9 * HOUR, end: T0 + 7 * DAY + 10 * HOUR }),
      ],
      win(14),
      UTC,
    ),
    heatmapCase("hourHeatmap / clips to the window", [occ({ start: T0 - HOUR, end: T0 + HOUR })], win(1), UTC),
    heatmapCase(
      "hourHeatmap / skips the lost DST hour in local labels (Berlin spring-forward)",
      [occ({ start: Date.UTC(2026, 2, 29, 0, 30), end: Date.UTC(2026, 2, 29, 1, 30) })],
      { start: Date.UTC(2026, 2, 28, 23), end: Date.UTC(2026, 2, 29, 22) },
      BERLIN,
    ),
    heatmapCase("empty input", [], win(7), UTC),
    heatmapCase(
      "Berlin fall-back: the repeated 02:xx hour accumulates twice into one cell",
      [BERLIN_FALL],
      dayWindow(BERLIN, "2026-10-25"),
      BERLIN,
    ),
    heatmapCase(
      "LA fall-back: the repeated 01:xx hour accumulates twice into one cell",
      [LA_FALL],
      dayWindow(LA, "2026-11-01"),
      LA,
    ),
    heatmapCase("LA spring-forward: 02:xx gets nothing", [LA_SPRING], dayWindow(LA, "2026-03-08"), LA),
    heatmapCase(
      "Santiago midnight gap: Saturday 23:xx, then Sunday 01:xx",
      [SANTIAGO_GAP, parseSpan(SANTIAGO, "2026-09-06T01:00/02:15", { key: "after" })],
      { start: dayStart(SANTIAGO, "2026-09-05"), end: dayStart(SANTIAGO, "2026-09-07") },
      SANTIAGO,
    ),
    heatmapCase(
      "Kolkata half-hour offset slices on local :00",
      [
        parseSpan(KOLKATA, "2026-06-10T09:15/11:45", { key: "a" }),
        parseSpan(KOLKATA, "2026-06-10T05:30/06:30", { key: "b" }),
      ],
      dayWindow(KOLKATA, "2026-06-10"),
      KOLKATA,
    ),
    heatmapCase(
      "Sunday night into Monday morning wraps the week; a zero-length span adds nothing",
      [occ({ start: T0 - HOUR, end: T0 + HOUR }), occ({ key: "b", start: T0 + 2 * HOUR + 1, end: T0 + 2 * HOUR + 1 })],
      { start: T0 - DAY, end: T0 + DAY },
      UTC,
    ),
    heatmapCase(
      "millisecond offsets inside an hour",
      [occ({ start: T0 + 9 * HOUR + 59 * MINUTE + 59_999, end: T0 + 10 * HOUR + 1 })],
      win(1),
      UTC,
    ),
  ];
  for (const s of matrix) cases.push(heatmapCase(s.label, s.spans, s.window, s.zone));
  return cases;
}

function fragmentationCases(matrix: ScenarioCase[]): Case[] {
  const cases: Case[] = [
    fragmentationCase(
      "fragmentation / merges overlapping/adjacent occurrences and measures gaps",
      [
        occ({ start: T0 + 9 * HOUR, end: T0 + 10 * HOUR }),
        occ({ key: "b", start: T0 + 10 * HOUR, end: T0 + 11 * HOUR }),
        occ({ key: "c", start: T0 + 13 * HOUR, end: T0 + 13 * HOUR + 20 * MINUTE }),
      ],
      win(1),
      UTC,
    ),
    fragmentationCase(
      "fragmentation / splits blocks at local midnight (no cross-day gaps)",
      [occ({ start: T0 + 23 * HOUR, end: T0 + DAY + HOUR })],
      win(2),
      UTC,
    ),
    fragmentationCase(
      "fragmentation / takes the odd median directly",
      [
        occ({ start: T0 + 1 * HOUR, end: T0 + 2 * HOUR }),
        occ({ key: "b", start: T0 + 4 * HOUR, end: T0 + 7 * HOUR }),
        occ({ key: "c", start: T0 + 9 * HOUR, end: T0 + 14 * HOUR }),
      ],
      win(1),
      UTC,
    ),
    fragmentationCase("fragmentation / returns nulls for an empty window", [], win(7), UTC),
    fragmentationCase(
      "even median averages the middle two (fractional ms)",
      [
        occ({ start: T0 + 1 * HOUR, end: T0 + 2 * HOUR }),
        occ({ key: "b", start: T0 + 3 * HOUR, end: T0 + 5 * HOUR + 1 }),
        occ({ key: "c", start: T0 + 6 * HOUR, end: T0 + 9 * HOUR }),
        occ({ key: "d", start: T0 + 10 * HOUR, end: T0 + 15 * HOUR }),
      ],
      win(1),
      UTC,
    ),
    fragmentationCase(
      "nested, overlapping and unsorted pieces merge into one block",
      [
        occ({ key: "c", start: T0 + 11 * HOUR + 30 * MINUTE, end: T0 + 13 * HOUR }),
        occ({ key: "b", start: T0 + 10 * HOUR, end: T0 + 11 * HOUR }),
        occ({ key: "a", start: T0 + 9 * HOUR, end: T0 + 12 * HOUR }),
        occ({ key: "d", start: T0 + 9 * HOUR, end: T0 + 9 * HOUR + 10 * MINUTE }),
      ],
      win(1),
      UTC,
    ),
    fragmentationCase(
      "gaps are per day; short blocks are strictly under 30 minutes",
      [
        occ({ start: T0 + 9 * HOUR, end: T0 + 9 * HOUR + 30 * MINUTE }),
        occ({ key: "b", start: T0 + 10 * HOUR, end: T0 + 10 * HOUR + 30 * MINUTE - 1 }),
        occ({ key: "c", start: T0 + DAY + 8 * HOUR, end: T0 + DAY + 9 * HOUR }),
        occ({ key: "d", start: T0 + DAY + 17 * HOUR, end: T0 + DAY + 18 * HOUR }),
      ],
      win(2),
      UTC,
    ),
    fragmentationCase(
      "clipped at both window edges; zero-length and outside spans add nothing",
      [
        occ({ key: "a", start: T0 - 2 * HOUR, end: T0 + HOUR }),
        occ({ key: "b", start: T0 + DAY - HOUR, end: T0 + DAY + 2 * HOUR }),
        occ({ key: "c", start: T0 + 5 * HOUR, end: T0 + 5 * HOUR }),
        occ({ key: "d", start: T0 + 2 * DAY, end: T0 + 2 * DAY + HOUR }),
      ],
      win(1),
      UTC,
    ),
    fragmentationCase(
      "Berlin fall-back: a block across the 25 h day's midnight splits there",
      [BERLIN_FALL, parseSpan(BERLIN, "2026-10-24T22:00/2026-10-25T01:00", { key: "eve" })],
      { start: dayStart(BERLIN, "2026-10-24"), end: dayStart(BERLIN, "2026-10-26") },
      BERLIN,
    ),
    fragmentationCase(
      "Santiago: the split falls on the 01:00 day start",
      [SANTIAGO_GAP, parseSpan(SANTIAGO, "2026-09-06T03:00/04:00", { key: "later" })],
      { start: dayStart(SANTIAGO, "2026-09-05"), end: dayStart(SANTIAGO, "2026-09-07") },
      SANTIAGO,
    ),
    fragmentationCase(
      "Kolkata: local midnight is 18:30 UTC",
      [span({ key: "a", start: Date.UTC(2026, 5, 9, 18), end: Date.UTC(2026, 5, 9, 19) })],
      { start: dayStart(KOLKATA, "2026-06-09"), end: dayStart(KOLKATA, "2026-06-11") },
      KOLKATA,
    ),
  ];
  for (const s of matrix) cases.push(fragmentationCase(s.label, s.spans, s.window, s.zone));
  return cases;
}

function boundaryCases(): Case[] {
  const cases: Case[] = [];
  const stress: [string, Zone, SpanJson][] = [
    ["Berlin spring", BERLIN, BERLIN_SPRING],
    ["Berlin fall", BERLIN, BERLIN_FALL],
    ["LA spring", LA, LA_SPRING],
    ["LA fall", LA, LA_FALL],
    ["Santiago gap", SANTIAGO, SANTIAGO_GAP],
  ];
  for (const [label, zone, s] of stress) {
    cases.push(boundaryCase(`${label} stress start`, s.start, zone));
    cases.push(boundaryCase(`${label} stress end`, s.end, zone));
    cases.push(boundaryCase(`${label} stress start, in UTC`, s.start, UTC));
  }
  // Inside the repeated hours: 02:30 CEST and 02:30 CET; LA 01:30 PDT and 01:30 PST.
  cases.push(boundaryCase("Berlin 02:30 CEST (first pass)", Date.UTC(2026, 9, 25, 0, 30), BERLIN));
  cases.push(boundaryCase("Berlin 02:30 CET (second pass)", Date.UTC(2026, 9, 25, 1, 30), BERLIN));
  cases.push(boundaryCase("Berlin 02:59:59.999 CEST", Date.UTC(2026, 9, 25, 0, 59, 59, 999), BERLIN));
  cases.push(boundaryCase("Berlin 01:59:59.999 before spring-forward", Date.UTC(2026, 2, 29, 0, 59, 59, 999), BERLIN));
  cases.push(boundaryCase("LA 01:30 PDT (first pass)", Date.UTC(2026, 10, 1, 8, 30), LA));
  cases.push(boundaryCase("LA 01:30 PST (second pass)", Date.UTC(2026, 10, 1, 9, 30), LA));
  cases.push(boundaryCase("Santiago 23:59:59.999 before the gap", Date.UTC(2026, 8, 6, 3, 59, 59, 999), SANTIAGO));
  cases.push(boundaryCase("Santiago 01:00 day start", Date.UTC(2026, 8, 6, 4), SANTIAGO));
  // Fractional offsets: local :00 is UTC :30 (Kolkata) or :15 (Kathmandu).
  for (const [label, ms] of [
    ["09:15:30.250", wall(KOLKATA, "2026-06-10T09:15") + 30_250],
    ["exact 10:00", wall(KOLKATA, "2026-06-10T10:00")],
    ["10:30 (UTC :00)", wall(KOLKATA, "2026-06-10T10:30")],
    ["23:59:59.999", wall(KOLKATA, "2026-06-10T23:59") + 59_999],
  ] as const) {
    cases.push(boundaryCase(`Kolkata ${label}`, ms, KOLKATA));
  }
  cases.push(boundaryCase("Kathmandu 09:50 (UTC 04:05)", Date.UTC(2026, 5, 10, 4, 5), "Asia/Kathmandu"));
  cases.push(boundaryCase("Moscow 12:00:00.001", wall("Europe/Moscow", "2026-06-10T12:00") + 1, "Europe/Moscow"));
  cases.push(boundaryCase("UTC exact hour", T0 + 9 * HOUR, UTC));
  cases.push(boundaryCase("UTC one ms before the hour", T0 + 10 * HOUR - 1, UTC));
  return cases;
}

export function build(): Record<(typeof sections)[number], Case[]> {
  const matrix = scenarioMatrix();
  return {
    byWeekday: weekdayCases(matrix),
    hourHeatmap: heatmapCases(matrix),
    fragmentation: fragmentationCases(matrix),
    nextHourBoundary: boundaryCases(),
  };
}
