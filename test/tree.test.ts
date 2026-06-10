import { describe, it, expect } from "vitest";
import {
  sortByPosition,
  groupByParent,
  childrenOf,
  progressOf,
} from "@/lib/tasks/tree";
import type { TaskRow, TaskStatus } from "@/lib/types";

function mk(p: Partial<TaskRow> & { id: string }): TaskRow {
  return {
    workspaceId: "ws",
    ownerId: "m1",
    assigneeId: null,
    parentId: null,
    boardId: null,
    categoryId: null,
    title: p.id,
    description: null,
    isPrivate: false,
    color: null,
    status: "todo" as TaskStatus,
    priority: null,
    dueDate: null,
    position: 0,
    sequential: false,
    completedAt: null,
    attributes: {},
    createdAt: 0,
    updatedAt: 0,
    ...p,
  };
}

describe("sortByPosition", () => {
  it("sorts by position, then createdAt", () => {
    const out = sortByPosition([
      mk({ id: "c", position: 2 }),
      mk({ id: "a", position: 1, createdAt: 100 }),
      mk({ id: "b", position: 1, createdAt: 50 }),
    ]);
    expect(out.map((t) => t.id)).toEqual(["b", "a", "c"]);
  });

  it("does not mutate the input", () => {
    const input = [mk({ id: "b", position: 2 }), mk({ id: "a", position: 1 })];
    const copy = [...input];
    sortByPosition(input);
    expect(input).toEqual(copy);
  });
});

describe("groupByParent", () => {
  it("keys top-level tasks under null and children under their parent, each sorted", () => {
    const tasks = [
      mk({ id: "p1", position: 1 }),
      mk({ id: "p2", position: 2 }),
      mk({ id: "s2", parentId: "p1", position: 2 }),
      mk({ id: "s1", parentId: "p1", position: 1 }),
    ];
    const map = groupByParent(tasks);
    expect(map.get(null)!.map((t) => t.id)).toEqual(["p1", "p2"]);
    expect(map.get("p1")!.map((t) => t.id)).toEqual(["s1", "s2"]);
    expect(map.get("p2")).toBeUndefined();
  });
});

describe("childrenOf", () => {
  it("returns only the parent's children, sorted", () => {
    const tasks = [
      mk({ id: "p", position: 1 }),
      mk({ id: "b", parentId: "p", position: 2 }),
      mk({ id: "a", parentId: "p", position: 1 }),
      mk({ id: "x", parentId: "other", position: 1 }),
    ];
    expect(childrenOf(tasks, "p").map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("progressOf", () => {
  it("counts done out of total", () => {
    expect(
      progressOf([
        mk({ id: "a", status: "done" }),
        mk({ id: "b", status: "todo" }),
        mk({ id: "c", status: "done" }),
      ]),
    ).toEqual({ done: 2, total: 3 });
  });

  it("handles an empty list", () => {
    expect(progressOf([])).toEqual({ done: 0, total: 0 });
  });
});
