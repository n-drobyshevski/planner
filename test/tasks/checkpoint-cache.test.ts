import { describe, it, expect } from "vitest";
import { upsertCheckpoint, removeCheckpoint } from "@/lib/tasks/checkpoint-cache";
import type { TaskCheckpoint } from "@/lib/types";

function cp(over: Partial<TaskCheckpoint>): TaskCheckpoint {
  return {
    id: "c",
    taskId: "t",
    workspaceId: "w",
    title: "",
    atDate: "2026-06-10",
    reached: false,
    reachedAt: null,
    color: null,
    shape: "flag",
    position: 0,
    createdBy: "me",
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

describe("upsertCheckpoint", () => {
  it("appends a new row", () => {
    const list = [cp({ id: "a" })];
    const next = upsertCheckpoint(list, cp({ id: "b" }));
    expect(next.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("replaces an existing row in place", () => {
    const list = [cp({ id: "a", title: "old", updatedAt: 1 })];
    const next = upsertCheckpoint(list, cp({ id: "a", title: "new", updatedAt: 2 }));
    expect(next).toHaveLength(1);
    expect(next[0].title).toBe("new");
  });

  it("skips a strictly older updatedAt echo (no clobber)", () => {
    const list = [cp({ id: "a", title: "fresh", updatedAt: 5 })];
    const next = upsertCheckpoint(list, cp({ id: "a", title: "stale", updatedAt: 3 }));
    expect(next[0].title).toBe("fresh");
    expect(next).toBe(list); // unchanged reference
  });
});

describe("removeCheckpoint", () => {
  it("drops the matching id and is a no-op otherwise", () => {
    const list = [cp({ id: "a" }), cp({ id: "b" })];
    expect(removeCheckpoint(list, "a").map((c) => c.id)).toEqual(["b"]);
    expect(removeCheckpoint(list, "z")).toBe(list);
  });
});
