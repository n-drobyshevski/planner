/**
 * Insights fixtures, area "period" (owner: F0): lib/insights/period.ts, which
 * every window, day list and bucket grid comes from.
 *
 * ```ts
 * type PresetId = "this-week" | "last-week" | "this-month" | "last-7d" | "last-30d" | "last-90d" | "custom";
 * type GranularityId = "day" | "week" | "month";
 * sections: {
 *   resolve: {
 *     name;
 *     input: {
 *       zone: Zone; now: Ms;
 *       state: { preset: PresetId; customFrom: Ms | null; customTo: Ms | null };
 *       granularities: GranularityId[];          // always ["day", "week", "month"]
 *     };
 *     expected: {
 *       window: WindowJson; prevWindow: WindowJson;
 *       days: Ms[]; prevDays: Ms[];              // local midnights
 *       clamped: boolean;
 *       // one per requested granularity, in input order: the effective
 *       // granularity and its bucket starts (ends are implied: the next start,
 *       // then window.end). Day buckets are exactly `days` (period.ts
 *       // listBuckets), so for an effective "day" bucketStarts is null and the
 *       // replay asserts its day buckets against its own `days` instead.
 *       byGranularity: { requested: GranularityId; granularity: GranularityId; bucketStarts: Ms[] | null }[];
 *     };
 *   }[];
 *   granularityChoices: { name; input: { window: WindowJson }; expected: GranularityId[] }[];
 *   defaultGranularity: { name; input: { preset: PresetId; window: WindowJson }; expected: GranularityId }[];
 * }
 * ```
 *
 * resolve matrices: A = ZONES × ANCHOR_DATES × ANCHOR_TIMES × the 6 non-custom
 * presets; A′ = each zone's edge instants (exact day starts, Berlin's repeated
 * 02:30) × {this-week, this-month, last-7d} (all 6 presets for Berlin's
 * repeated hour); B = custom ranges per zone (lengths around the granularity
 * edges, reversed bounds, the 366-day clamp, both Berlin transitions, the
 * Santiago gap day, a missing bound). Plus every period.test.ts case.
 * America/Santiago cases whose windows touch its April fall-back are left out:
 * @date-fns/tz cannot compute them under a Pacific/Chatham process zone (see
 * shared.ts); the gap at midnight in September is covered.
 */
import {
  defaultGranularity,
  granularityChoices,
  resolvePeriod,
  type Granularity,
  type PeriodPreset,
  type PeriodState,
} from "@/lib/insights/period";
import {
  ANCHOR_DATES,
  ANCHOR_TIMES,
  DAY,
  HOUR,
  ZONES,
  addDate,
  crossesHostileTransition,
  dateSpan,
  dayStart,
  edgeInstants,
  localDateOf,
  wall,
  type Case,
  type Ms,
  type Zone,
} from "./shared";

export const sections = ["resolve", "granularityChoices", "defaultGranularity"] as const;

const GRANULARITIES: Granularity[] = ["day", "week", "month"];
const NON_CUSTOM: PeriodPreset[] = [
  "this-week",
  "last-week",
  "this-month",
  "last-7d",
  "last-30d",
  "last-90d",
];
const ALL_PRESETS: PeriodPreset[] = [...NON_CUSTOM, "custom"];

/**
 * The local dates `[first, endExclusive)` a resolve touches (previous window
 * included), from calendar arithmetic only, with no date-fns call: it decides
 * which cases to leave out (shared.ts `crossesHostileTransition`) before the
 * code under test could loop on them.
 */
function touchedDates(
  zone: Zone,
  now: Ms,
  preset: PeriodPreset,
  customFrom: Ms | null,
  customTo: Ms | null,
): [string, string] {
  const today = localDateOf(now, zone);
  const [y, m, d] = today.split("-").map(Number);
  const isoDow = ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
  const monday = addDate(today, 1 - isoDow);
  const month = (offset: number) => new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 10);
  switch (preset) {
    case "this-week":
      return [addDate(monday, -7), addDate(monday, 7)];
    case "last-week":
      return [addDate(monday, -14), monday];
    case "this-month":
      return [month(-1), month(1)];
    case "last-7d":
    case "last-30d":
    case "last-90d": {
      const n = preset === "last-7d" ? 7 : preset === "last-30d" ? 30 : 90;
      return [addDate(today, 1 - 2 * n), addDate(today, 1)];
    }
    case "custom": {
      if (customFrom === null || customTo === null) return touchedDates(zone, now, "this-week", null, null);
      const [a, b] = [localDateOf(customFrom, zone), localDateOf(customTo, zone)].sort();
      const end = addDate(b, 1);
      const len = Math.min(dateSpan(a, b), 366);
      return [addDate(end, -2 * len), end];
    }
  }
}

function resolveCase(
  name: string,
  zone: Zone,
  now: Ms,
  preset: PeriodPreset,
  customFrom: Ms | null = null,
  customTo: Ms | null = null,
): Case | null {
  if (crossesHostileTransition(zone, ...touchedDates(zone, now, preset, customFrom, customTo))) return null;
  const state = (granularity: Granularity): PeriodState => ({
    preset,
    customFrom: customFrom ?? undefined,
    customTo: customTo ?? undefined,
    granularity,
  });
  const resolved = GRANULARITIES.map((g) => resolvePeriod(state(g), { timeZone: zone, now }));
  const p = resolved[0];
  return {
    name,
    input: { zone, now, state: { preset, customFrom, customTo }, granularities: GRANULARITIES },
    expected: {
      window: p.window,
      prevWindow: p.prevWindow,
      days: p.days,
      prevDays: p.prevDays,
      clamped: p.clamped,
      byGranularity: resolved.map((r, i) => ({
        requested: GRANULARITIES[i],
        granularity: r.granularity,
        bucketStarts:
          r.granularity === "day" ? dayBucketsOrThrow(r.buckets, r.days) : r.buckets.map((b) => b.start),
      })),
    },
  };
}

/** Day buckets are `days` (kept out of the JSON for size); throws if that ever changes. */
function dayBucketsOrThrow(buckets: { start: Ms }[], days: Ms[]): null {
  if (buckets.length !== days.length || buckets.some((b, i) => b.start !== days[i])) {
    throw new Error("period: day buckets no longer equal the day list; emit them again");
  }
  return null;
}

/** Seeds: the resolvePeriod cases of test/insights/period.test.ts. */
function seedCases(): (Case | null)[] {
  const utc = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo, d, h, mi);
  const now = utc(2026, 5, 10, 12);
  const UTC = "UTC";
  const BERLIN = "Europe/Berlin";
  const presets = "resolvePeriod — calendar presets (UTC)";
  const custom = "resolvePeriod — custom ranges";
  const dst = "resolvePeriod — DST (Europe/Berlin)";
  return [
    resolveCase(`${presets} / this-week spans Mon–Sun and compares to last week`, UTC, now, "this-week"),
    resolveCase(`${presets} / localizes the label via locale + presetLabels (Russian)`, UTC, now, "this-week"),
    resolveCase(`${presets} / last-week is the week before, comparing to the one before that`, UTC, now, "last-week"),
    resolveCase(
      `${presets} / this-month spans the calendar month and compares to the previous month`,
      UTC,
      now,
      "this-month",
    ),
    resolveCase(`${presets} / last-7d rolls back 7 days from the end of today (day granularity)`, UTC, now, "last-7d"),
    resolveCase(
      `${presets} / last-30d rolls back from the end of today and compares to the prior 30`,
      UTC,
      now,
      "last-30d",
    ),
    resolveCase(
      `${custom} / treats from/to as inclusive days (any ms within them)`,
      UTC,
      now,
      "custom",
      utc(2026, 5, 1, 15),
      utc(2026, 5, 3, 9),
    ),
    resolveCase(`${custom} / swaps reversed bounds`, UTC, now, "custom", utc(2026, 5, 3), utc(2026, 5, 1)),
    resolveCase(
      `${custom} / clamps over-long ranges to the most recent MAX_CUSTOM_DAYS days`,
      UTC,
      now,
      "custom",
      utc(2024, 0, 1),
      utc(2026, 5, 1),
    ),
    resolveCase(`${custom} / falls back to this-week when the custom range is missing`, UTC, now, "custom"),
    resolveCase(
      `${dst} / spring-forward week has a 23-hour day yet 7 day entries`,
      BERLIN,
      Date.UTC(2026, 2, 25, 12),
      "this-week",
    ),
    resolveCase(
      `${dst} / month buckets across DST land on local month starts`,
      BERLIN,
      now,
      "custom",
      Date.UTC(2026, 2, 1, 12),
      Date.UTC(2026, 4, 31, 12),
    ),
    resolveCase(
      "buckets — week granularity / clips edge buckets to the window and aligns interior ones to Mondays",
      UTC,
      now,
      "custom",
      utc(2026, 4, 13),
      utc(2026, 5, 9),
    ),
    resolveCase(
      "granularity rules / falls back to the preset default when the requested one isn't allowed",
      UTC,
      now,
      "last-90d",
    ),
  ];
}

/** Matrix B: custom ranges in `zone`, bounds at local noon. */
function customCases(zone: Zone): (Case | null)[] {
  const now = wall(zone, "2026-06-10T12:00");
  const noon = (d: string) => wall(zone, `${d}T12:00`);
  const range = (label: string, first: string, last: string, from = first, to = last): Case | null =>
    resolveCase(`B / ${zone} / ${label}`, zone, now, "custom", noon(from), noon(to));
  const length = (days: number, first: string) =>
    range(`${days} days from ${first}`, first, addDate(first, days - 1));
  const cases = [
    range("single day", "2026-06-10", "2026-06-10"),
    length(7, "2026-06-01"),
    length(14, "2026-06-01"),
    length(35, "2026-05-01"),
    length(36, "2026-05-01"),
    length(60, "2026-04-01"),
    length(182, "2026-01-01"),
    length(183, "2026-01-01"),
    range("reversed bounds", "2026-06-01", "2026-06-07", "2026-06-07", "2026-06-01"),
    length(400, "2025-05-07"),
    length(366, "2025-06-10"),
    range("both Berlin transitions", "2026-03-20", "2026-10-31"),
    range("from the Santiago gap day", "2026-09-06", "2026-09-20"),
    resolveCase(`B / ${zone} / missing customTo`, zone, now, "custom", noon("2026-06-01"), null),
  ];
  return cases;
}

export function build(): Record<(typeof sections)[number], Case[]> {
  const all: (Case | null)[] = seedCases();
  const resolve = all;
  for (const zone of ZONES) {
    for (const date of ANCHOR_DATES) {
      for (const time of ANCHOR_TIMES) {
        const now = wall(zone, `${date}T${time}`);
        for (const preset of NON_CUSTOM) {
          resolve.push(resolveCase(`A / ${zone} / ${date} ${time} / ${preset}`, zone, now, preset));
        }
      }
    }
  }
  for (const zone of ZONES) {
    const edges = edgeInstants(zone);
    edges.forEach((now, i) => {
      const repeated = i >= ANCHOR_DATES.length;
      const presets: PeriodPreset[] = repeated ? NON_CUSTOM : ["this-week", "this-month", "last-7d"];
      const label = repeated ? `repeated 02:30 at ${new Date(now).toISOString()}` : `start of ${ANCHOR_DATES[i]}`;
      for (const preset of presets) {
        resolve.push(resolveCase(`A′ / ${zone} / ${label} / ${preset}`, zone, now, preset));
      }
    });
  }
  for (const zone of ZONES) resolve.push(...customCases(zone));

  const t0 = Date.UTC(2026, 5, 1);
  const choices: Case[] = [
    ...[7, 14, 30, 90, 366].map((n) => ({
      name: `granularity rules / offers day ≤ 35d, week ≥ 14d, month ≥ 60d (${n} days)`,
      input: { window: { start: 0, end: n * DAY } },
      expected: granularityChoices({ start: 0, end: n * DAY }),
    })),
    ...[1, 13, 14, 35, 36, 59, 60, 366].map((n) => {
      const window = { start: t0, end: t0 + n * DAY };
      return { name: `${n} days`, input: { window }, expected: granularityChoices(window) };
    }),
    (() => {
      const window = {
        start: dayStart("Europe/Berlin", "2026-03-29"),
        end: dayStart("Europe/Berlin", "2026-03-30"),
      };
      return { name: "23h DST day (Berlin)", input: { window }, expected: granularityChoices(window) };
    })(),
    (() => {
      const window = { start: t0, end: t0 + 35 * DAY + 12 * HOUR };
      return { name: "35.5 days rounds up", input: { window }, expected: granularityChoices(window) };
    })(),
  ];

  const defaults: Case[] = [];
  const day = (n: number) => ({ start: 0, end: n * DAY });
  for (const [preset, n] of [
    ["custom", 20],
    ["custom", 120],
    ["custom", 300],
    ["this-week", 7],
    ["last-90d", 90],
  ] as [PeriodPreset, number][]) {
    defaults.push({
      name: `granularity rules / defaults custom ranges by length (${preset}, ${n} days)`,
      input: { preset, window: day(n) },
      expected: defaultGranularity(preset, day(n)),
    });
  }
  for (const preset of ALL_PRESETS) {
    for (const n of [7, 35, 36, 182, 183, 366]) {
      const window = { start: t0, end: t0 + n * DAY };
      defaults.push({
        name: `${preset} × ${n} days`,
        input: { preset, window },
        expected: defaultGranularity(preset, window),
      });
    }
  }
  // Unused helper guard: dateSpan documents the Matrix B lengths.
  if (dateSpan("2025-06-10", "2026-06-10") !== 366) throw new Error("period: 366-day range drifted");
  return {
    // America/Santiago cases that touch its fall-back days are left out (shared.ts).
    resolve: all.filter((c): c is Case => c !== null),
    granularityChoices: choices,
    defaultGranularity: defaults,
  };
}
