import { describe, it, expect } from "vitest";
import {
  DAY_MS,
  FLOW_GEOM,
  buildFlowLanes,
  flowsWindow,
  type FlowSegment,
} from "@/lib/tasks/flows-layout";
import {
  RUNWAY_FADE_DAYS,
  runwayDueLabel,
  runwayOf,
  runwayReachMs,
  stackSlots,
} from "@/lib/tasks/flows-runway";
import type { TaskRow } from "@/lib/types";

const T0 = Date.UTC(2026, 5, 1); // Mon 1 Jun 2026 UTC
const now = T0 + 10 * DAY_MS + 12 * 3_600_000; // Thu 11 Jun, midday
const today = "2026-06-11";
const none = { done: 0, total: 0 };

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
    tags: [],
    createdAt: T0,
    updatedAt: T0,
    updatedBy: null,
    ...over,
  };
}

function seg(over: Partial<TaskRow>, endMs: number | null = null, startMs = T0): FlowSegment {
  const t = task(over);
  return { task: t, startMs, endMs, nodes: [], milestone: t.isMilestone, checkpoints: [] };
}

describe("runwayOf", () => {
  it("runs an open task from its start to the end of its deadline day", () => {
    const r = runwayOf(seg({ dueDate: "2026-06-12" }), now, none, { today })!;
    expect(r.state).toBe("open");
    expect(r.startMs).toBe(T0);
    expect(r.endMs).toBe(Date.UTC(2026, 5, 13));
    expect(r.deadlineMs).toBe(Date.UTC(2026, 5, 13));
    expect(r.openEnded).toBe(false);
    expect(r.overrun).toBeNull();
  });

  it("fills by the share of done subtasks, and not at all without subtasks", () => {
    const s = seg({ dueDate: "2026-06-12" });
    expect(runwayOf(s, now, { done: 2, total: 5 })!.progress).toBeCloseTo(0.4);
    expect(runwayOf(s, now, none)!.progress).toBe(0);
    // malformed counts are clamped, never > 1 or NaN
    expect(runwayOf(s, now, { done: 9, total: 3 })!.progress).toBe(1);
    expect(runwayOf(s, now, { done: 2, total: 5 })!.subtasks).toEqual({ done: 2, total: 5 });
  });

  it("is not late on its due day, and late the day after with an overrun to now", () => {
    const dueToday = runwayOf(seg({ dueDate: today }), now, none, { today })!;
    expect(dueToday.state).toBe("open");
    expect(dueToday.overrun).toBeNull();

    const late = runwayOf(seg({ dueDate: "2026-06-09" }), now, none, { today })!;
    expect(late.state).toBe("late");
    expect(late.endMs).toBe(Date.UTC(2026, 5, 10)); // the bar keeps its deadline edge
    expect(late.overrun).toEqual({ fromMs: Date.UTC(2026, 5, 10), toMs: now });
    expect(runwayReachMs(late)).toBe(now);
  });

  it("decides lateness by the clock when no today token is given", () => {
    expect(runwayOf(seg({ dueDate: "2026-06-10" }), now, none)!.state).toBe("late");
    expect(runwayOf(seg({ dueDate: "2026-06-11" }), now, none)!.state).toBe("open");
  });

  it("keeps the overrun non-negative when today runs ahead of the UTC clock", () => {
    // Viewer east of UTC: their calendar already says the 12th while the clock
    // still sits before the end of the 11th (UTC).
    const r = runwayOf(seg({ dueDate: "2026-06-11" }), now, none, { today: "2026-06-12" })!;
    expect(r.state).toBe("late");
    expect(r.overrun!.toMs).toBeGreaterThanOrEqual(r.overrun!.fromMs);
  });

  it("draws a done task fully filled, from start to completion", () => {
    const done = T0 + 6 * DAY_MS;
    const r = runwayOf(seg({ completedAt: done, dueDate: "2026-06-30" }, done), now, {
      done: 1,
      total: 4,
    })!;
    expect(r.state).toBe("done");
    expect(r.endMs).toBe(done);
    expect(r.progress).toBe(1);
    expect(r.overrun).toBeNull();
  });

  it("gives a task with no deadline an open end that fades past now", () => {
    const r = runwayOf(seg({}), now, none)!;
    expect(r.state).toBe("open-ended");
    expect(r.openEnded).toBe(true);
    expect(r.deadlineMs).toBeNull();
    expect(r.endMs).toBe(now + RUNWAY_FADE_DAYS * DAY_MS);
    expect(runwayOf(seg({}), now, none, { fadeMs: DAY_MS })!.endMs).toBe(now + DAY_MS);
  });

  it("marks a future start as planned, with or without a deadline", () => {
    const start = now + 4 * DAY_MS;
    const dated = runwayOf(seg({ dueDate: "2026-06-20" }, null, start), now, none, { today })!;
    expect(dated.state).toBe("planned");
    expect(dated.startMs).toBe(start);
    expect(dated.endMs).toBe(Date.UTC(2026, 5, 21));
    const undated = runwayOf(seg({}, null, start), now, none)!;
    expect(undated.state).toBe("planned");
    expect(undated.openEnded).toBe(true);
    expect(undated.endMs).toBe(start + RUNWAY_FADE_DAYS * DAY_MS);
  });

  it("never ends before it starts (a deadline before the start)", () => {
    const start = now + 4 * DAY_MS;
    const r = runwayOf(seg({ dueDate: "2026-06-12" }, null, start), now, none, { today })!;
    expect(r.endMs).toBe(start);
  });

  it("has no runway for a milestone", () => {
    expect(runwayOf(seg({ isMilestone: true }), now, none)).toBeNull();
  });
});

describe("runwayDueLabel", () => {
  const r = (over: Partial<TaskRow>, endMs: number | null = null) =>
    runwayOf(seg(over, endMs), now, none, { today })!;

  it("names today, tomorrow, the weekday within the week, then the date", () => {
    expect(runwayDueLabel(r({ dueDate: today }), today, today)).toEqual({ kind: "today" });
    expect(runwayDueLabel(r({ dueDate: "2026-06-12" }), "2026-06-12", today)).toEqual({
      kind: "tomorrow",
    });
    expect(runwayDueLabel(r({ dueDate: "2026-06-13" }), "2026-06-13", today)).toEqual({
      kind: "weekday",
      dueDate: "2026-06-13",
    });
    expect(runwayDueLabel(r({ dueDate: "2026-06-17" }), "2026-06-17", today)).toEqual({
      kind: "weekday",
      dueDate: "2026-06-17",
    });
    expect(runwayDueLabel(r({ dueDate: "2026-06-18" }), "2026-06-18", today)).toEqual({
      kind: "date",
      dueDate: "2026-06-18",
    });
  });

  it("counts days over for a late runway", () => {
    expect(runwayDueLabel(r({ dueDate: "2026-06-09" }), "2026-06-09", today)).toEqual({
      kind: "over",
      days: 2,
    });
  });

  it("shows nothing for done, open-ended or undated runways", () => {
    const done = T0 + 3 * DAY_MS;
    expect(runwayDueLabel(r({ completedAt: done, dueDate: today }, done), today, today)).toBeNull();
    expect(runwayDueLabel(r({}), null, today)).toBeNull();
  });
});

describe("stackSlots", () => {
  it("fits as many slim bars as the row holds, centred, and counts the rest", () => {
    const s = stackSlots(9, FLOW_GEOM.streamHeight);
    // 52px row, 6px pad each side: 40px of room for 6px bars on a 3px gap
    expect(s.shown).toBe(4);
    expect(s.hidden).toBe(5);
    expect(s.tops).toHaveLength(4);
    const last = s.tops[3] + s.barHeight;
    expect(s.tops[0]).toBeGreaterThanOrEqual(6);
    expect(last).toBeLessThanOrEqual(FLOW_GEOM.streamHeight - 6);
    expect(s.tops[0]).toBeCloseTo(FLOW_GEOM.streamHeight - last);
  });

  it("shows everything when it fits, and nothing in a row with no room", () => {
    expect(stackSlots(2, 52)).toMatchObject({ shown: 2, hidden: 0 });
    expect(stackSlots(3, 8)).toMatchObject({ shown: 0, hidden: 3 });
  });
});

describe("runway geometry fits the lane", () => {
  it("leaves clear space above and below a trunk and a branch bar", () => {
    expect(FLOW_GEOM.runwayHeight).toBeLessThan(FLOW_GEOM.laneHeight - 2 * 8);
    expect(FLOW_GEOM.branchRunwayHeight).toBeLessThan(FLOW_GEOM.subRowHeight - 2 * 4);
  });

  it("frames a runway that ends well in the future inside the window", () => {
    const far = task({ id: "far", dueDate: "2026-08-20", createdAt: now - 2 * DAY_MS });
    const lanes = buildFlowLanes({
      topLevel: [far],
      childrenByParent: new Map(),
      eventsByTask: new Map(),
      nowMs: now,
    });
    const { t1 } = flowsWindow(lanes, now);
    const r = runwayOf(lanes[0], now, none, { today })!;
    expect(runwayReachMs(r)).toBeLessThanOrEqual(t1);
  });
});
