import { describe, it, expect } from "vitest";
import { canNest, dropModeFromPointer } from "@/lib/tasks/nesting";
import { indexById, groupByParent } from "@/lib/tasks/tree";
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

const maps = (tasks: TaskRow[]) =>
  [indexById(tasks), groupByParent(tasks)] as const;

describe("canNest", () => {
  it("allows nesting a leaf under a deeper parent (N-level)", () => {
    // p -> c -> g (g at depth 2); a leaf x can nest under g (→ depth 3, OK).
    const tasks = [
      mk({ id: "p" }),
      mk({ id: "c", parentId: "p" }),
      mk({ id: "g", parentId: "c" }),
      mk({ id: "x" }),
    ];
    const [byId, byParent] = maps(tasks);
    expect(canNest(byId.get("x")!, byId.get("g")!, byId, byParent)).toBe(true);
  });

  it("rejects when the result would exceed MAX_DEPTH", () => {
    // p -> c -> g -> gg already 4 levels; x cannot nest under gg (→ depth 4).
    const tasks = [
      mk({ id: "p" }),
      mk({ id: "c", parentId: "p" }),
      mk({ id: "g", parentId: "c" }),
      mk({ id: "gg", parentId: "g" }),
      mk({ id: "x" }),
    ];
    const [byId, byParent] = maps(tasks);
    expect(canNest(byId.get("x")!, byId.get("gg")!, byId, byParent)).toBe(false);
  });

  it("accounts for the dragged task's own subtree depth", () => {
    // x has a child xc (subtree depth 1). Nesting x under c (depth 1) makes x
    // depth 2 and xc depth 3 — OK. Under g (depth 2) it would push xc to 4 — no.
    const tasks = [
      mk({ id: "p" }),
      mk({ id: "c", parentId: "p" }),
      mk({ id: "g", parentId: "c" }),
      mk({ id: "x" }),
      mk({ id: "xc", parentId: "x" }),
    ];
    const [byId, byParent] = maps(tasks);
    expect(canNest(byId.get("x")!, byId.get("c")!, byId, byParent)).toBe(true);
    expect(canNest(byId.get("x")!, byId.get("g")!, byId, byParent)).toBe(false);
  });

  it("rejects nesting under its own descendant (cycle)", () => {
    const tasks = [
      mk({ id: "p" }),
      mk({ id: "c", parentId: "p" }),
      mk({ id: "g", parentId: "c" }),
    ];
    const [byId, byParent] = maps(tasks);
    expect(canNest(byId.get("p")!, byId.get("g")!, byId, byParent)).toBe(false);
  });

  it("rejects self and current-parent (no-ops)", () => {
    const tasks = [mk({ id: "p" }), mk({ id: "c", parentId: "p" })];
    const [byId, byParent] = maps(tasks);
    expect(canNest(byId.get("p")!, byId.get("p")!, byId, byParent)).toBe(false);
    expect(canNest(byId.get("c")!, byId.get("p")!, byId, byParent)).toBe(false);
  });
});

describe("dropModeFromPointer", () => {
  const rect = { top: 0, height: 100 };
  it("nests in the centre band when nestable", () => {
    expect(dropModeFromPointer(50, rect, true)).toBe("nest");
  });
  it("reorders at the edges", () => {
    expect(dropModeFromPointer(10, rect, true)).toBe("before");
    expect(dropModeFromPointer(90, rect, true)).toBe("after");
  });
  it("never nests when not nestable", () => {
    expect(dropModeFromPointer(50, rect, false)).toBe("after");
  });
});
