/**
 * Insights fixtures, area "selectors-tasks" (owner: T4): the Tasks tab's view
 * logic (lib/insights/view-selectors.ts, Tasks group), replayed by
 * TasksSelectorsTest.kt.
 *
 * ```ts
 * sections: {
 *   leadTimeParts: {
 *     name; input: { ms: number };                                  // may be fractional (an even-count median)
 *     expected: { kind: "short"; ms: number } | { kind: "daysHours"; days: number; hours: number };
 *   }[];
 *   hasTopLevelTasks: { name; input: { tasks: TaskJson[] }; expected: boolean }[];
 * }
 * ```
 *
 * Hand cases cover 0, 1.9 d, the 2-day edge (and 1 ms either side), 2 d 23 h
 * 40 m (hours = 24, the web's "2d 24h"), the half-hour rounding edges and
 * fractional ms. The scenario cases feed the real `computeTaskStats` median of
 * a deterministic task set per zone, and its top-level / subtask-only slices.
 */
import { computeTaskStats } from "@/lib/analytics/task-stats";
import { hasTopLevelTasks, leadTimeParts } from "@/lib/insights/view-selectors";
import {
  DAY,
  HOUR,
  MINUTE,
  ZONES,
  dayStart,
  localDateOf,
  mulberry32,
  task,
  toTaskRow,
  type Case,
  type TaskJson,
  type WindowJson,
  type Zone,
} from "./shared";

export const sections = ["leadTimeParts", "hasTopLevelTasks"] as const;

type Section = (typeof sections)[number];

/** Monday 2026-06-01 00:00 UTC. */
const T0 = Date.UTC(2026, 5, 1);

function leadCase(name: string, ms: number): Case {
  return { name, input: { ms }, expected: leadTimeParts(ms) };
}

function topLevelCase(name: string, tasks: TaskJson[]): Case {
  return { name, input: { tasks }, expected: hasTopLevelTasks(tasks.map(toTaskRow)) };
}

const LEAD_HAND: [string, number][] = [
  ["zero", 0],
  ["one minute", MINUTE],
  ["1.9 days", 1.9 * DAY],
  ["1 ms under 2 days", 2 * DAY - 1],
  ["exactly 2 days", 2 * DAY],
  ["1 ms over 2 days", 2 * DAY + 1],
  ["2 d 29 m 59.999 s (rounds down to 0 h)", 2 * DAY + 30 * MINUTE - 1],
  ["2 d 30 m (half an hour rounds up)", 2 * DAY + 30 * MINUTE],
  ["2 d 5 h 30 m (half rounds up)", 2 * DAY + 5 * HOUR + 30 * MINUTE],
  ["2 d 23 h 29 m", 2 * DAY + 23 * HOUR + 29 * MINUTE],
  ["2 d 23 h 40 m (hours = 24)", 2 * DAY + 23 * HOUR + 40 * MINUTE],
  ["3 days", 3 * DAY],
  ["9 d 17 h", 9 * DAY + 17 * HOUR],
  ["400 days and a bit", 400 * DAY + 11 * HOUR + 12 * MINUTE],
  ["fractional under 2 days", 1.5 * HOUR + 0.5],
  ["fractional at 2 days", 2 * DAY + 0.5],
  ["fractional half-hour", 4 * DAY + 2 * HOUR + 30 * MINUTE - 0.5],
  ["fractional 7 d 12 h (even-count median)", (7 * DAY + 11 * HOUR + 7 * DAY + 13 * HOUR + 1) / 2],
  ["negative (completed before created)", -3 * HOUR],
];

/** A day of each zone to centre the scenario on: a DST transition where the zone has one. */
const ZONE_DAYS: Record<Zone, string> = {
  UTC: "2026-06-10",
  "Europe/Berlin": "2026-10-25",
  "America/Los_Angeles": "2026-03-08",
  "Asia/Kolkata": "2026-06-10",
  "Europe/Moscow": "2026-06-10",
  "America/Santiago": "2026-09-06",
};

/** 30 deterministic tasks around `window`, ~70% done with lead times from minutes to two weeks. */
function scenarioTasks(zone: Zone, window: WindowJson, seed: number): TaskJson[] {
  const rand = mulberry32(seed);
  const out: TaskJson[] = [];
  for (let i = 0; i < 30; i++) {
    const createdAt = window.start - 7 * DAY + Math.floor(rand() * (window.end - window.start + 7 * DAY));
    const lead = Math.floor(rand() * rand() * 14 * DAY);
    const completedAt = rand() < 0.7 ? Math.min(createdAt + lead, window.end - 1) : null;
    const dueDate = rand() < 0.4 ? localDateOf(createdAt + Math.floor(rand() * 10 * DAY), zone) : null;
    const parentId = i > 0 && rand() < 0.15 ? `s${seed}-0` : null;
    out.push(task({ id: `s${seed}-${i}`, createdAt, completedAt, dueDate, parentId }));
  }
  return out;
}

export function build(): Record<Section, Case[]> {
  const lead: Case[] = LEAD_HAND.map(([name, ms]) => leadCase(name, ms));
  const topLevel: Case[] = [
    topLevelCase("empty", []),
    topLevelCase("one top-level task", [task({ id: "a", createdAt: T0 })]),
    topLevelCase("only subtasks", [
      task({ id: "s1", parentId: "gone", createdAt: T0 }),
      task({ id: "s2", parentId: "gone", createdAt: T0, completedAt: T0 + HOUR }),
    ]),
    topLevelCase("subtasks then a top-level task", [
      task({ id: "s1", parentId: "p", createdAt: T0 }),
      task({ id: "p", createdAt: T0, completedAt: T0 + DAY }),
    ]),
  ];

  ZONES.forEach((zone, z) => {
    const date = ZONE_DAYS[zone];
    const start = dayStart(zone, date);
    // A two-week window from the anchor day's local midnight (the zone's own day lengths).
    const window: WindowJson = { start, end: dayStart(zone, localDateOf(start + 14 * DAY + 12 * HOUR, zone)) };
    const tasks = scenarioTasks(zone, window, 900 + z);
    const median = computeTaskStats(tasks.map(toTaskRow), window, window.end, zone).medianLeadTimeMs;
    if (median !== null) lead.push(leadCase(`${zone} / scenario median`, median));
    topLevel.push(topLevelCase(`${zone} / scenario`, tasks));
    topLevel.push(topLevelCase(`${zone} / scenario subtasks only`, tasks.filter((t) => t.parentId !== null)));
  });

  return { leadTimeParts: lead, hasTopLevelTasks: topLevel };
}
