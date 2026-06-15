import { describe, it, expect } from "vitest";
import { computeTaskStats, taskVelocity, statsByCollection } from "@/lib/analytics/task-stats";
import type { Bucket } from "@/lib/insights/period";
import type { TaskRow, TimeWindow } from "@/lib/types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 5, 1); // Mon 1 Jun 2026 UTC
const UTC = "UTC";

// Window: this week [Mon 1 Jun, Mon 8 Jun). "now" is Wed 3 Jun noon.
const win: TimeWindow = { start: T0, end: T0 + 7 * DAY };
const now = T0 + 2 * DAY + 12 * HOUR;

function task(over: Partial<TaskRow>): TaskRow {
  return {
    id: "t",
    workspaceId: "w",
    ownerId: "me",
    assigneeId: null,
    parentId: null,
    collectionId: null,
    categoryId: null,
    title: "t",
    description: null,
    isPrivate: false,
    color: null,
    status: "todo",
    priority: null,
    dueDate: null,
    startDate: null,
    isMilestone: false,
    position: 0,
    sequential: false,
    completedAt: null,
    attributes: {},
    createdAt: T0 - 30 * DAY,
    updatedAt: T0,
    ...over,
  };
}

const done = (over: Partial<TaskRow>): TaskRow =>
  task({ status: "done", completedAt: T0 + DAY, ...over });

describe("computeTaskStats", () => {
  it("counts created/completed/due inside the window, top-level only", () => {
    const s = computeTaskStats(
      [
        task({ id: "a", createdAt: T0 + HOUR }),
        task({ id: "sub", parentId: "a", createdAt: T0 + HOUR }), // subtask ignored
        done({ id: "b", completedAt: T0 + DAY }),
        done({ id: "old", completedAt: T0 - DAY }), // before window
        task({ id: "c", dueDate: "2026-06-05" }),
        task({ id: "later", dueDate: "2026-06-20" }), // due after window
      ],
      win,
      now,
      UTC,
    );
    expect(s.createdCount).toBe(1);
    expect(s.completedCount).toBe(1);
    expect(s.dueCount).toBe(1);
  });

  it("rates adherence by completing on or before the due day", () => {
    const s = computeTaskStats(
      [
        // Due Tue, completed Mon → on time.
        done({ id: "ontime", dueDate: "2026-06-02", completedAt: T0 + 10 * HOUR }),
        // Due Mon, completed Wed → late.
        done({ id: "late", dueDate: "2026-06-01", completedAt: T0 + 2 * DAY + HOUR }),
        // Due Fri, still open → not yet adherent.
        task({ id: "open", dueDate: "2026-06-05" }),
      ],
      win,
      now,
      UTC,
    );
    expect(s.dueCount).toBe(3);
    expect(s.adherenceRate).toBeCloseTo(1 / 3);
  });

  it("returns null rates when their denominators are empty", () => {
    const s = computeTaskStats([task({ id: "x" })], win, now, UTC);
    expect(s.adherenceRate).toBeNull();
    expect(s.completionRate).toBeNull();
    expect(s.medianLeadTimeMs).toBeNull();
  });

  it("counts open tasks overdue as of now (due day fully past, viewer zone)", () => {
    const s = computeTaskStats(
      [
        task({ id: "over", dueDate: "2026-06-02" }), // due Tue, now Wed → overdue
        task({ id: "today", dueDate: "2026-06-03" }), // due today → not overdue yet
        done({ id: "doneover", dueDate: "2026-06-01", completedAt: T0 + 2 * DAY }), // done → not open
      ],
      win,
      now,
      UTC,
    );
    expect(s.overdueOpenCount).toBe(1);
  });

  it("computes completion rate over tasks created in the window", () => {
    const s = computeTaskStats(
      [
        task({ id: "a", createdAt: T0 + HOUR }),
        done({ id: "b", createdAt: T0 + HOUR, completedAt: T0 + DAY }),
      ],
      win,
      now,
      UTC,
    );
    expect(s.createdCount).toBe(2);
    expect(s.completionRate).toBe(0.5);
  });

  it("takes the median lead time of window completions", () => {
    const s = computeTaskStats(
      [
        done({ id: "a", createdAt: T0, completedAt: T0 + DAY }),
        done({ id: "b", createdAt: T0, completedAt: T0 + 3 * DAY }),
        done({ id: "c", createdAt: T0, completedAt: T0 + 5 * DAY }),
      ],
      win,
      now,
      UTC,
    );
    expect(s.medianLeadTimeMs).toBe(3 * DAY);
  });
});

describe("taskVelocity", () => {
  it("counts created vs completed per bucket", () => {
    const buckets: Bucket[] = [
      { start: T0, end: T0 + DAY },
      { start: T0 + DAY, end: T0 + 2 * DAY },
    ];
    const rows = taskVelocity(
      [
        task({ id: "a", createdAt: T0 + HOUR }),
        done({ id: "b", createdAt: T0 + HOUR, completedAt: T0 + DAY + HOUR }),
        task({ id: "sub", parentId: "a", createdAt: T0 + HOUR }), // ignored
      ],
      buckets,
    );
    expect(rows).toEqual([
      { start: T0, end: T0 + DAY, created: 2, completed: 0 },
      { start: T0 + DAY, end: T0 + 2 * DAY, created: 0, completed: 1 },
    ]);
  });
});

describe("statsByCollection", () => {
  it("groups per collection (null = no collection), most completed first", () => {
    const rows = statsByCollection(
      [
        done({ id: "a", collectionId: "b1", completedAt: T0 + DAY }),
        done({ id: "b", collectionId: "b1", completedAt: T0 + DAY }),
        task({ id: "c", collectionId: null, createdAt: T0 + HOUR }),
        task({ id: "d", collectionId: "b2", dueDate: "2026-06-02" }), // overdue open
      ],
      win,
      now,
      UTC,
    );
    expect(rows.map((r) => r.collectionId)).toEqual(["b1", null, "b2"]);
    expect(rows[0]).toMatchObject({ completedCount: 2 });
    expect(rows[1]).toMatchObject({ createdCount: 1 });
    expect(rows[2]).toMatchObject({ dueCount: 1, overdueOpenCount: 1 });
  });
});
