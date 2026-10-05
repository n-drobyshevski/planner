/**
 * Insights fixtures, area "labels" (owner: A3): every date and duration label
 * the Insights views print — lib/datetime/format.ts (`formatDuration`,
 * `formatWeekdayDayMonth`, `formatTime`), lib/datetime/local.ts
 * (`dateKeyInZone`), components/insights/series.ts (`bucketTick`,
 * `bucketLabel`), period.ts's private `rangeText` (through the custom-range
 * label) and the label helpers of lib/insights/view-selectors.ts.
 *
 * ```ts
 * type LocaleId = "en" | "ru";
 * type GranularityId = "day" | "week" | "month";
 * sections: {
 *   // the date-fns name tables themselves ("MMM" / "MMMM" / "EEE" / "EEEE"),
 *   // index = month 1..12 or ISO weekday 1 = Monday..7 = Sunday
 *   dateNames: {
 *     name;
 *     input: { table: "monthAbbr" | "monthWide" | "weekdayAbbr" | "weekdayWide"; index: number; locale: LocaleId };
 *     expected: string;
 *   }[];
 *   duration:    { name; input: { ms: number; locale: LocaleId };                                    expected: string }[];
 *   bucketTick:  { name; input: { startMs: Ms; granularity: GranularityId; zone: Zone; locale: LocaleId }; expected: string }[];
 *   bucketLabel: { name; input: { bucket: WindowJson; granularity: GranularityId; zone: Zone; locale: LocaleId }; expected: string }[];
 *   rangeText:   { name; input: { window: WindowJson; zone: Zone; locale: LocaleId };               expected: string }[];
 *   // "EEE, d MMM" / "EEE d MMM" / "EEEE, d MMM yyyy" / "EEEE d MMMM"
 *   weekdayDayMonth:        { name; input: { ms: Ms; zone: Zone; locale: LocaleId }; expected: string }[];
 *   weekdayDayMonthNoComma: { name; input: { ms: Ms; zone: Zone; locale: LocaleId }; expected: string }[];
 *   dayTitle:               { name; input: { ms: Ms; zone: Zone; locale: LocaleId }; expected: string }[];
 *   weekdayDayMonthWide:    { name; input: { ms: Ms; zone: Zone; locale: LocaleId }; expected: string }[];
 *   time:    { name; input: { ms: Ms; zone: Zone }; expected: string }[];   // "HH:mm"
 *   dateKey: { name; input: { ms: Ms; zone: Zone }; expected: string }[];   // "yyyy-MM-dd"
 * }
 * ```
 *
 * Buckets are every day / week / month bucket `resolvePeriod` produces for
 * this-week (day), this-month and last-90d (week), last-90d (month) and a
 * calendar-year custom range (month) at each anchor date, in Berlin, Los
 * Angeles, Kolkata and Santiago: that covers clipped edge buckets, a week
 * crossing a month and one crossing a year (last-90d at 2026-01-01), and the
 * ru genitive month label ("июня 2026"); `build` throws if one goes missing.
 * `rangeText` is period.ts's private helper, so it is recorded as the label of
 * a custom range over the window (`customTo = window.end - 1`). Santiago
 * resolves that touch its April fall-back are left out (shared.ts).
 */
import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import { formatDuration, formatTime, formatWeekdayDayMonth } from "@/lib/datetime/format";
import { dateKeyInZone } from "@/lib/datetime/local";
import { dateFnsLocale } from "@/lib/datetime/date-locale";
import { resolvePeriod, type Bucket, type Granularity, type PeriodPreset } from "@/lib/insights/period";
import {
  formatDayDetailTitle,
  formatWeekdayDayMonthLong,
  formatWeekdayDayMonthShort,
} from "@/lib/insights/view-selectors";
import { bucketLabel, bucketTick } from "@/components/insights/series";
import {
  ANCHOR_DATES,
  HOUR,
  MINUTE,
  ZONES,
  addDate,
  crossesHostileTransition,
  dateSpan,
  edgeInstants,
  localDateOf,
  wall,
  type Case,
  type Ms,
  type Zone,
} from "./shared";

export const sections = [
  "dateNames",
  "duration",
  "bucketTick",
  "bucketLabel",
  "rangeText",
  "weekdayDayMonth",
  "weekdayDayMonthNoComma",
  "dayTitle",
  "weekdayDayMonthWide",
  "time",
  "dateKey",
] as const;

const LOCALES = ["en", "ru"] as const;
type LocaleId = (typeof LOCALES)[number];

const BUCKET_ZONES: Zone[] = ["Europe/Berlin", "America/Los_Angeles", "Asia/Kolkata", "America/Santiago"];

/** (preset, requested granularity) pairs whose buckets are recorded. */
const BUCKET_SOURCES: [PeriodPreset, Granularity][] = [
  ["this-week", "day"],
  ["this-month", "week"],
  ["last-90d", "week"],
  ["last-90d", "month"],
];

const iso = (ms: Ms) => new Date(ms).toISOString();

// --- dateNames ----------------------------------------------------------------

function dateNameCases(): Case[] {
  const utc = tz("UTC");
  const cases: Case[] = [];
  for (const locale of LOCALES) {
    const lc = dateFnsLocale(locale);
    for (let month = 1; month <= 12; month++) {
      const ms = Date.UTC(2026, month - 1, 15);
      for (const [table, pattern] of [
        ["monthAbbr", "MMM"],
        ["monthWide", "MMMM"],
      ] as const) {
        cases.push({
          name: `${table} ${month} ${locale}`,
          input: { table, index: month, locale },
          expected: format(ms, pattern, { in: utc, locale: lc }),
        });
      }
    }
    for (let isoDay = 1; isoDay <= 7; isoDay++) {
      const ms = Date.UTC(2026, 5, isoDay); // 2026-06-01 is a Monday
      for (const [table, pattern] of [
        ["weekdayAbbr", "EEE"],
        ["weekdayWide", "EEEE"],
      ] as const) {
        cases.push({
          name: `${table} ${isoDay} ${locale}`,
          input: { table, index: isoDay, locale },
          expected: format(ms, pattern, { in: utc, locale: lc }),
        });
      }
    }
  }
  return cases;
}

// --- duration -----------------------------------------------------------------

const DURATIONS: [string, number][] = [
  ["0", 0],
  ["29 999 ms (rounds down)", 29_999],
  ["30 000 ms (rounds up)", 30_000],
  ["45 min", 45 * MINUTE],
  ["59 min 29.999 s", 59 * MINUTE + 29_999],
  ["59 min 30 s (rounds to 1h)", 59 * MINUTE + 30_000],
  ["1h", HOUR],
  ["1h 30m", 5_400_000],
  ["2h", 2 * HOUR],
  ["3h 30m", 3 * HOUR + 30 * MINUTE],
  ["1m 29s", 89_000],
  ["fractional 89 999.5 ms", 89_999.5],
  ["fractional 29 999.999 ms", 29_999.999],
  ["fractional 1.5 ms", 1.5],
  ["fractional slope 1 234 567.89 ms", 1_234_567.89],
  ["-5 s", -5_000],
  ["-30 s (rounds to -0)", -30_000],
  ["-90 s", -90_000],
  ["-2h", -2 * HOUR],
  ["25h 1m", 25 * HOUR + MINUTE],
  ["366 days of 9h", 366 * 9 * HOUR],
];

function durationCases(): Case[] {
  const cases: Case[] = [];
  for (const locale of LOCALES) {
    for (const [label, ms] of DURATIONS) {
      cases.push({ name: `${label} ${locale}`, input: { ms, locale }, expected: formatDuration(ms, locale) });
    }
  }
  return cases;
}

// --- buckets and ranges ---------------------------------------------------------

/**
 * The local dates `[first, endExclusive)` a resolve at `now` may touch,
 * previous window included, from calendar arithmetic only (no date-fns): it
 * decides which Santiago resolves to leave out before they could hang.
 */
function touchedDates(zone: Zone, now: Ms, preset: PeriodPreset): [string, string] {
  const today = localDateOf(now, zone);
  switch (preset) {
    case "this-week":
      return [addDate(today, -14), addDate(today, 8)];
    case "this-month":
      return [addDate(today, -62), addDate(today, 32)];
    default: // last-90d
      return [addDate(today, -180), addDate(today, 1)];
  }
}

interface Resolved {
  zone: Zone;
  window: { start: Ms; end: Ms };
  granularity: Granularity;
  buckets: Bucket[];
}

function resolves(): Resolved[] {
  const out: Resolved[] = [];
  for (const zone of BUCKET_ZONES) {
    for (const date of ANCHOR_DATES) {
      const now = wall(zone, `${date}T12:00`);
      for (const [preset, granularity] of BUCKET_SOURCES) {
        if (crossesHostileTransition(zone, ...touchedDates(zone, now, preset))) continue;
        const p = resolvePeriod({ preset, granularity }, { timeZone: zone, now });
        if (p.granularity !== granularity) throw new Error(`labels: ${preset} no longer offers ${granularity}`);
        out.push({ zone, window: p.window, granularity, buckets: p.buckets });
      }
    }
    // A calendar year of month buckets (all twelve month names), outside Santiago's April.
    if (!crossesHostileTransition(zone, "2025-01-01", "2027-01-01")) {
      const p = resolvePeriod(
        {
          preset: "custom",
          customFrom: wall(zone, "2026-01-01T12:00"),
          customTo: wall(zone, "2026-12-31T12:00"),
          granularity: "month",
        },
        { timeZone: zone, now: wall(zone, "2026-12-31T12:00") },
      );
      out.push({ zone, window: p.window, granularity: "month", buckets: p.buckets });
    }
  }
  return out;
}

function bucketCases(all: Resolved[]): { ticks: Case[]; labels: Case[] } {
  const seen = new Set<string>();
  const ticks: Case[] = [];
  const labels: Case[] = [];
  for (const r of all) {
    for (const bucket of r.buckets) {
      const id = `${r.zone} / ${r.granularity} / ${iso(bucket.start)} – ${iso(bucket.end)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const locale of LOCALES) {
        ticks.push({
          name: `${id} / ${locale}`,
          input: { startMs: bucket.start, granularity: r.granularity, zone: r.zone, locale },
          expected: bucketTick(bucket.start, r.granularity, r.zone, locale),
        });
        labels.push({
          name: `${id} / ${locale}`,
          input: { bucket: { start: bucket.start, end: bucket.end }, granularity: r.granularity, zone: r.zone, locale },
          expected: bucketLabel(bucket, r.granularity, r.zone, locale),
        });
      }
    }
  }
  const has = (pred: (c: Case) => boolean, what: string) => {
    if (!labels.some(pred)) throw new Error(`labels: no bucketLabel case for ${what}`);
  };
  const input = (c: Case) => c.input as { bucket: Bucket; granularity: Granularity; zone: Zone; locale: LocaleId };
  // A week whose first and last local dates differ in the year (len 4) or the month (len 7).
  const crosses = (c: Case, len: number) => {
    const { bucket, zone, granularity } = input(c);
    const first = localDateOf(bucket.start, zone);
    const last = localDateOf(bucket.end - 1, zone);
    return granularity === "week" && first.slice(0, len) !== last.slice(0, len);
  };
  has((c) => input(c).granularity === "day", "a day bucket");
  has((c) => crosses(c, 4), "a week crossing a year");
  has((c) => crosses(c, 7) && !crosses(c, 4), "a week crossing a month");
  has((c) => c.expected === "июня 2026", "the ru genitive month label");
  return { ticks, labels };
}

function rangeCase(zone: Zone, window: { start: Ms; end: Ms }, locale: LocaleId, label: string): Case | null {
  const first = localDateOf(window.start, zone);
  const last = localDateOf(window.end - 1, zone);
  // The custom range's previous window is as many days again before it.
  if (crossesHostileTransition(zone, addDate(first, -dateSpan(first, last)), addDate(last, 1))) return null;
  const p = resolvePeriod(
    { preset: "custom", customFrom: window.start, customTo: window.end - 1, granularity: "day" },
    { timeZone: zone, now: window.end, locale },
  );
  // The label is rangeText(p.window). That is usually `window` itself, but a
  // custom range ending on Santiago's gap day ends at 01:00, not midnight
  // (period.ts adds a day to the 01:00 day start), so record what was labelled.
  if (p.clamped) throw new Error(`labels: the custom range over ${label} was clamped`);
  return { name: `${label} / ${locale}`, input: { window: p.window, zone, locale }, expected: p.label };
}

function rangeCases(all: Resolved[]): Case[] {
  const cases: (Case | null)[] = [];
  const seen = new Set<string>();
  const add = (zone: Zone, window: { start: Ms; end: Ms }, label: string) => {
    const id = `${zone} / ${label}`;
    if (seen.has(id)) return;
    seen.add(id);
    for (const locale of LOCALES) cases.push(rangeCase(zone, window, locale, id));
  };
  for (const r of all) add(r.zone, r.window, `${iso(r.window.start)} – ${iso(r.window.end)}`);
  // Explicit shapes in every zone: same month, across a month, across a year, a single day.
  for (const zone of ZONES) {
    const range = (first: string, endExclusive: string) => ({
      start: wall(zone, `${first}T00:00`),
      end: wall(zone, `${endExclusive}T00:00`),
    });
    add(zone, range("2026-06-08", "2026-06-15"), "same month 8 – 14 Jun 2026");
    add(zone, range("2026-05-25", "2026-06-01"), "same month ending on its last day");
    add(zone, range("2026-05-28", "2026-06-04"), "across a month");
    add(zone, range("2025-12-29", "2026-01-05"), "across a year");
    add(zone, range("2026-06-10", "2026-06-11"), "single day");
    add(zone, range("2025-06-10", "2026-06-10"), "365 days across a year");
  }
  return cases.filter((c): c is Case => c !== null);
}

// --- day labels -------------------------------------------------------------------

/** Every month (the 15th, 00:30 local) and every weekday (1–7 Jun 2026, 23:30 local), plus the edge instants. */
function dayInstants(zone: Zone): [string, Ms][] {
  const out: [string, Ms][] = [];
  for (let month = 1; month <= 12; month++) {
    const local = `2026-${String(month).padStart(2, "0")}-15T00:30`;
    out.push([local, wall(zone, local)]);
  }
  for (let day = 1; day <= 7; day++) {
    const local = `2026-06-0${day}T23:30`;
    out.push([local, wall(zone, local)]);
  }
  for (const ms of edgeInstants(zone)) out.push([`edge ${iso(ms)}`, ms]);
  out.push(["2025-12-31T23:59:59.999", wall(zone, "2025-12-31T23:59:59") + 999]);
  return out;
}

function dayLabelCases(formatter: (ms: number, timeZone: string, locale: string) => string): Case[] {
  const cases: Case[] = [];
  for (const zone of ZONES) {
    for (const [label, ms] of dayInstants(zone)) {
      for (const locale of LOCALES) {
        cases.push({
          name: `${zone} / ${label} / ${locale}`,
          input: { ms, zone, locale },
          expected: formatter(ms, zone, locale),
        });
      }
    }
  }
  return cases;
}

// --- time and dateKey -------------------------------------------------------------

/** DST stress instants (both sides of each transition), Kolkata half hours, sub-minute instants. */
const FIXED_INSTANTS: [string, Ms][] = [
  ["Berlin spring 00:59:59.999Z", Date.UTC(2026, 2, 29, 0, 59, 59, 999)],
  ["Berlin spring 01:00Z", Date.UTC(2026, 2, 29, 1, 0)],
  ["Berlin fall 00:30Z (02:30 CEST)", Date.UTC(2026, 9, 25, 0, 30)],
  ["Berlin fall 01:30Z (02:30 CET)", Date.UTC(2026, 9, 25, 1, 30)],
  ["LA spring 09:59:59.999Z", Date.UTC(2026, 2, 8, 9, 59, 59, 999)],
  ["LA spring 10:00Z", Date.UTC(2026, 2, 8, 10, 0)],
  ["LA fall 08:30Z", Date.UTC(2026, 10, 1, 8, 30)],
  ["LA fall 09:30Z", Date.UTC(2026, 10, 1, 9, 30)],
  ["Santiago gap 03:59:59.999Z", Date.UTC(2026, 8, 6, 3, 59, 59, 999)],
  ["Santiago gap 04:00Z", Date.UTC(2026, 8, 6, 4, 0)],
  ["Kolkata 23:59:59.999", Date.UTC(2026, 5, 10, 18, 29, 59, 999)],
  ["Kolkata midnight", Date.UTC(2026, 5, 10, 18, 30)],
  ["Kolkata 05:30 = 00:00Z", Date.UTC(2026, 5, 11, 0, 0)],
  ["Kolkata 14:59:30", Date.UTC(2026, 5, 11, 9, 29, 30)],
  ["year boundary 23:59:59.999Z", Date.UTC(2025, 11, 31, 23, 59, 59, 999)],
  ["epoch", 0],
];

function instantCases(formatter: (ms: number, timeZone: string) => string): Case[] {
  const cases: Case[] = [];
  for (const zone of ZONES) {
    const edges = edgeInstants(zone).map((ms): [string, Ms] => [`edge ${iso(ms)}`, ms]);
    const instants: [string, Ms][] = [...FIXED_INSTANTS, ...edges];
    for (const [label, ms] of instants) {
      cases.push({ name: `${zone} / ${label}`, input: { ms, zone }, expected: formatter(ms, zone) });
    }
  }
  return cases;
}

export function build(): Record<(typeof sections)[number], Case[]> {
  const all = resolves();
  const { ticks, labels } = bucketCases(all);
  return {
    dateNames: dateNameCases(),
    duration: durationCases(),
    bucketTick: ticks,
    bucketLabel: labels,
    rangeText: rangeCases(all),
    weekdayDayMonth: dayLabelCases(formatWeekdayDayMonth),
    weekdayDayMonthNoComma: dayLabelCases(formatWeekdayDayMonthShort),
    dayTitle: dayLabelCases(formatDayDetailTitle),
    weekdayDayMonthWide: dayLabelCases(formatWeekdayDayMonthLong),
    time: instantCases(formatTime),
    dateKey: instantCases(dateKeyInZone),
  };
}
