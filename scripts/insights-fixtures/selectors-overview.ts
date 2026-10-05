/**
 * Insights fixtures, area "selectors-overview" (owner: T1): the Overview tab's
 * view logic (lib/insights/view-selectors.ts, Overview group), replayed by
 * Kotlin's OverviewSelectors.
 *
 * ```ts
 * type DayUsageJson = { dayMs: Ms; ms: number };
 * type CategoryShareJson = { categoryId: string | null; ms: number; share: number;
 *                            prevMs: number; prevShare: number; deltaShare: number };
 * sections: {
 *   perDaySeries: {
 *     name; input: { cur: DayUsageJson[]; prev: DayUsageJson[] };
 *     expected: { key: string; ms: number; avg: number; prevMs?: number }[];  // prevMs absent past prev's end
 *   }[];
 *   typicalDayMs: { name; input: { cur: DayUsageJson[]; prev: DayUsageJson[] }; expected: number }[];
 *   shareRows: {
 *     name; input: { byCategory: { categoryId: string | null; ms: number }[] };
 *     expected: { id: string; seriesKey: string | null; ms: number }[];       // id "uncategorized" / "other"
 *   }[];
 *   shiftChips: {
 *     name; input: { shares: CategoryShareJson[]; curTotal: number; prevTotal: number };
 *     expected: CategoryShareJson[];
 *   }[];
 *   totalChange: {
 *     name; input: { total: number; prevTotal: number };
 *     expected: { trend: "none" | "level" | "up" | "down"; pct: number };
 *   }[];
 *   avgSessionMs: {
 *     name;
 *     input: { summary: { totalMs: number; eventCount: number; activeDays: number;
 *                         dailyAverageMs: number; busiestDay: DayUsageJson | null } };
 *     expected: number | null;
 *   }[];
 * }
 * ```
 *
 * Matrix: every zone × {last-7d ending on the Berlin transitions, this-month at
 * 2026-03-15 (the previous month is shorter), this-month at 2026-04-15 (longer),
 * last-30d at 2026-06-10}. Each run takes the viewer slice of a scenario
 * (usage.ts `viewerSpans`) for both windows, runs the real `computeUsage`
 * (includeInactive, as Overview does) and `categoryShares`, and feeds every
 * selector the result, the way overview-tab.tsx does. Scenarios use seven
 * categories plus uncategorized, so `shareRows` folds into "other".
 *
 * Hand cases: exactly 6 and 7 categories; |Δ| at 0.0199999 and 0.02; 4
 * qualifying shifts (cap 3); equal-|Δ| ties (input order wins); either total 0;
 * a previous window longer and shorter than the current one; all-zero days;
 * totalChange rounding at .5 both ways.
 */
import { categoryShares, type CategoryShare } from "@/lib/analytics/balance";
import { computeUsage, type CategoryUsage, type DayUsage, type UsageSummary } from "@/lib/analytics/usage";
import {
  avgSessionMs,
  perDaySeries,
  shareRows,
  shiftChips,
  totalChange,
  typicalDayMs,
} from "@/lib/insights/view-selectors";
import { DAY, HOUR, MINUTE, ZONES, toOccurrence, type Case, type Zone } from "./shared";
import { resolveAt, viewerSpans } from "./usage";

export const sections = [
  "perDaySeries",
  "typicalDayMs",
  "shareRows",
  "shiftChips",
  "totalChange",
  "avgSessionMs",
] as const;

type Section = (typeof sections)[number];

const T0 = Date.UTC(2026, 5, 1); // Mon 1 Jun 2026 UTC

/** `n` consecutive UTC days from T0 with the given hours each. */
function days(hours: number[], start = T0): DayUsage[] {
  return hours.map((h, i) => ({ dayMs: start + i * DAY, ms: Math.round(h * HOUR) }));
}

function share(categoryId: string | null, deltaShare: number, ms = HOUR, prevMs = HOUR): CategoryShare {
  // share / prevShare are carried through untouched; only deltaShare drives the selector.
  return { categoryId, ms, share: 0.5, prevMs, prevShare: 0.5 - deltaShare, deltaShare };
}

function summary(totalMs: number, eventCount: number, activeDays = 1, nDays = 7): UsageSummary {
  return {
    totalMs,
    eventCount,
    activeDays,
    dailyAverageMs: totalMs / nDays,
    busiestDay: totalMs > 0 ? { dayMs: T0, ms: totalMs } : null,
  };
}

const cases = (): Record<Section, Case[]> => ({
  perDaySeries: [],
  typicalDayMs: [],
  shareRows: [],
  shiftChips: [],
  totalChange: [],
  avgSessionMs: [],
});

/** The per-day pair cases: perDaySeries and typicalDayMs on the same input. */
function addDays(out: Record<Section, Case[]>, name: string, cur: DayUsage[], prev: DayUsage[]): void {
  out.perDaySeries.push({ name, input: { cur, prev }, expected: perDaySeries(cur, prev) });
  out.typicalDayMs.push({ name, input: { cur, prev }, expected: typicalDayMs(cur, prev) });
}

function addShareRows(out: Record<Section, Case[]>, name: string, byCategory: CategoryUsage[]): void {
  out.shareRows.push({ name, input: { byCategory }, expected: shareRows(byCategory) });
}

function addShifts(
  out: Record<Section, Case[]>,
  name: string,
  shares: CategoryShare[],
  curTotal: number,
  prevTotal: number,
): void {
  out.shiftChips.push({
    name,
    input: { shares, curTotal, prevTotal },
    expected: shiftChips(shares, curTotal, prevTotal),
  });
}

function addTotal(out: Record<Section, Case[]>, name: string, total: number, prevTotal: number): void {
  out.totalChange.push({ name, input: { total, prevTotal }, expected: totalChange(total, prevTotal) });
}

function addSession(out: Record<Section, Case[]>, name: string, s: UsageSummary): void {
  out.avgSessionMs.push({ name, input: { summary: s }, expected: avgSessionMs(s) });
}

function handCases(out: Record<Section, Case[]>): void {
  const week = [3, 5, 0, 7, 4, 2, 6];
  const prevWeek = [2, 4, 3, 5, 5, 1, 0];
  addDays(out, "a week against a week", days(week), days(prevWeek, T0 - 7 * DAY));
  addDays(
    out,
    "previous window longer (31 vs 30 days)",
    days(Array(30).fill(2)),
    days(Array(31).fill(1), T0 - 31 * DAY),
  );
  addDays(
    out,
    "previous window shorter (31 vs 28 days): prevMs absent at the end",
    days(Array.from({ length: 31 }, (_, i) => i % 5)),
    days(Array(28).fill(3), T0 - 28 * DAY),
  );
  addDays(out, "no previous days at all", days(week), []);
  addDays(out, "all-zero days on both sides", days(Array(7).fill(0)), days(Array(7).fill(0), T0 - 7 * DAY));
  addDays(out, "even count of nonzero days averages the middle pair", days([1, 0, 2]), days([4, 0, 0], T0 - 3 * DAY));
  addDays(
    out,
    "odd ms give a fractional rolling average",
    [1, 2, 0, 2].map((ms, i) => ({ dayMs: T0 + i * DAY, ms })),
    [{ dayMs: T0 - DAY, ms: 3 }],
  );
  addDays(out, "a single day", days([2.5]), days([0], T0 - DAY));

  const cats = (n: number, uncategorized = false): CategoryUsage[] =>
    Array.from({ length: n }, (_, i) => ({
      categoryId: uncategorized && i === n - 1 ? null : `c${i + 1}`,
      ms: (n - i) * HOUR,
    }));
  addShareRows(out, "no categories", []);
  addShareRows(out, "exactly 6 categories: no other row", cats(6));
  addShareRows(out, "7 categories: the 7th folds into other", cats(7));
  addShareRows(out, "9 categories with uncategorized last: the rest sums into other", cats(9, true));
  addShareRows(out, "uncategorized among the top", [
    { categoryId: null, ms: 5 * HOUR },
    { categoryId: "c1", ms: 2 * HOUR },
  ]);
  addShareRows(out, "equal ms keep input order", [
    { categoryId: "b", ms: HOUR },
    { categoryId: "a", ms: HOUR },
    { categoryId: null, ms: HOUR },
  ]);

  const cur = 10 * HOUR;
  const prev = 8 * HOUR;
  addShifts(
    out,
    "|Δ| just under 0.02 is dropped, exactly 0.02 kept",
    [share("a", 0.0199999), share("b", 0.02), share("c", -0.0199999), share("d", -0.02)],
    cur,
    prev,
  );
  addShifts(
    out,
    "4 qualifying shifts: the 3 largest by |Δ|",
    [share("a", 0.05), share("b", -0.3), share("c", 0.1), share(null, -0.07)],
    cur,
    prev,
  );
  addShifts(
    out,
    "equal |Δ| keeps input order",
    [share("x", -0.1), share("y", 0.1), share("z", 0.1), share("w", -0.1)],
    cur,
    prev,
  );
  addShifts(out, "current total 0: no chips", [share("a", -0.5)], 0, prev);
  addShifts(out, "previous total 0: no chips", [share("a", 0.5)], cur, 0);
  addShifts(out, "nothing moved", [share("a", 0), share("b", 0)], cur, cur);

  addTotal(out, "previous 0: none", 5 * HOUR, 0);
  addTotal(out, "both 0: none", 0, 0);
  addTotal(out, "total 0 against a previous period: down 100", 0, 5 * HOUR);
  addTotal(out, "equal: level", 7 * HOUR, 7 * HOUR);
  addTotal(out, "up", 9 * HOUR, 6 * HOUR);
  addTotal(out, "down", 4 * HOUR, 6 * HOUR);
  addTotal(out, "up by half a percent rounds up", 201 * MINUTE, 200 * MINUTE);
  addTotal(out, "down by half a percent rounds up", 199 * MINUTE, 200 * MINUTE);
  addTotal(out, "up 0.4% rounds to 0 but stays up", 1004, 1000);
  addTotal(out, "up more than double", 25 * HOUR, 10 * HOUR);

  addSession(out, "no events: null", summary(0, 0, 0));
  addSession(out, "one event", summary(90 * MINUTE, 1));
  addSession(out, "a fractional average", summary(10 * HOUR + 1, 3, 2));
}

function matrixCases(out: Record<Section, Case[]>): void {
  ZONES.forEach((zone: Zone, z) => {
    const runs: [string, ReturnType<typeof resolveAt>][] = [
      ["last-7d ending 2026-03-29", resolveAt(zone, "last-7d", "2026-03-29")],
      ["last-7d ending 2026-10-25", resolveAt(zone, "last-7d", "2026-10-25")],
      ["this-month at 2026-03-15", resolveAt(zone, "this-month", "2026-03-15")],
      ["this-month at 2026-04-15", resolveAt(zone, "this-month", "2026-04-15")],
      ["last-30d at 2026-06-10", resolveAt(zone, "last-30d", "2026-06-10")],
    ];
    runs.forEach(([label, p], r) => {
      if (!p) return;
      const seed = 7000 + 31 * z + r;
      const cur = viewerSpans(zone, p.window, seed).map(toOccurrence);
      const prev = viewerSpans(zone, p.prevWindow, seed + 500).map(toOccurrence);
      const usage = computeUsage(cur, p.days, p.window, { includeInactive: true });
      const prevUsage = computeUsage(prev, p.prevDays, p.prevWindow, { includeInactive: true });
      const total = usage.summary.totalMs;
      const prevTotal = prevUsage.summary.totalMs;
      const name = `scenario ${zone} ${label}`;
      addDays(out, name, usage.perDay, prevUsage.perDay);
      addShareRows(out, name, usage.byCategory);
      addShifts(out, name, categoryShares(cur, prev, p.window, p.prevWindow), total, prevTotal);
      addTotal(out, name, total, prevTotal);
      addSession(out, name, usage.summary);
    });
  });
}

export function build(): Record<Section, Case[]> {
  const out = cases();
  handCases(out);
  matrixCases(out);
  return out;
}
