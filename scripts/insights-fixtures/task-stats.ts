/**
 * Insights fixtures, area "task-stats" (owner: A2): lib/analytics/task-stats.ts,
 * the Tasks tab's throughput numbers (statsByCollection is not ported).
 *
 * ```ts
 * sections: {
 *   computeTaskStats: {
 *     name; input: { tasks: TaskJson[]; window: WindowJson; now: Ms; zone: Zone };
 *     expected: {
 *       createdCount: number; completedCount: number; dueCount: number;
 *       adherenceRate: number | null; overdueOpenCount: number;
 *       completionRate: number | null; medianLeadTimeMs: number | null;
 *     };
 *   }[];
 *   taskVelocity: {
 *     name; input: { tasks: TaskJson[]; buckets: WindowJson[] };
 *     expected: { start: Ms; end: Ms; created: number; completed: number }[];   // one per bucket
 *   }[];
 * }
 * ```
 *
 * Seeds: test/analytics/task-stats.test.ts minus statsByCollection
 * ("<describe> / <it>"). Added per zone: a due date on a DST day (or an
 * ordinary day), completion at 23:30 local on the due day vs 00:30 the next
 * day, `now` at 00:30 local and at 23:30 the evening before (the overdue
 * edge), even and odd lead-time counts, subtasks (excluded), window-edge
 * instants; plus a PRNG task set per zone over day and week buckets.
 */
import { computeTaskStats, taskVelocity } from "@/lib/analytics/task-stats";
import { resolvePeriod } from "@/lib/insights/period";
import {
  DAY,
  HOUR,
  MINUTE,
  ZONES,
  addDate,
  dayStart,
  localDateOf,
  mulberry32,
  task,
  toTaskRow,
  wall,
  type Case,
  type Ms,
  type TaskJson,
  type WindowJson,
  type Zone,
} from "./shared";

export const sections = ["computeTaskStats", "taskVelocity"] as const;

// --- Seeds: test/analytics/task-stats.test.ts --------------------------------------------

const T0 = Date.UTC(2026, 5, 1); // Mon 1 Jun 2026 UTC
const UTC = "UTC";
// This week [Mon 1 Jun, Mon 8 Jun); "now" is Wed 3 Jun noon.
const WIN: WindowJson = { start: T0, end: T0 + 7 * DAY };
const NOW = T0 + 2 * DAY + 12 * HOUR;

/** task-stats.test.ts `task()` defaults, as a TaskJson. */
function t(over: Partial<TaskJson> & { id: string }): TaskJson {
  return task({ title: "t", createdAt: T0 - 30 * DAY, ...over });
}

/** task-stats.test.ts `done()`. */
const done = (over: Partial<TaskJson> & { id: string }): TaskJson => t({ completedAt: T0 + DAY, ...over });

// --- Case builders ---------------------------------------------------------------------------

function statsCase(name: string, tasks: TaskJson[], window: WindowJson, now: Ms, zone: Zone): Case {
  return {
    name,
    input: { tasks, window, now, zone },
    expected: computeTaskStats(tasks.map(toTaskRow), window, now, zone),
  };
}

function velocityCase(name: string, tasks: TaskJson[], buckets: WindowJson[]): Case {
  return { name, input: { tasks, buckets }, expected: taskVelocity(tasks.map(toTaskRow), buckets) };
}

/** A day of each zone to centre its cases on: its DST transitions, else an ordinary Wednesday. */
const ZONE_DAYS: Record<Zone, string[]> = {
  UTC: ["2026-06-10"],
  "Europe/Berlin": ["2026-03-29", "2026-10-25"],
  "America/Los_Angeles": ["2026-03-08", "2026-11-01"],
  "Asia/Kolkata": ["2026-06-10"],
  "Europe/Moscow": ["2026-06-10"],
  "America/Santiago": ["2026-09-06"],
};

/** The tasks around one local day `date` of `zone` and its week `window`. */
function edgeTasks(zone: Zone, date: string, window: WindowJson): TaskJson[] {
  const at = (local: string) => wall(zone, local);
  const next = addDate(date, 1);
  const created = window.start - 3 * DAY;
  return [
    task({ id: "due-open", dueDate: date, createdAt: window.start + HOUR }),
    task({ id: "due-ontime-2330", dueDate: date, createdAt: created, completedAt: at(`${date}T23:30`) }),
    task({ id: "due-late-0030", dueDate: date, createdAt: created, completedAt: at(`${next}T00:30`) }),
    task({ id: "due-yesterday-open", dueDate: addDate(date, -1), createdAt: created }),
    task({ id: "due-tomorrow-open", dueDate: next, createdAt: created }),
    task({ id: "due-first-day", dueDate: localDateOf(window.start, zone), createdAt: created, completedAt: window.start }),
    task({ id: "due-after-window", dueDate: localDateOf(window.end, zone), createdAt: created }),
    task({ id: "due-before-window", dueDate: addDate(localDateOf(window.start, zone), -1), createdAt: created }),
    task({ id: "created-at-start", createdAt: window.start }),
    task({ id: "created-at-end", createdAt: window.end }),
    task({ id: "completed-last-ms", createdAt: created, completedAt: window.end - 1 }),
    task({ id: "completed-at-end", createdAt: created, completedAt: window.end }),
    task({ id: "sub-due", parentId: "due-open", dueDate: addDate(date, -1), createdAt: window.start + HOUR }),
    task({ id: "sub-done", parentId: "due-open", createdAt: window.start + HOUR, completedAt: window.start + 2 * HOUR }),
  ];
}

/** `count` completions inside `window` with uneven lead times (1 h, 2 h + 1 ms, 5 h, 7 h, …). */
function leadTimeTasks(window: WindowJson, count: number): TaskJson[] {
  const leads = [HOUR, 2 * HOUR + 1, 5 * HOUR, 7 * HOUR, 26 * HOUR + 30 * MINUTE];
  return leads.slice(0, count).map((lead, i) => {
    const completedAt = window.start + (i + 1) * DAY + 3 * HOUR;
    return task({ id: `lead-${i}`, createdAt: completedAt - lead, completedAt });
  });
}

/** A deterministic task set around `window`: created ±5 days around it, ~60% done, some due, some subtasks. */
function randomTasks(zone: Zone, window: WindowJson, seed: number): TaskJson[] {
  const rand = mulberry32(seed);
  const span = window.end - window.start + 10 * DAY;
  const out: TaskJson[] = [];
  for (let i = 0; i < 40; i++) {
    const createdAt = window.start - 5 * DAY + Math.floor(rand() * span);
    const completedAt = rand() < 0.6 ? createdAt + Math.floor(rand() * 7 * DAY) : null;
    const dueDate = rand() < 0.5 ? localDateOf(createdAt + Math.floor(rand() * 14 * DAY), zone) : null;
    const parentId = rand() < 0.1 && i > 0 ? `r${seed}-0` : null;
    out.push(task({ id: `r${seed}-${i}`, createdAt, completedAt, dueDate, parentId, ownerId: rand() < 0.2 ? "you" : "me" }));
  }
  return out;
}

// --- Sections -----------------------------------------------------------------------------------

function statsCases(): Case[] {
  const cases: Case[] = [
    statsCase(
      "computeTaskStats / counts created/completed/due inside the window, top-level only",
      [
        t({ id: "a", createdAt: T0 + HOUR }),
        t({ id: "sub", parentId: "a", createdAt: T0 + HOUR }),
        done({ id: "b", completedAt: T0 + DAY }),
        done({ id: "old", completedAt: T0 - DAY }),
        t({ id: "c", dueDate: "2026-06-05" }),
        t({ id: "later", dueDate: "2026-06-20" }),
      ],
      WIN,
      NOW,
      UTC,
    ),
    statsCase(
      "computeTaskStats / rates adherence by completing on or before the due day",
      [
        done({ id: "ontime", dueDate: "2026-06-02", completedAt: T0 + 10 * HOUR }),
        done({ id: "late", dueDate: "2026-06-01", completedAt: T0 + 2 * DAY + HOUR }),
        t({ id: "open", dueDate: "2026-06-05" }),
      ],
      WIN,
      NOW,
      UTC,
    ),
    statsCase("computeTaskStats / returns null rates when their denominators are empty", [t({ id: "x" })], WIN, NOW, UTC),
    statsCase(
      "computeTaskStats / counts open tasks overdue as of now (due day fully past, viewer zone)",
      [
        t({ id: "over", dueDate: "2026-06-02" }),
        t({ id: "today", dueDate: "2026-06-03" }),
        done({ id: "doneover", dueDate: "2026-06-01", completedAt: T0 + 2 * DAY }),
      ],
      WIN,
      NOW,
      UTC,
    ),
    statsCase(
      "computeTaskStats / computes completion rate over tasks created in the window",
      [t({ id: "a", createdAt: T0 + HOUR }), done({ id: "b", createdAt: T0 + HOUR, completedAt: T0 + DAY })],
      WIN,
      NOW,
      UTC,
    ),
    statsCase(
      "computeTaskStats / takes the median lead time of window completions",
      [
        done({ id: "a", createdAt: T0, completedAt: T0 + DAY }),
        done({ id: "b", createdAt: T0, completedAt: T0 + 3 * DAY }),
        done({ id: "c", createdAt: T0, completedAt: T0 + 5 * DAY }),
      ],
      WIN,
      NOW,
      UTC,
    ),
    statsCase("no tasks", [], WIN, NOW, UTC),
    statsCase(
      "overdue ignores the window",
      [t({ id: "ancient", dueDate: "2025-12-31" }), t({ id: "future", dueDate: "2026-07-01" })],
      WIN,
      NOW,
      UTC,
    ),
  ];
  for (const zone of ZONES) {
    for (const date of ZONE_DAYS[zone]) {
      const noon = wall(zone, `${date}T12:00`);
      const window = resolvePeriod({ preset: "this-week", granularity: "day" }, { timeZone: zone, now: noon }).window;
      const tasks = edgeTasks(zone, date, window);
      // The overdue edge: the task due the day before turns overdue at local midnight.
      const nows: [string, Ms][] = [
        ["00:30 local", wall(zone, `${date}T00:30`)],
        ["23:30 local the day before", wall(zone, `${addDate(date, -1)}T23:30`)],
      ];
      for (const [label, now] of nows) cases.push(statsCase(`${zone} ${date}: edges, now ${label}`, tasks, window, now, zone));
      for (const count of [3, 4]) {
        cases.push(
          statsCase(`${zone} ${date}: ${count} lead times`, leadTimeTasks(window, count), window, noon, zone),
        );
      }
    }
  }
  ZONES.forEach((zone, z) => {
    const date = ZONE_DAYS[zone][0];
    const now = wall(zone, `${date}T12:00`);
    const window = resolvePeriod({ preset: "this-month", granularity: "day" }, { timeZone: zone, now }).window;
    cases.push(statsCase(`${zone} ${date}: random tasks, this month`, randomTasks(zone, window, 300 + z), window, now, zone));
  });
  return cases;
}

function velocityCases(): Case[] {
  const cases: Case[] = [
    velocityCase(
      "taskVelocity / counts created vs completed per bucket",
      [
        t({ id: "a", createdAt: T0 + HOUR }),
        done({ id: "b", createdAt: T0 + HOUR, completedAt: T0 + DAY + HOUR }),
        t({ id: "sub", parentId: "a", createdAt: T0 + HOUR }),
      ],
      [
        { start: T0, end: T0 + DAY },
        { start: T0 + DAY, end: T0 + 2 * DAY },
      ],
    ),
    velocityCase("no buckets", [t({ id: "a", createdAt: T0 + HOUR })], []),
    velocityCase(
      "bucket edges are half-open",
      [
        t({ id: "at-start", createdAt: T0 }),
        t({ id: "at-boundary", createdAt: T0 + DAY, completedAt: T0 + DAY }),
        t({ id: "at-end", createdAt: T0 + 2 * DAY, completedAt: T0 + 2 * DAY - 1 }),
      ],
      [
        { start: T0, end: T0 + DAY },
        { start: T0 + DAY, end: T0 + 2 * DAY },
      ],
    ),
  ];
  ZONES.forEach((zone, z) => {
    const date = ZONE_DAYS[zone][ZONE_DAYS[zone].length - 1];
    const now = wall(zone, `${date}T12:00`);
    const week = resolvePeriod({ preset: "this-week", granularity: "day" }, { timeZone: zone, now });
    cases.push(velocityCase(`${zone} ${date}: day buckets`, randomTasks(zone, week.window, 400 + z), week.buckets));
    // Six weeks ending on `date`, in week buckets (the first one clipped).
    const sixWeeks = resolvePeriod(
      { preset: "custom", customFrom: dayStart(zone, addDate(date, -41)), customTo: dayStart(zone, date), granularity: "week" },
      { timeZone: zone, now },
    );
    cases.push(
      velocityCase(`${zone} ${date}: week buckets`, randomTasks(zone, sixWeeks.window, 500 + z), sixWeeks.buckets),
    );
  });
  return cases;
}

export function build(): Record<(typeof sections)[number], Case[]> {
  return { computeTaskStats: statsCases(), taskVelocity: velocityCases() };
}
