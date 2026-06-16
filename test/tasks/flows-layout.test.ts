import { describe, it, expect } from "vitest";
import {
  DAY_MS,
  buildFlowLanes,
  flowsWindow,
  layoutRows,
  xForTime,
  FLOW_GEOM,
} from "@/lib/tasks/flows-layout";
import type { EventRow, TaskRow, TaskStatusEvent } from "@/lib/types";

const T0 = Date.UTC(2026, 5, 1); // Mon 1 Jun 2026 UTC
const now = T0 + 10 * DAY_MS;

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
    boardId: null,
    priority: null,
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

function ev(over: Partial<TaskStatusEvent>): TaskStatusEvent {
  return {
    id: "e",
    taskId: "t",
    workspaceId: "w",
    fromBoardId: null,
    toBoardId: "b-todo",
    toIsDone: false,
    changedBy: "me",
    changedAt: T0,
    ...over,
  };
}

function block(over: Partial<EventRow>): EventRow {
  return {
    id: "blk",
    workspaceId: "w",
    ownerId: "me",
    categoryId: null,
    title: "blk",
    description: null,
    location: null,
    isPrivate: false,
    isShared: false,
    color: null,
    kind: "event",
    allDay: false,
    inactive: false,
    status: "confirmed",
    start: T0,
    end: T0 + 3_600_000,
    timeZone: "UTC",
    rrule: null,
    recurrenceEndsAt: null,
    taskId: "t",
    attributes: {},
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

const noChildren = new Map<string | null, TaskRow[]>();

describe("buildFlowLanes", () => {
  it("derives created/started/done nodes and a closed span for a done task", () => {
    const tk = task({ id: "a", completedAt: T0 + 5 * DAY_MS });
    const events = new Map<string, TaskStatusEvent[]>([
      [
        "a",
        [
          ev({ taskId: "a", changedAt: T0 }),
          ev({ taskId: "a", fromBoardId: "b-todo", toBoardId: "b-prog", changedAt: T0 + 2 * DAY_MS }),
          ev({ taskId: "a", fromBoardId: "b-prog", toBoardId: "b-done", toIsDone: true, changedAt: T0 + 5 * DAY_MS }),
        ],
      ],
    ]);
    const [lane] = buildFlowLanes({ topLevel: [tk], childrenByParent: noChildren, eventsByTask: events, nowMs: now });
    expect(lane.startMs).toBe(T0);
    expect(lane.endMs).toBe(T0 + 5 * DAY_MS);
    expect(lane.nodes.map((n) => n.kind)).toEqual(["created", "started", "done"]);
  });

  it("classifies a backfilled completion (from_status null, to done) as done, not created", () => {
    const tk = task({ id: "b", completedAt: T0 + 3 * DAY_MS });
    const events = new Map<string, TaskStatusEvent[]>([
      [
        "b",
        [
          ev({ taskId: "b", changedAt: T0 }),
          ev({ taskId: "b", toIsDone: true, changedAt: T0 + 3 * DAY_MS }),
        ],
      ],
    ]);
    const [lane] = buildFlowLanes({ topLevel: [tk], childrenByParent: noChildren, eventsByTask: events, nowMs: now });
    expect(lane.nodes.map((n) => n.kind)).toEqual(["created", "done"]);
  });

  it("leaves an open task's endMs null and flags an overdue due marker", () => {
    const tk = task({ id: "c", dueDate: "2026-06-05" }); // before now (11 Jun)
    const events = new Map<string, TaskStatusEvent[]>([
      ["c", [ev({ taskId: "c", changedAt: T0 })]],
    ]);
    const [lane] = buildFlowLanes({ topLevel: [tk], childrenByParent: noChildren, eventsByTask: events, nowMs: now });
    expect(lane.endMs).toBeNull();
    const due = lane.nodes.find((n) => n.kind === "due");
    expect(due?.overdue).toBe(true);
  });

  it("anchors the trunk to an explicit start date, overriding the creation event", () => {
    // created day 0, but planned to start on day 4 — the left edge follows the plan
    const tk = task({ id: "s", startDate: "2026-06-05", createdAt: T0 });
    const events = new Map<string, TaskStatusEvent[]>([
      ["s", [ev({ taskId: "s", changedAt: T0 })]],
    ]);
    const [lane] = buildFlowLanes({ topLevel: [tk], childrenByParent: noChildren, eventsByTask: events, nowMs: now });
    expect(lane.startMs).toBe(Date.UTC(2026, 5, 5));
    expect(lane.milestone).toBe(false);
  });

  it("never clips work that began before its planned start", () => {
    // planned day 4, but actually started day 2 — trunk begins at the earlier of the two
    const tk = task({ id: "e", startDate: "2026-06-05", createdAt: T0 });
    const events = new Map<string, TaskStatusEvent[]>([
      [
        "e",
        [
          ev({ taskId: "e", changedAt: T0 }),
          ev({ taskId: "e", fromBoardId: "b-todo", toBoardId: "b-prog", changedAt: T0 + 2 * DAY_MS }),
        ],
      ],
    ]);
    const [lane] = buildFlowLanes({ topLevel: [tk], childrenByParent: noChildren, eventsByTask: events, nowMs: now });
    expect(lane.startMs).toBe(T0 + 2 * DAY_MS);
  });

  it("carries the milestone flag onto the segment", () => {
    const tk = task({ id: "m", isMilestone: true, startDate: "2026-06-20" });
    const events = new Map<string, TaskStatusEvent[]>([
      ["m", [ev({ taskId: "m", changedAt: T0 })]],
    ]);
    const [lane] = buildFlowLanes({ topLevel: [tk], childrenByParent: noChildren, eventsByTask: events, nowMs: now });
    expect(lane.milestone).toBe(true);
    expect(lane.startMs).toBe(Date.UTC(2026, 5, 20));
  });

  it("adds a scheduled node per linked block without moving the planned span", () => {
    const tk = task({ id: "sch", startDate: "2026-06-03", createdAt: T0 });
    const events = new Map<string, TaskStatusEvent[]>([
      ["sch", [ev({ taskId: "sch", changedAt: T0 })]],
    ]);
    const blocks = new Map<string, EventRow[]>([
      [
        "sch",
        [
          block({ id: "b1", taskId: "sch", start: T0 + 4 * DAY_MS }),
          block({ id: "b2", taskId: "sch", start: T0 + 6 * DAY_MS }),
        ],
      ],
    ]);
    const [lane] = buildFlowLanes({
      topLevel: [tk],
      childrenByParent: noChildren,
      eventsByTask: events,
      blocksByTask: blocks,
      nowMs: now,
    });
    const scheduled = lane.nodes.filter((n) => n.kind === "scheduled");
    expect(scheduled.map((n) => n.ms)).toEqual([T0 + 4 * DAY_MS, T0 + 6 * DAY_MS]);
    // planned start stays put (3 Jun); blocks never move the span left edge
    expect(lane.startMs).toBe(Date.UTC(2026, 5, 3));
  });

  it("includes a scheduled marker on a future, not-yet-started task and extends the window", () => {
    const tk = task({ id: "future", createdAt: T0 });
    const events = new Map<string, TaskStatusEvent[]>([
      ["future", [ev({ taskId: "future", changedAt: T0 })]],
    ]);
    const blocks = new Map<string, EventRow[]>([
      ["future", [block({ id: "fb", taskId: "future", start: Date.UTC(2026, 6, 15) })]],
    ]);
    const lanes = buildFlowLanes({
      topLevel: [tk],
      childrenByParent: noChildren,
      eventsByTask: events,
      blocksByTask: blocks,
      nowMs: now,
    });
    expect(lanes[0].nodes.some((n) => n.kind === "scheduled")).toBe(true);
    const { t1 } = flowsWindow(lanes, now, { lookbackDays: 90, padDays: 1 });
    // window reaches the future block (15 Jul), not just clamped near `now` (11 Jun)
    expect(t1).toBeGreaterThanOrEqual(Date.UTC(2026, 6, 15));
  });

  it("attaches subtasks as branches and sorts open lanes before done", () => {
    const open = task({ id: "open", createdAt: T0 + DAY_MS });
    const done = task({ id: "done", completedAt: T0 + 2 * DAY_MS, createdAt: T0 });
    const child = task({ id: "kid", parentId: "open", createdAt: T0 + 2 * DAY_MS });
    const children = new Map<string | null, TaskRow[]>([["open", [child]]]);
    const events = new Map<string, TaskStatusEvent[]>([
      ["open", [ev({ taskId: "open", changedAt: T0 + DAY_MS })]],
      ["done", [ev({ taskId: "done", changedAt: T0 }), ev({ taskId: "done", toIsDone: true, changedAt: T0 + 2 * DAY_MS })]],
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

  it("extends the right edge to include a future planned start", () => {
    const future = task({ id: "f", startDate: "2026-07-01", createdAt: T0 });
    const events = new Map<string, TaskStatusEvent[]>([
      ["f", [ev({ taskId: "f", changedAt: T0 })]],
    ]);
    const lanes = buildFlowLanes({ topLevel: [future], childrenByParent: noChildren, eventsByTask: events, nowMs: now });
    const { t1 } = flowsWindow(lanes, now, { lookbackDays: 90, padDays: 1 });
    // window reaches past the future start (1 Jul), not just clamped near `now` (11 Jun)
    expect(t1).toBeGreaterThanOrEqual(Date.UTC(2026, 6, 1));
  });
});

describe("layoutRows", () => {
  // The implicit no-grouping group: a single headerless bucket of lanes.
  const flat = (lanes: ReturnType<typeof buildFlowLanes>) => [
    { key: "all", label: "", lanes, header: false },
  ];

  it("reserves a sub-row per branch only when expanded", () => {
    const parent = task({ id: "p" });
    const child = task({ id: "k", parentId: "p" });
    const children = new Map<string | null, TaskRow[]>([["p", [child]]]);
    const events = new Map<string, TaskStatusEvent[]>([
      ["p", [ev({ taskId: "p", changedAt: T0 })]],
      ["k", [ev({ taskId: "k", changedAt: T0 })]],
    ]);
    const lanes = buildFlowLanes({ topLevel: [parent], childrenByParent: children, eventsByTask: events, nowMs: now });

    const collapsed = layoutRows(flat(lanes), new Set());
    expect(collapsed.totalHeight).toBe(FLOW_GEOM.laneHeight);
    const c0 = collapsed.rows[0];
    expect(c0.kind).toBe("lane");
    if (c0.kind === "lane") expect(c0.branchRows).toHaveLength(0);

    const open = layoutRows(flat(lanes), new Set(["p"]));
    expect(open.totalHeight).toBe(FLOW_GEOM.laneHeight + FLOW_GEOM.subRowHeight);
    const o0 = open.rows[0];
    if (o0.kind === "lane") expect(o0.branchRows).toHaveLength(1);
  });

  it("a headerless group is identical to the ungrouped baseline (no group rows)", () => {
    const lanes = buildFlowLanes({
      topLevel: [task({ id: "a" }), task({ id: "b" })],
      childrenByParent: noChildren,
      eventsByTask: new Map(),
      nowMs: now,
    });
    const { rows, totalHeight } = layoutRows(flat(lanes), new Set());
    expect(rows.every((r) => r.kind === "lane")).toBe(true);
    expect(totalHeight).toBe(2 * FLOW_GEOM.laneHeight);
  });

  it("emits a header row per group and offsets the lanes below it", () => {
    const lanes = buildFlowLanes({
      topLevel: [task({ id: "a" }), task({ id: "b" })],
      childrenByParent: noChildren,
      eventsByTask: new Map(),
      nowMs: now,
    });
    const groups = [
      { key: "g1", label: "To Do", lanes: [lanes[0]], header: true },
      { key: "g2", label: "Done", lanes: [lanes[1]], header: true },
    ];
    const { rows, totalHeight } = layoutRows(groups, new Set());
    expect(rows.map((r) => r.kind)).toEqual(["group", "lane", "group", "lane"]);
    expect(rows[0].top).toBe(0);
    expect(rows[1].top).toBe(FLOW_GEOM.groupHeaderHeight);
    // second header sits below the first header + its one lane
    expect(rows[2].top).toBe(FLOW_GEOM.groupHeaderHeight + FLOW_GEOM.laneHeight);
    expect(totalHeight).toBe(2 * FLOW_GEOM.groupHeaderHeight + 2 * FLOW_GEOM.laneHeight);
    const header = rows[0];
    if (header.kind === "group") expect(header.count).toBe(1);
  });
});
