import { describe, it, expect } from "vitest";
import {
  DAY_MS,
  buildFlowLanes,
  flowsWindow,
  layoutRows,
  xForTime,
  FLOW_GEOM,
} from "@/lib/tasks/flows-layout";
import type { TaskRow, TaskStatusEvent } from "@/lib/types";

const T0 = Date.UTC(2026, 5, 1); // Mon 1 Jun 2026 UTC
const now = T0 + 10 * DAY_MS;

function task(over: Partial<TaskRow>): TaskRow {
  return {
    id: "t",
    workspaceId: "w",
    ownerId: "me",
    assigneeId: null,
    parentId: null,
    boardId: null,
    categoryId: null,
    title: "t",
    description: null,
    isPrivate: false,
    color: null,
    status: "todo",
    priority: null,
    dueDate: null,
    position: 0,
    sequential: false,
    completedAt: null,
    attributes: {},
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

function ev(over: Partial<TaskStatusEvent>): TaskStatusEvent {
  return {
    id: "e",
    taskId: "t",
    workspaceId: "w",
    fromStatus: null,
    toStatus: "todo",
    changedBy: "me",
    changedAt: T0,
    ...over,
  };
}

const noChildren = new Map<string | null, TaskRow[]>();

describe("buildFlowLanes", () => {
  it("derives created/started/done nodes and a closed span for a done task", () => {
    const tk = task({ id: "a", status: "done", completedAt: T0 + 5 * DAY_MS });
    const events = new Map<string, TaskStatusEvent[]>([
      [
        "a",
        [
          ev({ taskId: "a", fromStatus: null, toStatus: "todo", changedAt: T0 }),
          ev({ taskId: "a", fromStatus: "todo", toStatus: "in_progress", changedAt: T0 + 2 * DAY_MS }),
          ev({ taskId: "a", fromStatus: "in_progress", toStatus: "done", changedAt: T0 + 5 * DAY_MS }),
        ],
      ],
    ]);
    const [lane] = buildFlowLanes({ topLevel: [tk], childrenByParent: noChildren, eventsByTask: events, nowMs: now });
    expect(lane.startMs).toBe(T0);
    expect(lane.endMs).toBe(T0 + 5 * DAY_MS);
    expect(lane.nodes.map((n) => n.kind)).toEqual(["created", "started", "done"]);
  });

  it("classifies a backfilled completion (from_status null, to done) as done, not created", () => {
    const tk = task({ id: "b", status: "done", completedAt: T0 + 3 * DAY_MS });
    const events = new Map<string, TaskStatusEvent[]>([
      [
        "b",
        [
          ev({ taskId: "b", fromStatus: null, toStatus: "todo", changedAt: T0 }),
          ev({ taskId: "b", fromStatus: null, toStatus: "done", changedAt: T0 + 3 * DAY_MS }),
        ],
      ],
    ]);
    const [lane] = buildFlowLanes({ topLevel: [tk], childrenByParent: noChildren, eventsByTask: events, nowMs: now });
    expect(lane.nodes.map((n) => n.kind)).toEqual(["created", "done"]);
  });

  it("leaves an open task's endMs null and flags an overdue due marker", () => {
    const tk = task({ id: "c", status: "todo", dueDate: "2026-06-05" }); // before now (11 Jun)
    const events = new Map<string, TaskStatusEvent[]>([
      ["c", [ev({ taskId: "c", changedAt: T0 })]],
    ]);
    const [lane] = buildFlowLanes({ topLevel: [tk], childrenByParent: noChildren, eventsByTask: events, nowMs: now });
    expect(lane.endMs).toBeNull();
    const due = lane.nodes.find((n) => n.kind === "due");
    expect(due?.overdue).toBe(true);
  });

  it("attaches subtasks as branches and sorts open lanes before done", () => {
    const open = task({ id: "open", status: "todo", createdAt: T0 + DAY_MS });
    const done = task({ id: "done", status: "done", completedAt: T0 + 2 * DAY_MS, createdAt: T0 });
    const child = task({ id: "kid", parentId: "open", createdAt: T0 + 2 * DAY_MS });
    const children = new Map<string | null, TaskRow[]>([["open", [child]]]);
    const events = new Map<string, TaskStatusEvent[]>([
      ["open", [ev({ taskId: "open", changedAt: T0 + DAY_MS })]],
      ["done", [ev({ taskId: "done", changedAt: T0 }), ev({ taskId: "done", fromStatus: null, toStatus: "done", changedAt: T0 + 2 * DAY_MS })]],
      ["kid", [ev({ taskId: "kid", changedAt: T0 + 2 * DAY_MS })]],
    ]);
    const lanes = buildFlowLanes({ topLevel: [done, open], childrenByParent: children, eventsByTask: events, nowMs: now });
    expect(lanes[0].task.id).toBe("open"); // open before done
    expect(lanes[0].branches).toHaveLength(1);
    expect(lanes[1].task.id).toBe("done");
  });
});

describe("flowsWindow + xForTime", () => {
  it("clamps the left edge to the lookback and maps time linearly", () => {
    const old = task({ id: "old", createdAt: T0 - 400 * DAY_MS });
    const events = new Map<string, TaskStatusEvent[]>([
      ["old", [ev({ taskId: "old", changedAt: T0 - 400 * DAY_MS })]],
    ]);
    const lanes = buildFlowLanes({ topLevel: [old], childrenByParent: noChildren, eventsByTask: events, nowMs: now });
    const { t0, t1 } = flowsWindow(lanes, now, { lookbackDays: 90, padDays: 1 });
    // left edge clamped to ~ now - 90d - 1d pad, not 400 days back
    expect(t0).toBeGreaterThan(now - 92 * DAY_MS);
    expect(xForTime(t0, t0, 10)).toBe(0);
    expect(xForTime(t0 + DAY_MS, t0, 10)).toBe(10);
    expect(t1).toBeGreaterThan(t0);
  });
});

describe("layoutRows", () => {
  it("reserves a sub-row per branch only when expanded", () => {
    const parent = task({ id: "p" });
    const child = task({ id: "k", parentId: "p" });
    const children = new Map<string | null, TaskRow[]>([["p", [child]]]);
    const events = new Map<string, TaskStatusEvent[]>([
      ["p", [ev({ taskId: "p", changedAt: T0 })]],
      ["k", [ev({ taskId: "k", changedAt: T0 })]],
    ]);
    const lanes = buildFlowLanes({ topLevel: [parent], childrenByParent: children, eventsByTask: events, nowMs: now });

    const collapsed = layoutRows(lanes, new Set());
    expect(collapsed.totalHeight).toBe(FLOW_GEOM.laneHeight);
    expect(collapsed.rows[0].branchRows).toHaveLength(0);

    const open = layoutRows(lanes, new Set(["p"]));
    expect(open.totalHeight).toBe(FLOW_GEOM.laneHeight + FLOW_GEOM.subRowHeight);
    expect(open.rows[0].branchRows).toHaveLength(1);
  });
});
