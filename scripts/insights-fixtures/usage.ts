/**
 * Insights fixtures, area "usage" (owner: A1): lib/analytics/usage.ts
 * `computeUsage`, the totals behind Overview.
 *
 * ```ts
 * type DayUsageJson = { dayMs: Ms; ms: number };
 * sections: {
 *   computeUsage: {
 *     name;
 *     input: { spans: SpanJson[]; days: Ms[]; window: WindowJson; includeInactive: boolean };
 *     expected: {                              // the TS `Usage` exactly
 *       summary: { totalMs: number; eventCount: number; activeDays: number;
 *                  dailyAverageMs: number; busiestDay: DayUsageJson | null };
 *       perDay: DayUsageJson[];
 *       byCategory: { categoryId: string | null; ms: number }[];   // ms desc, ties in span order
 *       byMember: { ownerId: string; ms: number }[];
 *     };
 *   }[];
 * }
 * ```
 *
 * Seeds: every computeUsage `it` of test/analytics/usage.test.ts, its local
 * `D(h, min, day)` rebuilt with `wall("Europe/Berlin", …)` (the original reads
 * the machine zone), plus the includeInactive pair. Matrix: every zone ×
 * {last-7d ending on each DST anchor date, this-month at 2026-03-15, last-30d
 * at 2026-06-10} from `scenario()` → `filterForInsights` (viewer "me";
 * includeInactive on for the DST weeks, so the sleep blocks cross the shifted
 * nights) → `computeUsage(includeInactive: true)`,
 * which is how Overview calls it. Scenario spans carry no attributes here (usage
 * never reads them) and are thinned to at most 110 per case, DST stress spans
 * always kept. America/Santiago cases touching its April fall-back are left out
 * (shared.ts `crossesHostileTransition`).
 *
 * This module also exports the period and scenario helpers the other A1 areas
 * (trends, momentum, balance) build their matrices with.
 */
import { computeUsage } from "@/lib/analytics/usage";
import { filterForInsights } from "@/lib/insights/filters";
import { resolvePeriod, type Granularity, type PeriodPreset, type ResolvedPeriod } from "@/lib/insights/period";
import {
  ANCHOR_DATES,
  ZONES,
  addDate,
  crossesHostileTransition,
  dateSpan,
  localDateOf,
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

export const sections = ["computeUsage"] as const;

// --- Helpers shared by the A1 areas ----------------------------------------------------

/** At most this many spans per emitted case (the fixture budget allows 120). */
export const MAX_CASE_SPANS = 110;

/** Local noon of `date` in `zone`: a `now` well inside the day. */
export function noon(zone: Zone, date: string): Ms {
  return wall(zone, `${date}T12:00`);
}

/** First day of the month of `date`, shifted by `offset` months ("yyyy-MM-dd", zone-free). */
function monthStart(date: string, offset: number): string {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 10);
}

/**
 * The local dates `[first, endExclusive)` a resolve at `date` touches,
 * previous window included, from calendar arithmetic only (no date-fns call),
 * for the hostile-transition guard.
 */
function touchedDates(preset: PeriodPreset, date: string, customDays = 0): [string, string] {
  switch (preset) {
    case "this-month":
      return [monthStart(date, -1), monthStart(date, 1)];
    case "last-7d":
      return [addDate(date, 1 - 14), addDate(date, 1)];
    case "last-30d":
      return [addDate(date, 1 - 60), addDate(date, 1)];
    case "last-90d":
      return [addDate(date, 1 - 180), addDate(date, 1)];
    case "custom":
      // `date` is the last day of a custom range of `customDays` days.
      return [addDate(date, 1 - 2 * customDays), addDate(date, 1)];
    default:
      // this-week / last-week: within three weeks either side.
      return [addDate(date, -21), addDate(date, 8)];
  }
}

/**
 * `resolvePeriod` for `preset` at local noon of `date` (for "custom": the
 * `customDays` days ending on `date`), or null when the case would touch a
 * date @date-fns/tz cannot handle under a hostile process zone.
 */
export function resolveAt(
  zone: Zone,
  preset: PeriodPreset,
  date: string,
  granularity: Granularity = "day",
  customDays = 0,
): ResolvedPeriod | null {
  if (crossesHostileTransition(zone, ...touchedDates(preset, date, customDays))) return null;
  const now = noon(zone, date);
  return resolvePeriod(
    preset === "custom"
      ? { preset, customFrom: noon(zone, addDate(date, 1 - customDays)), customTo: now, granularity }
      : { preset, granularity },
    { timeZone: zone, now },
  );
}

/** Deterministically drops spans past `max` (by stride), keeping the DST stress spans. */
export function thin(spans: SpanJson[], max = MAX_CASE_SPANS): SpanJson[] {
  if (spans.length <= max) return spans;
  const stress = spans.filter((s) => s.key.includes("-dst-"));
  const rest = spans.filter((s) => !s.key.includes("-dst-"));
  const keep = max - stress.length;
  const kept = new Set<SpanJson>();
  for (let i = 0; i < keep; i++) kept.add(rest[Math.floor((i * rest.length) / keep)]);
  return spans.filter((s) => stress.includes(s) || kept.has(s));
}

/**
 * The viewer's Insights slice of a scenario covering `window` (from the day
 * before, so spans crossing into the window are clipped):
 * `scenario()` → `filterForInsights` (viewer "me", nothing hidden), attributes
 * dropped, thinned to `max` spans.
 */
export function viewerSpans(
  zone: Zone,
  window: WindowJson,
  seed: number,
  includeInactive = false,
  max = MAX_CASE_SPANS,
): SpanJson[] {
  const first = addDate(localDateOf(window.start, zone), -1);
  const last = localDateOf(window.end - 1, zone);
  const all = scenario({ zone, firstDay: first, days: dateSpan(first, last), seed });
  const kept = new Set(
    filterForInsights(all.map(toOccurrence), {
      viewerId: "me",
      hiddenCategoryIds: new Set(),
      includeInactive,
    }).map((o) => o.key),
  );
  return thin(
    all.filter((s) => kept.has(s.key)).map((s) => ({ ...s, attributes: {} })),
    max,
  );
}

// --- Cases ----------------------------------------------------------------------------

function usageCase(
  name: string,
  spans: SpanJson[],
  days: Ms[],
  window: WindowJson,
  includeInactive: boolean,
): Case {
  return {
    name,
    input: { spans, days, window, includeInactive },
    expected: computeUsage(spans.map(toOccurrence), days, window, { includeInactive }),
  };
}

const BERLIN = "Europe/Berlin";

/** The ANCHOR_DATES with a DST transition in some zone of the matrix. */
const DST_ANCHORS = ANCHOR_DATES.filter((d) =>
  ["2026-03-29", "2026-10-25", "2026-03-08", "2026-11-01", "2026-09-06"].includes(d),
);

/** usage.test.ts `D(h, min, day)`: a June 2026 wall time, here pinned to Berlin. */
function D(h = 0, min = 0, day = 1): Ms {
  const date = addDate("2026-06-01", day - 1);
  return wall(BERLIN, `${date}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
}

/** usage.test.ts `occ()` defaults as a SpanJson. */
function occ(over: Partial<SpanJson> & { key?: string }): SpanJson {
  return span({ start: D(9), end: D(10), title: "t", eventId: "e", ...over, key: over.key ?? "e:0" });
}

function seedCases(): Case[] {
  const day1 = D(0, 0, 1);
  const day2 = D(0, 0, 2);
  const day3 = D(0, 0, 3);
  const day4 = D(0, 0, 4);
  const days3 = [day1, day2, day3];
  const win3 = { start: day1, end: day4 };
  const d = "computeUsage";
  const sleepPair = [
    occ({ key: "a", start: D(9), end: D(10) }),
    occ({ key: "sleep", inactive: true, start: D(0), end: D(8) }),
  ];
  return [
    usageCase(
      `${d} / totals a single timed event and attributes it to its day`,
      [occ({ start: D(9), end: D(11) })],
      days3,
      win3,
      false,
    ),
    usageCase(
      `${d} / excludes all-day, inactive, and context occurrences from every total`,
      [
        occ({ key: "a", start: D(9), end: D(10) }),
        occ({ key: "b", allDay: true, start: day1, end: day2 }),
        occ({ key: "c", inactive: true, start: D(0), end: D(8) }),
        occ({ key: "d", kind: "context", start: D(8), end: D(18) }),
      ],
      days3,
      win3,
      false,
    ),
    usageCase(
      `${d} / clips durations to the window edges`,
      [occ({ start: D(23, 0, 0), end: D(1) })],
      days3,
      win3,
      false,
    ),
    usageCase(
      `${d} / splits an across-midnight event into two per-day buckets`,
      [occ({ start: D(23), end: D(1, 0, 2) })],
      days3,
      win3,
      false,
    ),
    usageCase(
      `${d} / groups by category and member, sorted by time descending`,
      [
        occ({ key: "a", categoryId: "work", ownerId: "me", start: D(9), end: D(12) }),
        occ({ key: "b", categoryId: "gym", ownerId: "me", start: D(13), end: D(14) }),
        occ({ key: "c", categoryId: null, ownerId: "you", start: D(15), end: D(17) }),
      ],
      days3,
      win3,
      false,
    ),
    usageCase(
      `${d} / folds context membership into byCategory and ignores the backdrop`,
      [
        occ({ key: "w", kind: "context", categoryId: "work", start: D(9), end: D(17) }),
        occ({ key: "a", categoryId: "work", start: D(9), end: D(11) }),
        occ({ key: "b", categoryId: "errands", start: D(11), end: D(12) }),
      ],
      days3,
      win3,
      false,
    ),
    usageCase(`${d} / counts inactive blocks only when includeInactive is set (without)`, sleepPair, days3, win3, false),
    usageCase(`${d} / counts inactive blocks only when includeInactive is set (with)`, sleepPair, days3, win3, true),
    usageCase(
      `${d} / picks the busiest day across several days`,
      [
        occ({ key: "a", start: D(9), end: D(10) }),
        occ({ key: "b", start: D(9, 0, 2), end: D(12, 0, 2) }),
        occ({ key: "c", start: D(9, 0, 3), end: D(11, 0, 3) }),
      ],
      days3,
      win3,
      false,
    ),
    usageCase(`${d} / returns zeros and a null busiest day for empty input`, [], days3, win3, false),
  ];
}

function handCases(): Case[] {
  const day1 = D(0, 0, 1);
  const days3 = [day1, D(0, 0, 2), D(0, 0, 3)];
  const win3 = { start: day1, end: D(0, 0, 4) };
  const berlinSpring = { start: wall(BERLIN, "2026-03-28T00:00"), end: wall(BERLIN, "2026-03-31T00:00") };
  const springDays = ["2026-03-28", "2026-03-29", "2026-03-30"].map((x) => wall(BERLIN, `${x}T00:00`));
  return [
    usageCase(
      "ties in byCategory and byMember keep span order",
      [
        occ({ key: "a", categoryId: "b-cat", ownerId: "you", isShared: true, start: D(9), end: D(10) }),
        occ({ key: "b", categoryId: "a-cat", ownerId: "me", start: D(11), end: D(12) }),
        occ({ key: "c", categoryId: null, ownerId: "zed", start: D(13), end: D(14) }),
      ],
      days3,
      win3,
      false,
    ),
    usageCase(
      "equal busiest days: the first one wins",
      [
        occ({ key: "a", start: D(9, 0, 2), end: D(11, 0, 2) }),
        occ({ key: "b", start: D(9, 0, 3), end: D(11, 0, 3) }),
      ],
      days3,
      win3,
      false,
    ),
    usageCase(
      "a span outside the window counts nowhere (eventCount too)",
      [occ({ key: "out", start: D(9, 0, 5), end: D(10, 0, 5) }), occ({ key: "in", start: D(9), end: D(9, 30) })],
      days3,
      win3,
      false,
    ),
    usageCase("no days: daily average is 0", [occ({ start: D(9), end: D(10) })], [], win3, false),
    usageCase(
      "Berlin spring-forward: the 23 h day is one entry",
      [
        span({ key: "x", start: wall(BERLIN, "2026-03-28T22:00"), end: wall(BERLIN, "2026-03-29T04:00") }),
        span({ key: "y", start: wall(BERLIN, "2026-03-29T23:00"), end: wall(BERLIN, "2026-03-30T01:00"), categoryId: "c1" }),
      ],
      springDays,
      berlinSpring,
      false,
    ),
  ];
}

function matrixCases(): Case[] {
  const out: Case[] = [];
  ZONES.forEach((zone, z) => {
    const runs: { label: string; p: ResolvedPeriod | null; inactive: boolean[] }[] = [
      ...DST_ANCHORS.map((date) => ({
        label: `last-7d ending ${date}`,
        p: resolveAt(zone, "last-7d", date),
        inactive: [true],
      })),
      { label: "this-month at 2026-03-15", p: resolveAt(zone, "this-month", "2026-03-15"), inactive: [false] },
      { label: "last-30d at 2026-06-10", p: resolveAt(zone, "last-30d", "2026-06-10"), inactive: [false] },
    ];
    runs.forEach(({ label, p, inactive }, r) => {
      if (!p) return;
      for (const includeInactive of inactive) {
        const spans = viewerSpans(zone, p.window, 1000 + 37 * z + r, includeInactive);
        out.push(
          usageCase(
            `scenario ${zone} ${label}, filter includeInactive ${includeInactive}`,
            spans,
            p.days,
            p.window,
            true,
          ),
        );
      }
    });
  });
  return out;
}

export function build(): Record<(typeof sections)[number], Case[]> {
  return { computeUsage: [...seedCases(), ...handCases(), ...matrixCases()] };
}
