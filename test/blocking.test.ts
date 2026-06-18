import { describe, it, expect } from "vitest";
import {
  blockedIds,
  isBlocked,
  nextActionable,
  dependencyBlockedIds,
  isTaskBlocked,
} from "@/lib/tasks/blocking";
import type { TaskRow } from "@/lib/types";

// `done` drives completedAt — the board-agnostic "done" signal the blocking
// logic now reads.
function mk(id: string, done = false): TaskRow {
  return {
    id,
    workspaceId: "ws",
    ownerId: "m1",
    assigneeId: null,
    parentId: "p",
    collectionId: null,
    categoryId: null,
    title: id,
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
    completedAt: done ? 100 : null,
    attributes: {},
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("blockedIds", () => {
  it("blocks nothing when not sequential", () => {
    const ts = [mk("a"), mk("b"), mk("c")];
    expect(blockedIds(ts, false).size).toBe(0);
  });

  it("first not-done is actionable; later not-done are blocked", () => {
    const ts = [mk("a"), mk("b"), mk("c")];
    expect([...blockedIds(ts, true)]).toEqual(["b", "c"]);
  });

  it("skips leading done; first remaining is actionable", () => {
    const ts = [mk("a", true), mk("b"), mk("c")];
    expect([...blockedIds(ts, true)]).toEqual(["c"]);
  });

  it("an interspersed done does not unblock later tasks", () => {
    const ts = [mk("a"), mk("b", true), mk("c")];
    expect([...blockedIds(ts, true)]).toEqual(["c"]);
  });

  it("blocks nothing when all done", () => {
    const ts = [mk("a", true), mk("b", true)];
    expect(blockedIds(ts, true).size).toBe(0);
  });

  it("handles an empty list", () => {
    expect(blockedIds([], true).size).toBe(0);
  });
});

describe("isBlocked", () => {
  const ts = [mk("a"), mk("b"), mk("c")];

  it("matches blockedIds for each task", () => {
    expect(isBlocked(ts[0], ts, true)).toBe(false); // actionable
    expect(isBlocked(ts[1], ts, true)).toBe(true);
    expect(isBlocked(ts[2], ts, true)).toBe(true);
  });

  it("is never blocked when not sequential", () => {
    expect(isBlocked(ts[2], ts, false)).toBe(false);
  });

  it("a done task is never blocked", () => {
    const list = [mk("a"), mk("b", true)];
    expect(isBlocked(list[1], list, true)).toBe(false);
  });
});

describe("nextActionable", () => {
  it("returns the first not-done task", () => {
    const ts = [mk("a", true), mk("b"), mk("c")];
    expect(nextActionable(ts)?.id).toBe("b");
  });

  it("returns null when all done or empty", () => {
    expect(nextActionable([mk("a", true)])).toBeNull();
    expect(nextActionable([])).toBeNull();
  });
});

describe("dependencyBlockedIds", () => {
  const deps = [
    { taskId: "a", dependsOnTaskId: "x" },
    { taskId: "a", dependsOnTaskId: "y" },
    { taskId: "b", dependsOnTaskId: "z" },
  ];
  it("blocks a task while any blocker is incomplete", () => {
    const complete = new Set(["y", "z"]); // x still open
    const blocked = dependencyBlockedIds(deps, (id) => complete.has(id));
    expect(blocked.has("a")).toBe(true); // x incomplete
    expect(blocked.has("b")).toBe(false); // z complete
  });
  it("clears once every blocker is complete", () => {
    const complete = new Set(["x", "y", "z"]);
    const blocked = dependencyBlockedIds(deps, (id) => complete.has(id));
    expect(blocked.size).toBe(0);
  });
});

describe("isTaskBlocked", () => {
  it("is true when blocked by sequence OR dependency", () => {
    expect(isTaskBlocked("a", new Set(["a"]), new Set())).toBe(true);
    expect(isTaskBlocked("a", new Set(), new Set(["a"]))).toBe(true);
    expect(isTaskBlocked("a", new Set(), new Set())).toBe(false);
  });
});
