/**
 * Insights fixtures, area "correlations" (owner: A2): lib/analytics/correlations.ts,
 * the attribute lenses (satisfaction, energy, focus) of the Patterns tab.
 *
 * ```ts
 * type RatedAggregate = { mean: number; n: number; ms: Ms };
 * type Daypart = "morning" | "midday" | "evening" | "night";
 * sections: {
 *   satisfactionByCategory: {
 *     name; input: { spans: SpanJson[]; window: WindowJson };
 *     expected: { categoryId: string | null; agg: RatedAggregate }[];   // n ≥ 5 only, mean descending
 *   }[];
 *   energyLoadPerDay: {
 *     name; input: { spans: SpanJson[]; days: Ms[]; window: WindowJson };
 *     expected: { dayMs: Ms; weightedMs: Ms; ratedMs: Ms; totalMs: Ms }[];   // one per day
 *   }[];
 *   deepWorkShare: {
 *     name; input: { spans: SpanJson[]; window: WindowJson };
 *     expected: { deepMs: Ms; shallowMs: Ms; unratedMs: Ms; share: number | null };
 *   }[];
 *   satisfactionByDaypart: {
 *     name; input: { spans: SpanJson[]; window: WindowJson; zone: Zone };
 *     expected: { daypart: Daypart; agg: RatedAggregate }[];   // all 4, in DAYPARTS order
 *   }[];
 * }
 * ```
 *
 * Seeds: every `it` of test/analytics/correlations.test.ts ("<describe> / <it>";
 * an `it` asserting two calls becomes two cases). Added: equal-mean ties (span
 * order wins), junk attribute values (dropped by the parser), DST nights in
 * Berlin and LA, the America/Santiago midnight gap, Kolkata's half-hour
 * offset, daypart edges. Matrix: the patterns area's `scenarioMatrix()` (every
 * zone; inactive sleep blocks kept, so the inactive skip is exercised).
 */
import {
  deepWorkShare,
  energyLoadPerDay,
  satisfactionByCategory,
  satisfactionByDaypart,
} from "@/lib/analytics/correlations";
import { customPeriod, dayWindow, presetPeriod, scenarioMatrix, type ScenarioCase } from "./patterns";
import {
  DAY,
  HOUR,
  MINUTE,
  dayStart,
  parseSpan,
  span,
  toOccurrence,
  wall,
  type Case,
  type Ms,
  type SpanJson,
  type WindowJson,
  type Zone,
} from "./shared";

export const sections = [
  "satisfactionByCategory",
  "energyLoadPerDay",
  "deepWorkShare",
  "satisfactionByDaypart",
] as const;

// --- Seeds: test/analytics/correlations.test.ts ---------------------------------------

// Mon 1 Jun 2026 UTC.
const T0 = Date.UTC(2026, 5, 1);
const UTC = "UTC";
const BERLIN = "Europe/Berlin";
const LA = "America/Los_Angeles";
const SANTIAGO = "America/Santiago";
const KOLKATA = "Asia/Kolkata";

let seq = 0;

/** correlations.test.ts `occ()` defaults, as a SpanJson (keys numbered per build). */
function occ(over: Partial<SpanJson> = {}): SpanJson {
  seq += 1;
  return span({ key: `k${seq}`, eventId: `e${seq}`, title: "Event", ownerId: "m1", start: T0, end: T0 + HOUR, ...over });
}

/** A rated occurrence (correlations.test.ts `rated()`). */
const rated = (satisfaction: number, over: Partial<SpanJson> = {}): SpanJson =>
  occ({ attributes: { satisfaction }, ...over });

const days = (n: number) => Array.from({ length: n }, (_, i) => T0 + i * DAY);
const win = (n: number): WindowJson => ({ start: T0, end: T0 + n * DAY });

// --- Case builders ------------------------------------------------------------------------

function categoryCase(name: string, spans: SpanJson[], window: WindowJson): Case {
  return { name, input: { spans, window }, expected: satisfactionByCategory(spans.map(toOccurrence), window) };
}

function energyCase(name: string, spans: SpanJson[], dayList: Ms[], window: WindowJson): Case {
  return {
    name,
    input: { spans, days: dayList, window },
    expected: energyLoadPerDay(spans.map(toOccurrence), dayList, window),
  };
}

function deepCase(name: string, spans: SpanJson[], window: WindowJson): Case {
  return { name, input: { spans, window }, expected: deepWorkShare(spans.map(toOccurrence), window) };
}

function daypartCase(name: string, spans: SpanJson[], window: WindowJson, zone: Zone): Case {
  return {
    name,
    input: { spans, window, zone },
    expected: satisfactionByDaypart(spans.map(toOccurrence), window, zone),
  };
}

// --- Sections ---------------------------------------------------------------------------------

function categoryCases(matrix: ScenarioCase[]): Case[] {
  const fiveOf = (categoryId: string | null, satisfaction: number, hour = 9) =>
    Array.from({ length: 5 }, (_, i) =>
      rated(satisfaction, {
        categoryId,
        start: T0 + i * DAY + hour * HOUR,
        end: T0 + i * DAY + (hour + 1) * HOUR,
      }),
    );
  const cases: Case[] = [
    categoryCase(
      "satisfactionByCategory / weights the mean by clipped duration, not by occurrence count",
      [
        ...Array.from({ length: 4 }, (_, i) =>
          rated(4, { categoryId: "catA", start: T0 + i * DAY + 9 * HOUR, end: T0 + i * DAY + 10 * HOUR }),
        ),
        rated(2, { categoryId: "catA", start: T0 + 4 * DAY + 9 * HOUR, end: T0 + 4 * DAY + 13 * HOUR }),
      ],
      win(7),
    ),
    categoryCase(
      "satisfactionByCategory / clips the weighting ms to the window",
      [
        ...Array.from({ length: 4 }, (_, i) =>
          rated(4, { categoryId: "catA", start: T0 + i * HOUR, end: T0 + (i + 1) * HOUR }),
        ),
        rated(1, { categoryId: "catA", start: T0 + DAY - HOUR, end: T0 + DAY + 2 * HOUR }),
      ],
      win(1),
    ),
    categoryCase(
      "satisfactionByCategory / drops categories under MIN_CATEGORY_RATINGS and unrated/inactive/outside occurrences",
      [
        ...fiveOf("catA", 2),
        ...fiveOf("catB", 4),
        ...fiveOf("catC", 4).slice(0, 4),
        occ({ categoryId: "catA" }),
        rated(4, { categoryId: "catA", inactive: true }),
        rated(4, { categoryId: "catA", start: T0 - 2 * HOUR, end: T0 - HOUR }),
      ],
      win(7),
    ),
    categoryCase(
      "equal means keep span order; uncategorized is its own row",
      [...fiveOf("catB", 3), ...fiveOf(null, 4, 11), ...fiveOf("catA", 3, 13)],
      win(7),
    ),
    categoryCase(
      "junk satisfaction values are dropped by the parser",
      [
        ...fiveOf("catA", 3).slice(0, 4),
        occ({ categoryId: "catA", attributes: { satisfaction: 5 } }),
        occ({ categoryId: "catA", attributes: { satisfaction: "3" } }),
        occ({ categoryId: "catA", attributes: { satisfaction: true } }),
        occ({ categoryId: "catA", attributes: { satisfaction: 2.5 } }),
        ...fiveOf("catB", 1),
        occ({ categoryId: "catB", attributes: { satisfaction: 4.0 }, start: T0 + 6 * DAY, end: T0 + 6 * DAY + 3 * HOUR }),
      ],
      win(7),
    ),
    categoryCase("empty input", [], win(7)),
  ];
  for (const s of matrix) cases.push(categoryCase(s.label, s.spans, s.window));
  return cases;
}

function energyCases(matrix: ScenarioCase[]): Case[] {
  const cases: Case[] = [
    energyCase(
      "energyLoadPerDay / weights rated ms by energy and keeps unrated ms in totalMs only",
      [
        occ({ attributes: { energy: 3 }, start: T0 + 9 * HOUR, end: T0 + 11 * HOUR }),
        occ({ attributes: { energy: 1 }, start: T0 + 12 * HOUR, end: T0 + 13 * HOUR }),
        occ({ start: T0 + 14 * HOUR, end: T0 + 15 * HOUR }),
      ],
      days(2),
      win(2),
    ),
    energyCase(
      "energyLoadPerDay / splits multi-day occurrences across day boundaries like computeUsage",
      [occ({ attributes: { energy: 2 }, start: T0 + 23 * HOUR, end: T0 + DAY + 2 * HOUR })],
      days(2),
      win(2),
    ),
    energyCase(
      "energyLoadPerDay / excludes inactive occurrences entirely",
      [occ({ attributes: { energy: 3 }, inactive: true, start: T0, end: T0 + 8 * HOUR })],
      days(1),
      win(1),
    ),
    energyCase(
      "junk energy counts as unrated; spans past the window end are clipped",
      [
        occ({ attributes: { energy: "high" }, start: T0 + 9 * HOUR, end: T0 + 10 * HOUR }),
        occ({ attributes: { energy: 4.0, satisfaction: 1 }, start: T0 + 10 * HOUR, end: T0 + 11 * HOUR }),
        occ({ attributes: { energy: 4 }, start: T0 + 2 * DAY - HOUR, end: T0 + 2 * DAY + HOUR }),
      ],
      days(2),
      win(2),
    ),
    energyCase("no days", [occ({ attributes: { energy: 2 } })], [], win(1)),
  ];
  const fall = presetPeriod(BERLIN, "this-week", wall(BERLIN, "2026-10-25T12:00"));
  cases.push(
    energyCase(
      "Berlin fall-back week: the 25 h Sunday",
      [
        span({ key: "fall", start: Date.UTC(2026, 9, 24, 23, 30), end: Date.UTC(2026, 9, 25, 2, 30), attributes: { energy: 3 } }),
        parseSpan(BERLIN, "2026-10-25T22:00/2026-10-26T02:00", { key: "late", attributes: { energy: 1 } }),
      ],
      fall.days,
      fall.window,
    ),
  );
  const gap = customPeriod(SANTIAGO, "2026-09-05", 2);
  cases.push(
    energyCase(
      "Santiago: the day that starts at 01:00",
      [
        span({ key: "gap", start: Date.UTC(2026, 8, 6, 3, 30), end: Date.UTC(2026, 8, 6, 4, 30), attributes: { energy: 4 } }),
      ],
      gap.days,
      gap.window,
    ),
  );
  for (const s of matrix) cases.push(energyCase(s.label, s.spans, s.days, s.window));
  return cases;
}

function deepCases(matrix: ScenarioCase[]): Case[] {
  const cases: Case[] = [
    deepCase(
      "deepWorkShare / splits clipped ms into deep / shallow / unrated and computes the share",
      [
        occ({ attributes: { focus: "deep" }, start: T0 + 9 * HOUR, end: T0 + 12 * HOUR }),
        occ({ attributes: { focus: "shallow" }, start: T0 + 13 * HOUR, end: T0 + 14 * HOUR }),
        occ({ start: T0 + 15 * HOUR, end: T0 + 17 * HOUR }),
        occ({ attributes: { focus: "deep" }, inactive: true, start: T0, end: T0 + 5 * HOUR }),
      ],
      win(1),
    ),
    deepCase(
      "deepWorkShare / returns a null share when no ms is focus-rated",
      [occ({ start: T0 + 9 * HOUR, end: T0 + 10 * HOUR })],
      win(1),
    ),
    deepCase("deepWorkShare / returns a null share when no ms is focus-rated (empty input)", [], win(1)),
    deepCase(
      "junk focus is unrated; only clipped ms count",
      [
        occ({ attributes: { focus: true }, start: T0 + 9 * HOUR, end: T0 + 10 * HOUR }),
        occ({ attributes: { focus: "Deep" }, start: T0 + 10 * HOUR, end: T0 + 11 * HOUR }),
        occ({ attributes: { focus: "shallow" }, start: T0 - HOUR, end: T0 + HOUR }),
        occ({ attributes: { focus: "deep" }, start: T0 + DAY - 20 * MINUTE, end: T0 + DAY + HOUR }),
        occ({ attributes: { focus: "deep" }, start: T0 + 2 * DAY, end: T0 + 2 * DAY + HOUR }),
      ],
      win(1),
    ),
    deepCase(
      "a share of exactly one third",
      [
        occ({ attributes: { focus: "deep" }, start: T0, end: T0 + HOUR }),
        occ({ attributes: { focus: "shallow" }, start: T0 + HOUR, end: T0 + 3 * HOUR }),
      ],
      win(1),
    ),
  ];
  for (const s of matrix) cases.push(deepCase(s.label, s.spans, s.window));
  return cases;
}

function daypartCases(matrix: ScenarioCase[]): Case[] {
  const springWindow: WindowJson = { start: Date.UTC(2026, 2, 28, 23), end: Date.UTC(2026, 2, 29, 22) };
  const cases: Case[] = [
    daypartCase("satisfactionByDaypart / always returns all 4 dayparts in display order, n possibly 0", [], win(1), UTC),
    daypartCase(
      "satisfactionByDaypart / attributes rated ms to dayparts by overlap, counting n once per touched part",
      [
        rated(4, { start: T0 + 11 * HOUR, end: T0 + 13 * HOUR }),
        rated(3, { start: T0 + 21 * HOUR, end: T0 + 23 * HOUR }),
      ],
      win(1),
      UTC,
    ),
    daypartCase(
      "satisfactionByDaypart / duration-weights the mean within a daypart and clips to the window",
      [rated(2, { start: T0 + 6 * HOUR, end: T0 + 9 * HOUR }), rated(4, { start: T0 - HOUR, end: T0 + 6 * HOUR })],
      { start: T0 + 5 * HOUR, end: T0 + DAY },
      UTC,
    ),
    daypartCase(
      "satisfactionByDaypart / ignores inactive and unrated occurrences",
      [rated(4, { inactive: true, start: T0 + 9 * HOUR, end: T0 + 10 * HOUR }), occ({ start: T0 + 9 * HOUR, end: T0 + 10 * HOUR })],
      win(1),
      UTC,
    ),
    daypartCase(
      "satisfactionByDaypart / uses local hours across the Berlin spring-forward (skipped hour gets nothing)",
      [rated(4, { start: Date.UTC(2026, 2, 29, 0, 30), end: Date.UTC(2026, 2, 29, 3, 30) })],
      springWindow,
      BERLIN,
    ),
    daypartCase(
      "daypart edges: 04:59 is night, 05:00 morning, 12:00 midday, 17:00 evening, 22:00 night",
      [
        rated(1, { start: T0 + 4 * HOUR + 59 * MINUTE, end: T0 + 5 * HOUR + MINUTE }),
        rated(2, { start: T0 + 11 * HOUR + 59 * MINUTE, end: T0 + 12 * HOUR + MINUTE }),
        rated(3, { start: T0 + 16 * HOUR + 59 * MINUTE, end: T0 + 17 * HOUR + MINUTE }),
        rated(4, { start: T0 + 21 * HOUR + 59 * MINUTE, end: T0 + 22 * HOUR + MINUTE }),
      ],
      win(1),
      UTC,
    ),
    daypartCase(
      "a span touching the same daypart on two nights counts n once",
      [rated(2, { start: T0 + 23 * HOUR, end: T0 + DAY + 6 * HOUR })],
      win(2),
      UTC,
    ),
    daypartCase(
      "Berlin fall-back: the repeated 02:xx hour counts twice into night",
      [rated(3, { start: Date.UTC(2026, 9, 24, 23, 30), end: Date.UTC(2026, 9, 25, 5, 30) })],
      dayWindow(BERLIN, "2026-10-25"),
      BERLIN,
    ),
    daypartCase(
      "LA fall-back night into the morning",
      [rated(1, { start: Date.UTC(2026, 10, 1, 7, 30), end: Date.UTC(2026, 10, 1, 14, 30) })],
      dayWindow(LA, "2026-11-01"),
      LA,
    ),
    daypartCase(
      "Santiago midnight gap: night on both sides",
      [
        rated(4, { start: Date.UTC(2026, 8, 6, 3, 30), end: Date.UTC(2026, 8, 6, 4, 30) }),
        rated(2, { start: wall(SANTIAGO, "2026-09-06T04:30"), end: wall(SANTIAGO, "2026-09-06T05:30") }),
      ],
      { start: dayStart(SANTIAGO, "2026-09-05"), end: dayStart(SANTIAGO, "2026-09-07") },
      SANTIAGO,
    ),
    daypartCase(
      "Kolkata half-hour offset: 11:30–12:30 local feeds morning and midday",
      [
        rated(4, { start: wall(KOLKATA, "2026-06-10T11:30"), end: wall(KOLKATA, "2026-06-10T12:30") }),
        rated(1, { start: wall(KOLKATA, "2026-06-10T21:45"), end: wall(KOLKATA, "2026-06-10T22:15") }),
      ],
      dayWindow(KOLKATA, "2026-06-10"),
      KOLKATA,
    ),
  ];
  for (const s of matrix) cases.push(daypartCase(s.label, s.spans, s.window, s.zone));
  return cases;
}

export function build(): Record<(typeof sections)[number], Case[]> {
  seq = 0;
  const matrix = scenarioMatrix();
  return {
    satisfactionByCategory: categoryCases(matrix),
    energyLoadPerDay: energyCases(matrix),
    deepWorkShare: deepCases(matrix),
    satisfactionByDaypart: daypartCases(matrix),
  };
}
