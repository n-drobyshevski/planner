import { describe, it, expect } from "vitest";
import { blockedIds, isBlocked, nextActionable } from "@/lib/tasks/blocking";
import type { TaskRow, TaskStatus } from "@/lib/types";

function mk(id: string, status: TaskStatus): TaskRow {
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
    status,
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
  };
}

describe("blockedIds", () => {
  it("blocks nothing when not sequential", () => {
    const ts = [mk("a", "todo"), mk("b", "todo"), mk("c", "todo")];
    expect(blockedIds(ts, false).size).toBe(0);
  });

  it("first not-done is actionable; later not-done are blocked", () => {
    const ts = [mk("a", "todo"), mk("b", "todo"), mk("c", "todo")];
    expect([...blockedIds(ts, true)]).toEqual(["b", "c"]);
  });

  it("skips leading done; first remaining is actionable", () => {
    const ts = [mk("a", "done"), mk("b", "todo"), mk("c", "todo")];
    expect([...blockedIds(ts, true)]).toEqual(["c"]);
  });

  it("an interspersed done does not unblock later tasks", () => {
    const ts = [mk("a", "todo"), mk("b", "done"), mk("c", "todo")];
    expect([...blockedIds(ts, true)]).toEqual(["c"]);
  });

  it("blocks nothing when all done", () => {
    const ts = [mk("a", "done"), mk("b", "done")];
    expect(blockedIds(ts, true).size).toBe(0);
  });

  it("handles an empty list", () => {
    expect(blockedIds([], true).size).toBe(0);
  });
});

describe("isBlocked", () => {
  const ts = [mk("a", "todo"), mk("b", "todo"), mk("c", "todo")];

  it("matches blockedIds for each task", () => {
    expect(isBlocked(ts[0], ts, true)).toBe(false); // actionable
    expect(isBlocked(ts[1], ts, true)).toBe(true);
    expect(isBlocked(ts[2], ts, true)).toBe(true);
  });

  it("is never blocked when not sequential", () => {
    expect(isBlocked(ts[2], ts, false)).toBe(false);
  });

  it("a done task is never blocked", () => {
    const list = [mk("a", "todo"), mk("b", "done")];
    expect(isBlocked(list[1], list, true)).toBe(false);
  });
});

describe("nextActionable", () => {
  it("returns the first not-done task", () => {
    const ts = [mk("a", "done"), mk("b", "todo"), mk("c", "todo")];
    expect(nextActionable(ts)?.id).toBe("b");
  });

  it("returns null when all done or empty", () => {
    expect(nextActionable([mk("a", "done")])).toBeNull();
    expect(nextActionable([])).toBeNull();
  });
});
