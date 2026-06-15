import { describe, it, expect } from "vitest";
import { computeForecast, type ForecastInput } from "@/lib/analytics/forecast";
import type { Occurrence, TaskRow, TimeWindow } from "@/lib/types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Monday 2026-06-01 00:00 UTC; the FUTURE window is the week after. */
const T0 = Date.UTC(2026, 5, 1);
const F0 = T0 + 7 * DAY; // Mon 2026-06-08
const UTC = "UTC";

let seq = 0;

function occ(over: Partial<Occurrence> = {}): Occurrence {
  seq += 1;
  return {
    key: `k${seq}`,
    eventId: `e${seq}`,
    occurrenceDate: over.start ?? F0,
    start: F0,
    end: F0 + HOUR,
    allDay: false,
    inactive: false,
    status: "confirmed",
    title: "Event",
    description: null,
    location: null,
    categoryId: null,
    color: null,
    kind: "event",
    ownerId: "m1",
    isPrivate: false,
    isShared: false,
    taskId: null,
    attributes: {},
    isRecurring: false,
    isException: false,
    ...over,
  };
}

function task(over: Partial<TaskRow> = {}): TaskRow {
  seq += 1;
  return {
    id: `t${seq}`,
    workspaceId: "w1",
    ownerId: "m1",
    assigneeId: null,
    parentId: null,
    collectionId: null,
    categoryId: null,
    title: "Task",
    description: null,
    isPrivate: false,
    color: null,
    boardId: null,
    priority: 3,
    dueDate: null,
    startDate: null,
    isMilestone: false,
    position: 0,
    sequential: false,
    completedAt: null,
    attributes: {},
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

const history = (hours: number[]) =>
  hours.map((h, i) => ({ dayMs: T0 + i * DAY, ms: h * HOUR }));

/** Future week Jun 8–14, history week Jun 1–7, "now" Sunday evening before. */
function makeInput(over: Partial<ForecastInput> = {}): ForecastInput {
  const futureWindow: TimeWindow = { start: F0, end: F0 + 7 * DAY };
  return {
    futureOccurrences: [],
    futureDays: Array.from({ length: 7 }, (_, i) => F0 + i * DAY),
    futureWindow,
    historyPerDay: history([4, 0, 4, 6, 0, 4, 8]),
    tasks: [],
    timeZone: UTC,
    now: F0 - 4 * HOUR,
    ...over,
  };
}

describe("computeForecast — committed time", () => {
  it("splits multi-day occurrences across day buckets and excludes inactive ones", () => {
    const input = makeInput({
      futureOccurrences: [
        occ({ start: F0 + 23 * HOUR, end: F0 + DAY + 2 * HOUR }), // 1h Mon + 2h Tue
        occ({ start: F0 + DAY + 9 * HOUR, end: F0 + DAY + 12 * HOUR }), // 3h Tue
        occ({ start: F0 + 8 * HOUR, end: F0 + 16 * HOUR, inactive: true }), // sleep — ignored
      ],
    });
    const f = computeForecast(input);
    expect(f.perDay.map((d) => d.committedMs)).toEqual([
      1 * HOUR,
      5 * HOUR,
      0,
      0,
      0,
      0,
      0,
    ]);
    expect(f.perDay[0].dayMs).toBe(F0);
  });

  it("clips occurrences to the future window", () => {
    const input = makeInput({
      // Starts 2h before the window: only the in-window hour counts.
      futureOccurrences: [occ({ start: F0 - 2 * HOUR, end: F0 + HOUR })],
    });
    expect(computeForecast(input).perDay[0].committedMs).toBe(HOUR);
  });

  it("picks the busiest day, or null when nothing is committed", () => {
    const input = makeInput({
      futureOccurrences: [
        occ({ start: F0 + 9 * HOUR, end: F0 + 11 * HOUR }),
        occ({ start: F0 + 2 * DAY + 9 * HOUR, end: F0 + 2 * DAY + 14 * HOUR }),
      ],
    });
    expect(computeForecast(input).busiestDay).toEqual({
      dayMs: F0 + 2 * DAY,
      ms: 5 * HOUR,
    });
    expect(computeForecast(makeInput()).busiestDay).toBeNull();
  });
});

describe("computeForecast — capacity", () => {
  it("takes the median of NONZERO history days as the typical day", () => {
    // Nonzero: [4, 4, 6, 4, 8] → median 4h (same rule as the overload baseline).
    expect(computeForecast(makeInput()).typicalDayMs).toBe(4 * HOUR);
  });

  it("computes capacityRatio = committed / (typical × days)", () => {
    const input = makeInput({
      futureOccurrences: [occ({ start: F0 + 9 * HOUR, end: F0 + 23 * HOUR })], // 14h
    });
    expect(computeForecast(input).capacityRatio).toBeCloseTo(
      (14 * HOUR) / (4 * HOUR * 7),
    );
  });

  it("is null when the history has no nonzero days", () => {
    const input = makeInput({
      historyPerDay: history([0, 0, 0]),
      futureOccurrences: [occ()],
    });
    const f = computeForecast(input);
    expect(f.typicalDayMs).toBe(0);
    expect(f.capacityRatio).toBeNull();
  });
});

describe("computeForecast — dueUnscheduled", () => {
  it("lists open top-level tasks due in the window with no scheduled block, by due date", () => {
    const input = makeInput({
      tasks: [
        task({ id: "t-late", title: "Later", dueDate: "2026-06-13" }),
        task({ id: "t-soon", title: "Sooner", dueDate: "2026-06-09" }),
      ],
    });
    expect(computeForecast(input).dueUnscheduled).toEqual([
      { taskId: "t-soon", title: "Sooner", dueDate: "2026-06-09" },
      { taskId: "t-late", title: "Later", dueDate: "2026-06-13" },
    ]);
  });

  it("excludes a task with a scheduled block in the future window", () => {
    const input = makeInput({
      tasks: [
        task({ id: "t-blocked", dueDate: "2026-06-10" }),
        task({ id: "t-free", dueDate: "2026-06-10" }),
      ],
      futureOccurrences: [
        occ({ taskId: "t-blocked", start: F0 + 9 * HOUR, end: F0 + 10 * HOUR }),
      ],
    });
    expect(computeForecast(input).dueUnscheduled.map((t) => t.taskId)).toEqual([
      "t-free",
    ]);
  });

  it("excludes done tasks, subtasks, undated tasks, and due dates outside the window", () => {
    const input = makeInput({
      tasks: [
        task({ dueDate: "2026-06-10", completedAt: T0 }),
        task({ dueDate: "2026-06-10", parentId: "parent" }),
        task({ dueDate: null }),
        task({ dueDate: "2026-06-07" }), // before the window
        task({ dueDate: "2026-06-15" }), // at the exclusive end
      ],
    });
    expect(computeForecast(input).dueUnscheduled).toEqual([]);
  });

  it("includes tasks of any priority (unlike the suggestions rule, which is P3-only)", () => {
    const input = makeInput({
      tasks: [task({ id: "t-p0", dueDate: "2026-06-08", priority: 0 })],
    });
    expect(computeForecast(input).dueUnscheduled.map((t) => t.taskId)).toEqual([
      "t-p0",
    ]);
  });
});
