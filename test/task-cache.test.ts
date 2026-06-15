import { describe, it, expect } from "vitest";
import { upsertTask, removeTask, removeTasks, applyTaskChange } from "@/lib/tasks/cache";
import type { WorkspaceChange } from "@/lib/supabase/realtime";
import type { TaskRow } from "@/lib/types";

function mk(id: string, over: Partial<TaskRow> = {}): TaskRow {
  return {
    id,
    workspaceId: "ws",
    ownerId: "m1",
    assigneeId: null,
    parentId: null,
    collectionId: null,
    categoryId: null,
    title: id,
    description: null,
    isPrivate: false,
    color: null,
    status: "todo",
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
    ...over,
  };
}

describe("upsertTask", () => {
  it("appends an unknown row", () => {
    const list = [mk("a")];
    const next = upsertTask(list, mk("b"));
    expect(next.map((t) => t.id)).toEqual(["a", "b"]);
    expect(list).toHaveLength(1); // input untouched
  });

  it("replaces a known row", () => {
    const next = upsertTask([mk("a"), mk("b")], mk("a", { title: "renamed", updatedAt: 5 }));
    expect(next.find((t) => t.id === "a")?.title).toBe("renamed");
    expect(next).toHaveLength(2);
  });

  it("skips a stale echo (older updatedAt than the cached row)", () => {
    const cached = mk("a", { title: "newer", updatedAt: 10 });
    const next = upsertTask([cached], mk("a", { title: "stale", updatedAt: 5 }));
    expect(next[0].title).toBe("newer");
    expect(next[0]).toBe(cached); // same reference, no churn
  });

  it("applies an equal-timestamp row (server echo of the same write)", () => {
    const next = upsertTask([mk("a", { updatedAt: 10 })], mk("a", { title: "echo", updatedAt: 10 }));
    expect(next[0].title).toBe("echo");
  });
});

describe("removeTask / removeTasks", () => {
  it("drops the row and its subtasks", () => {
    const list = [mk("p"), mk("c1", { parentId: "p" }), mk("c2", { parentId: "p" }), mk("x")];
    expect(removeTask(list, "p").map((t) => t.id)).toEqual(["x"]);
  });

  it("drops transitive descendants", () => {
    const list = [mk("p"), mk("c", { parentId: "p" }), mk("g", { parentId: "c" }), mk("x")];
    expect(removeTask(list, "p").map((t) => t.id)).toEqual(["x"]);
  });

  it("returns the same reference when nothing matches", () => {
    const list = [mk("a")];
    expect(removeTask(list, "nope")).toBe(list);
  });

  it("removes several roots at once", () => {
    const list = [mk("a"), mk("b"), mk("c", { parentId: "b" }), mk("d")];
    expect(removeTasks(list, ["a", "b"]).map((t) => t.id)).toEqual(["d"]);
  });
});

describe("applyTaskChange", () => {
  const row = {
    id: "a",
    workspace_id: "ws",
    owner_id: "m1",
    assignee_id: null,
    parent_id: null,
    collection_id: null,
    category_id: null,
    title: "from realtime",
    description: null,
    is_private: false,
    color: null,
    status: "todo",
    priority: null,
    due_date: null,
    position: 1,
    sequential: false,
    completed_at: null,
    created_at: "1970-01-01T00:00:00Z",
    updated_at: "1970-01-01T00:00:01Z",
  };

  it("applies an INSERT payload's full row", () => {
    const change = { eventType: "INSERT", table: "tasks", new: row, old: {} } as unknown as WorkspaceChange;
    const next = applyTaskChange([], change);
    expect(next).toHaveLength(1);
    expect(next[0].title).toBe("from realtime");
    expect(next[0].updatedAt).toBe(1000);
  });

  it("applies an UPDATE payload's full row", () => {
    const change = {
      eventType: "UPDATE",
      table: "tasks",
      new: { ...row, title: "edited" },
      old: { id: "a" },
    } as unknown as WorkspaceChange;
    const next = applyTaskChange([mk("a")], change);
    expect(next[0].title).toBe("edited");
  });

  it("handles a PK-only DELETE payload", () => {
    const change = {
      eventType: "DELETE",
      table: "tasks",
      new: {},
      old: { id: "a" }, // default replica identity: PK only
    } as unknown as WorkspaceChange;
    const next = applyTaskChange([mk("a"), mk("s", { parentId: "a" }), mk("b")], change);
    expect(next.map((t) => t.id)).toEqual(["b"]);
  });

  it("ignores a DELETE without a PK", () => {
    const change = { eventType: "DELETE", table: "tasks", new: {}, old: {} } as unknown as WorkspaceChange;
    const list = [mk("a")];
    expect(applyTaskChange(list, change)).toBe(list);
  });
});
