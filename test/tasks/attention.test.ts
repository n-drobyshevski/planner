import { describe, it, expect } from "vitest";
import {
  ATTENTION_HORIZON_DAYS,
  attentionInfo,
  attentionLevel,
  attentionScore,
  daysUntil,
  importanceOf,
  laneAttention,
  needsAttention,
  urgencyOf,
} from "@/lib/tasks/attention";
import type { FlowBranch, FlowLane } from "@/lib/tasks/flows-layout";
import type { TaskRow } from "@/lib/types";

const TODAY = "2026-06-10";
const T0 = Date.UTC(2026, 5, 1);

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

function lane(over: Partial<TaskRow>, branches: Partial<TaskRow>[] = []): FlowLane {
  const t = task(over);
  return {
    task: t,
    startMs: T0,
    endMs: null,
    nodes: [],
    milestone: false,
    checkpoints: [],
    done: t.completedAt != null,
    branches: branches.map(
      (b, i): FlowBranch => ({
        task: task({ id: `b${i}`, parentId: t.id, ...b }),
        startMs: T0,
        endMs: null,
        nodes: [],
        milestone: false,
        checkpoints: [],
        depth: 1,
        parentId: t.id,
      }),
    ),
  };
}

describe("daysUntil", () => {
  it("counts whole days, negative when past", () => {
    expect(daysUntil("2026-06-10", TODAY)).toBe(0);
    expect(daysUntil("2026-06-17", TODAY)).toBe(7);
    expect(daysUntil("2026-06-08", TODAY)).toBe(-2);
    expect(daysUntil("2027-06-10", TODAY)).toBe(365);
  });
});

describe("urgencyOf", () => {
  it("is 0 without a due date", () => {
    expect(urgencyOf(null, TODAY)).toBe(0);
  });
  it("is 1 when due today or overdue", () => {
    expect(urgencyOf("2026-06-10", TODAY)).toBe(1);
    expect(urgencyOf("2026-05-01", TODAY)).toBe(1);
  });
  it("falls linearly to 0 at the horizon", () => {
    expect(ATTENTION_HORIZON_DAYS).toBe(14);
    expect(urgencyOf("2026-06-17", TODAY)).toBeCloseTo(0.5);
    expect(urgencyOf("2026-06-24", TODAY)).toBe(0);
    expect(urgencyOf("2026-06-30", TODAY)).toBe(0); // 20 days out
  });
});

describe("importanceOf", () => {
  it("maps 0..3 to 0..1 and clamps", () => {
    expect(importanceOf(null)).toBe(0);
    expect(importanceOf(3)).toBe(1);
    expect(importanceOf(1)).toBeCloseTo(1 / 3);
    expect(importanceOf(9)).toBe(1);
    expect(importanceOf(-1)).toBe(0);
  });
});

describe("attentionScore", () => {
  const t = { dueDate: "2026-06-17", priority: 3, completedAt: null };
  it("scores each mode", () => {
    expect(attentionScore(t, TODAY, "deadline")).toBeCloseTo(0.5);
    expect(attentionScore(t, TODAY, "priority")).toBe(1);
    expect(attentionScore(t, TODAY, "combined")).toBeCloseTo(0.75);
  });
  it("scores a completed task 0 in every mode", () => {
    for (const mode of ["deadline", "priority", "combined"] as const) {
      expect(attentionScore({ ...t, completedAt: T0 }, TODAY, mode)).toBe(0);
    }
  });
});

describe("levels", () => {
  it("applies thresholds", () => {
    expect(attentionLevel(0)).toBe("none");
    expect(attentionLevel(0.01)).toBe("low");
    expect(attentionLevel(0.5)).toBe("medium");
    expect(attentionLevel(0.75)).toBe("high");
    expect(needsAttention(0.49)).toBe(false);
    expect(needsAttention(0.5)).toBe(true);
  });
});

describe("attentionInfo", () => {
  it("reports overdue and days to due", () => {
    const info = attentionInfo({ dueDate: "2026-06-08", priority: null, completedAt: null }, TODAY, "deadline");
    expect(info).toEqual({ score: 1, level: "high", overdue: true, daysToDue: -2 });
  });
  it("due today is not overdue; done and undated have no daysToDue", () => {
    expect(attentionInfo({ dueDate: TODAY, priority: null, completedAt: null }, TODAY, "deadline").overdue).toBe(false);
    expect(attentionInfo({ dueDate: TODAY, priority: null, completedAt: T0 }, TODAY, "deadline").daysToDue).toBeNull();
    expect(attentionInfo({ dueDate: null, priority: 3, completedAt: null }, TODAY, "priority").daysToDue).toBeNull();
  });
});

describe("laneAttention", () => {
  it("an urgent open subtask raises its parent", () => {
    const l = lane({ id: "p", dueDate: null, priority: null }, [{ dueDate: "2026-06-09" }]);
    const info = laneAttention(l, TODAY, "deadline");
    expect(info.score).toBe(1);
    expect(info.overdue).toBe(true);
    expect(info.daysToDue).toBe(-1);
  });
  it("ignores completed subtasks", () => {
    const l = lane({ id: "p" }, [{ dueDate: "2026-06-09", completedAt: T0 }]);
    expect(laneAttention(l, TODAY, "deadline").score).toBe(0);
  });
  it("takes deadline facts from the soonest-due open task, not the strongest", () => {
    const l = lane({ id: "p", dueDate: "2026-06-12", priority: 3 }, [{ dueDate: "2026-06-11", priority: null }]);
    const info = laneAttention(l, TODAY, "priority");
    expect(info.score).toBe(1);
    expect(info.daysToDue).toBe(1);
  });
  it("a done lane scores none", () => {
    const l = lane({ id: "p", dueDate: "2026-06-09", completedAt: T0 });
    expect(laneAttention(l, TODAY, "combined")).toEqual({ score: 0, level: "none", overdue: false, daysToDue: null });
  });
});
