/**
 * Insights fixtures, area "day-detail" (owner: U1): the day sheet's slice
 * (lib/insights/view-selectors.ts `buildDayDetail` and `clippedMs`).
 *
 * ```ts
 * sections: {
 *   buildDayDetail: {
 *     name;
 *     input: {
 *       dayMs: Ms;                       // a local midnight in `zone`
 *       zone: Zone;                      // Kotlin needs it for the not-in-days fallback
 *       period: { days: Ms[]; window: WindowJson };
 *       spans: SpanJson[];
 *     };
 *     expected: { dayEnd: Ms; itemKeys: string[]; totalMs: Ms };
 *   }[];
 *   clippedMs: {
 *     name; input: { span: SpanJson; start: Ms; end: Ms }; expected: Ms;
 *   }[];
 * }
 * ```
 *
 * Titles are ordered with a UTF-16 code-unit comparator, not `localeCompare`
 * (which follows the process locale); Kotlin replays with `naturalOrder()`.
 *
 * A `dayMs` outside `period.days` only appears on days that are 24 h long in
 * their zone: there the web's `dayMs + 86_400_000` fallback and Android's next
 * local midnight agree. The DST case of that fallback is a Kotlin-only test
 * (DayDetailTest), because Android deliberately differs there.
 */
import { filterForInsights } from "@/lib/insights/filters";
import { resolvePeriod, type PeriodPreset } from "@/lib/insights/period";
import { buildDayDetail, clippedMs } from "@/lib/insights/view-selectors";
import {
  DAY,
  HOUR,
  MINUTE,
  addDate,
  dayStart,
  localDateOf,
  parseSpan,
  scenario,
  span,
  toOccurrence,
  wall,
  type Case,
  type Ms,
  type SpanJson,
  type Zone,
} from "./shared";

export const sections = ["buildDayDetail", "clippedMs"] as const;

/** UTF-16 code-unit order: zone- and locale-free (Kotlin `naturalOrder<String>()`). */
const codeUnitOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

interface PeriodJson {
  days: Ms[];
  window: { start: Ms; end: Ms };
}

function dayCase(name: string, zone: Zone, dayMs: Ms, period: PeriodJson, spans: SpanJson[]): Case {
  const detail = buildDayDetail(dayMs, period, spans.map(toOccurrence), codeUnitOrder);
  const date = localDateOf(dayMs, zone);
  if (dayStart(zone, date) !== dayMs) throw new Error(`day-detail: ${name}: dayMs must be a local midnight`);
  if (!period.days.includes(dayMs) && dayStart(zone, addDate(date, 1)) !== dayMs + DAY) {
    throw new Error(`day-detail: ${name}: a fallback day must be 24 h long in ${zone}`);
  }
  return {
    name,
    input: { dayMs, zone, period, spans },
    expected: { dayEnd: detail.dayEnd, itemKeys: detail.items.map((o) => o.key), totalMs: detail.totalMs },
  };
}

function period(zone: Zone, preset: PeriodPreset, nowLocal: string): PeriodJson {
  const p = resolvePeriod({ preset, granularity: "day" }, { timeZone: zone, now: wall(zone, nowLocal) });
  return { days: p.days, window: p.window };
}

/** Scenario spans as the sheet receives them: the insights filter with inactive blocks kept. */
function filtered(spans: SpanJson[]): SpanJson[] {
  const keep = new Set(
    filterForInsights(spans.map(toOccurrence), {
      viewerId: "me",
      hiddenCategoryIds: new Set(),
      includeInactive: true,
    }).map((o) => o.key),
  );
  return spans.filter((s) => keep.has(s.key));
}

function scenarioCases(): Case[] {
  const out: Case[] = [];
  const add = (zone: Zone, label: string, preset: PeriodPreset, nowLocal: string, seed: number) => {
    const p = period(zone, preset, nowLocal);
    const n = p.days.length;
    const picks: [string, number][] = [
      ["first day", 0],
      ["middle day", Math.floor(n / 2)],
      ["last day", n - 1],
    ];
    for (const [what, i] of picks) {
      // The day and its neighbours (spans crossing into and out of it), well under 120 spans.
      const firstDay = addDate(localDateOf(p.days[i], zone), -1);
      const spans = filtered(scenario({ zone, firstDay, days: 3, seed: seed * 100 + i }));
      out.push(dayCase(`${zone} ${label} / ${what}`, zone, p.days[i], p, spans));
    }
  };
  // Berlin: 2026-03-29 (23 h) is the middle of this window, 2026-10-25 (25 h) the last day of its week.
  add("Europe/Berlin", "last-7d to 2026-04-01", "last-7d", "2026-04-01T12:00", 11);
  add("Europe/Berlin", "this-week of 2026-10-25", "this-week", "2026-10-25T12:00", 12);
  add("America/Los_Angeles", "last-7d to 2026-11-04", "last-7d", "2026-11-04T08:00", 13);
  add("Asia/Kolkata", "this-week of 2026-06-10", "this-week", "2026-06-10T09:30", 14);
  // The middle day is 2026-09-06, which starts at 01:00 (a DST gap at midnight).
  add("America/Santiago", "last-7d to 2026-09-09", "last-7d", "2026-09-09T12:00", 15);
  add("UTC", "this-month of 2026-02-28", "this-month", "2026-02-28T23:30", 16);
  return out;
}

function handCases(): Case[] {
  const berlin = "Europe/Berlin";
  const out: Case[] = [];

  // A 25 h day (2026-10-25) and a 23 h day (2026-03-29), both in `days`, with spans across the transition.
  const fall = period(berlin, "last-7d", "2026-10-27T12:00");
  const fallDay = dayStart(berlin, "2026-10-25");
  out.push(
    dayCase("Berlin / 25 h day in days", berlin, fallDay, fall, [
      parseSpan(berlin, "2026-10-25T01:30/04:00", { key: "across-repeated-hour" }),
      parseSpan(berlin, "2026-10-24T22:00/2026-10-25T00:30", { key: "into-the-day" }),
      parseSpan(berlin, "2026-10-25T23:00/2026-10-26T01:00", { key: "out-of-the-day" }),
      parseSpan(berlin, "2026-10-26T00:00/01:00", { key: "next-day" }),
    ]),
  );
  const spring = period(berlin, "last-7d", "2026-03-31T12:00");
  out.push(
    dayCase("Berlin / 23 h day in days", berlin, dayStart(berlin, "2026-03-29"), spring, [
      parseSpan(berlin, "2026-03-29T01:30/03:30", { key: "across-skipped-hour" }),
      parseSpan(berlin, "2026-03-29T22:00/2026-03-30T02:00", { key: "crosses-midnight" }),
      parseSpan(berlin, "2026-03-28T20:00/2026-03-30T08:00", { key: "covers-the-day" }),
    ]),
  );

  // Title ties: same start, ordered by code unit (uppercase before lowercase, "Á" last).
  const june = period(berlin, "this-week", "2026-06-10T12:00");
  const june10 = dayStart(berlin, "2026-06-10");
  const at = wall(berlin, "2026-06-10T09:00");
  out.push(
    dayCase("title ties / same start, by title", berlin, june10, june, [
      span({ key: "t1", title: "b", start: at, end: at + HOUR }),
      span({ key: "t2", title: "B", start: at, end: at + 30 * MINUTE }),
      span({ key: "t3", title: "Á", start: at, end: at + HOUR }),
      span({ key: "t4", title: "a", start: at, end: at + 2 * HOUR }),
      span({ key: "t5", title: "a", start: at, end: at + 15 * MINUTE }),
      span({ key: "t0", title: "z", start: at - HOUR, end: at }),
    ]),
  );

  // Inactive spans are listed but left out of the total.
  out.push(
    dayCase("inactive / listed, not counted", berlin, june10, june, [
      parseSpan(berlin, "2026-06-09T23:30/2026-06-10T07:00", { key: "sleep", inactive: true, title: "Sleep" }),
      parseSpan(berlin, "2026-06-10T09:00/10:30", { key: "work" }),
      parseSpan(berlin, "2026-06-10T23:30/2026-06-11T07:00", { key: "sleep-2", inactive: true, title: "Sleep" }),
    ]),
  );

  // Spans crossing both midnights are clipped to the day.
  out.push(
    dayCase("crossing midnight / clipped both ends", berlin, june10, june, [
      parseSpan(berlin, "2026-06-09T22:00/2026-06-11T02:00", { key: "long" }),
      parseSpan(berlin, "2026-06-10T00:00/2026-06-11T00:00", { key: "exact-day" }),
      parseSpan(berlin, "2026-06-09T22:00/2026-06-10T00:00", { key: "ends-at-start" }),
      parseSpan(berlin, "2026-06-11T00:00/01:00", { key: "starts-at-end" }),
    ]),
  );

  // No items at all.
  out.push(dayCase("empty / nothing scheduled", berlin, june10, june, []));

  // dayMs not in days, on 24 h days only (the web's +86_400_000 equals the next local midnight there).
  const fallback = (zone: Zone, date: string, seed: number) => {
    const p = period(zone, "this-week", `${addDate(date, -14)}T12:00`);
    const dayMs = dayStart(zone, date);
    const spans = filtered(scenario({ zone, firstDay: addDate(date, -1), days: 3, seed }));
    out.push(dayCase(`not in days / ${zone} ${date}`, zone, dayMs, p, spans));
  };
  fallback(berlin, "2026-06-10", 21);
  fallback("UTC", "2026-01-01", 22);
  fallback("Asia/Kolkata", "2026-02-28", 23);
  fallback("America/Los_Angeles", "2026-06-10", 24);
  return out;
}

function clippedCases(): Case[] {
  const start = Date.UTC(2026, 5, 10);
  const end = start + DAY;
  const at = (h: number) => start + h * HOUR;
  const rows: [string, Ms, Ms][] = [
    ["inside", at(9), at(11)],
    ["overlaps the start", at(-2), at(3)],
    ["overlaps the end", at(22), at(26)],
    ["encloses the day", at(-5), at(30)],
    ["before the day", at(-5), at(-1)],
    ["ends at the start", at(-5), at(0)],
    ["starts at the end", at(24), at(25)],
    ["zero length", at(5), at(5)],
  ];
  return rows.map(([name, s, e]) => {
    const sp = span({ key: name, start: s, end: e });
    return { name, input: { span: sp, start, end }, expected: clippedMs(toOccurrence(sp), start, end) };
  });
}

export function build(): Record<(typeof sections)[number], Case[]> {
  return {
    buildDayDetail: [...scenarioCases(), ...handCases()],
    clippedMs: clippedCases(),
  };
}
