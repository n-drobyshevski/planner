import { describe, it, expect } from "vitest";
import {
  sortByPosition,
  groupByParent,
  childrenOf,
  progressOf,
  indexById,
  depthOf,
  isDescendant,
  maxSubtreeDepth,
  subtreeIds,
  progressDeep,
  flattenTree,
} from "@/lib/tasks/tree";
import type { TaskRow } from "@/lib/types";

function mk(p: Partial<TaskRow> & { id: string }): TaskRow {
  return {
    workspaceId: "ws",
    ownerId: "m1",
    assigneeId: null,
    parentId: null,
    collectionId: null,
    categoryId: null,
    title: p.id,
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
        mk({ id: "a", completedAt: 100 }),
        mk({ id: "b", completedAt: null }),
        mk({ id: "c", completedAt: 100 }),
      ]),
    ).toEqual({ done: 2, total: 3 });
  });

  it("handles an empty list", () => {
    expect(progressOf([])).toEqual({ done: 0, total: 0 });
  });
});

// A 4-level chain p -> c -> g -> gg, plus a sibling c2 under p.
function deepTree(): TaskRow[] {
  return [
    mk({ id: "p" }),
    mk({ id: "c", parentId: "p", position: 1 }),
    mk({ id: "c2", parentId: "p", position: 2 }),
    mk({ id: "g", parentId: "c" }),
    mk({ id: "gg", parentId: "g" }),
  ];
}

describe("depthOf", () => {
  it("counts edges from the root", () => {
    const tasks = deepTree();
    const byId = indexById(tasks);
    expect(depthOf(byId.get("p")!, byId)).toBe(0);
    expect(depthOf(byId.get("c")!, byId)).toBe(1);
    expect(depthOf(byId.get("g")!, byId)).toBe(2);
    expect(depthOf(byId.get("gg")!, byId)).toBe(3);
  });

  it("is cycle-safe", () => {
    const a = mk({ id: "a", parentId: "b" });
    const b = mk({ id: "b", parentId: "a" });
    const byId = indexById([a, b]);
    expect(() => depthOf(a, byId)).not.toThrow();
  });
});

describe("isDescendant", () => {
  it("detects an ancestor above a node", () => {
    const byId = indexById(deepTree());
    expect(isDescendant("p", "gg", byId)).toBe(true);
    expect(isDescendant("c", "gg", byId)).toBe(true);
    expect(isDescendant("gg", "p", byId)).toBe(false);
    expect(isDescendant("c2", "gg", byId)).toBe(false);
  });
});

describe("maxSubtreeDepth", () => {
  it("measures the deepest path below a node", () => {
    const byParent = groupByParent(deepTree());
    expect(maxSubtreeDepth("p", byParent)).toBe(3);
    expect(maxSubtreeDepth("c", byParent)).toBe(2);
    expect(maxSubtreeDepth("g", byParent)).toBe(1);
    expect(maxSubtreeDepth("gg", byParent)).toBe(0);
    expect(maxSubtreeDepth("c2", byParent)).toBe(0);
  });
});

describe("subtreeIds", () => {
  it("returns the root plus all descendants", () => {
    const byParent = groupByParent(deepTree());
    expect([...subtreeIds("c", byParent)].sort()).toEqual(["c", "g", "gg"]);
    expect([...subtreeIds("gg", byParent)]).toEqual(["gg"]);
  });
});

describe("progressDeep", () => {
  it("counts completion across the whole subtree", () => {
    const tasks = [
      mk({ id: "p" }),
      mk({ id: "c", parentId: "p", completedAt: 1 }),
      mk({ id: "g", parentId: "c" }),
      mk({ id: "gg", parentId: "g", completedAt: 1 }),
    ];
    const byParent = groupByParent(tasks);
    expect(progressDeep("p", byParent)).toEqual({ done: 2, total: 3 });
  });
});

describe("flattenTree", () => {
  it("emits descendants pre-order with depth, skipping collapsed subtrees", () => {
    const byParent = groupByParent(deepTree());
    // c expanded, g collapsed → c, g, c2 visible (gg hidden under collapsed g).
    const out = flattenTree("p", byParent, new Set(["c"]));
    expect(out.map((n) => [n.task.id, n.depth, n.hasChildren])).toEqual([
      ["c", 0, true],
      ["g", 1, true],
      ["c2", 0, false],
    ]);
  });

  it("fully expanded yields the whole chain", () => {
    const byParent = groupByParent(deepTree());
    const out = flattenTree("p", byParent, new Set(["c", "g"]));
    expect(out.map((n) => n.task.id)).toEqual(["c", "g", "gg", "c2"]);
  });
});
