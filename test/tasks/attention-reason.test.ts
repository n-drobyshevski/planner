import { describe, it, expect } from "vitest";
import { attentionReason } from "@/lib/tasks/attention-reason";
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

describe("attentionReason", () => {
  it("is null below the attention bar", () => {
    expect(attentionReason(lane({}), TODAY, "combined")).toBeNull();
    expect(attentionReason(lane({ dueDate: "2026-06-20" }), TODAY, "deadline")).toBeNull();
  });

  it("explains a near deadline in deadline mode", () => {
    expect(attentionReason(lane({ dueDate: "2026-06-11" }), TODAY, "deadline")).toEqual({
      level: "high",
      days: 1,
      priority: null,
    });
  });

  it("keeps overdue days negative", () => {
    expect(attentionReason(lane({ dueDate: "2026-06-08" }), TODAY, "deadline")?.days).toBe(-2);
  });

  it("ignores the deadline in priority mode and the priority in deadline mode", () => {
    const l = lane({ dueDate: "2026-06-10", priority: 3 });
    expect(attentionReason(l, TODAY, "priority")).toEqual({
      level: "high",
      days: null,
      priority: 3,
    });
    expect(attentionReason(l, TODAY, "deadline")).toEqual({
      level: "high",
      days: 0,
      priority: null,
    });
  });

  it("gives both reasons in combined mode", () => {
    // urgency 1 - 4/14 ≈ 0.71, importance 2/3 ≈ 0.67 -> ≈ 0.69, medium
    expect(attentionReason(lane({ dueDate: "2026-06-14", priority: 2 }), TODAY, "combined")).toEqual(
      { level: "medium", days: 4, priority: 2 },
    );
  });

  it("lets an open subtask raise its parent, and skips finished ones", () => {
    const l = lane({}, [{ priority: 3 }, { priority: 3, completedAt: T0, dueDate: "2026-06-09" }]);
    expect(attentionReason(l, TODAY, "priority")).toEqual({
      level: "high",
      days: null,
      priority: 3,
    });
  });
});
