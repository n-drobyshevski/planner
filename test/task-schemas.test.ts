import { describe, it, expect } from "vitest";
import {
  taskInputSchema,
  taskPatchSchema,
  boardInputSchema,
  boardPatchSchema,
  parseInput,
} from "@/lib/tasks/schemas";

const WS = "11111111-1111-4111-8111-111111111111";
const ME = "22222222-2222-4222-8222-222222222222";

const base = {
  workspaceId: WS,
  ownerId: ME,
  title: "Pack the boxes",
};

describe("taskInputSchema", () => {
  it("accepts a minimal create payload", () => {
    expect(taskInputSchema.safeParse(base).success).toBe(true);
  });

  it("accepts a full payload", () => {
    const r = taskInputSchema.safeParse({
      ...base,
      assigneeId: ME,
      parentId: null,
      boardId: null,
      categoryId: null,
      description: "fragile stuff first",
      isPrivate: true,
      color: "peach",
      status: "done",
      priority: 2,
      dueDate: "2026-06-13",
      position: 1.5,
      sequential: false,
      completedAt: Date.now(),
    });
    expect(r.success).toBe(true);
  });

  it("trims the title", () => {
    const r = taskInputSchema.parse({ ...base, title: "  hello  " });
    expect(r.title).toBe("hello");
  });

  it("rejects an empty / whitespace title", () => {
    expect(taskInputSchema.safeParse({ ...base, title: "   " }).success).toBe(false);
  });

  it("rejects a non-uuid workspace id", () => {
    expect(taskInputSchema.safeParse({ ...base, workspaceId: "nope" }).success).toBe(false);
  });

  it("accepts omitted, valid, and unknown-key attributes; rejects invalid known values", () => {
    expect(taskInputSchema.safeParse(base).success).toBe(true);
    expect(
      taskInputSchema.safeParse({ ...base, attributes: { energy: 2, mood: "calm" } }).success,
    ).toBe(true);
    expect(taskInputSchema.safeParse({ ...base, attributes: { energy: 0 } }).success).toBe(false);
    expect(
      taskPatchSchema.safeParse({ attributes: { satisfaction: 5 } }).success,
    ).toBe(true);
    expect(
      taskPatchSchema.safeParse({ attributes: { flexibility: "rigid" } }).success,
    ).toBe(false);
  });

  it("rejects priority outside 0..3", () => {
    expect(taskInputSchema.safeParse({ ...base, priority: 4 }).success).toBe(false);
    expect(taskInputSchema.safeParse({ ...base, priority: -1 }).success).toBe(false);
    expect(taskInputSchema.safeParse({ ...base, priority: 0 }).success).toBe(true);
  });

  it("enforces the done <-> completedAt coupling", () => {
    expect(
      taskInputSchema.safeParse({ ...base, status: "done", completedAt: null }).success,
    ).toBe(false);
    expect(
      taskInputSchema.safeParse({ ...base, status: "todo", completedAt: Date.now() }).success,
    ).toBe(false);
    expect(
      taskInputSchema.safeParse({ ...base, status: "done", completedAt: Date.now() }).success,
    ).toBe(true);
  });

  it("treats a missing status as todo for the coupling", () => {
    expect(taskInputSchema.safeParse({ ...base, completedAt: Date.now() }).success).toBe(false);
  });
});

describe("taskPatchSchema", () => {
  it("accepts a partial patch", () => {
    expect(taskPatchSchema.safeParse({ status: "in_progress" }).success).toBe(true);
    expect(taskPatchSchema.safeParse({ position: 3.25 }).success).toBe(true);
  });

  it("strips workspace/owner moves", () => {
    const r = taskPatchSchema.parse({ workspaceId: WS, title: "x" } as Record<string, unknown>);
    expect("workspaceId" in r).toBe(false);
  });

  it("leaves the lone-field coupling to the DB trigger", () => {
    // Only one of status/completedAt present: the normalization trigger fixes it.
    expect(taskPatchSchema.safeParse({ status: "done" }).success).toBe(true);
    expect(taskPatchSchema.safeParse({ completedAt: Date.now() }).success).toBe(true);
  });

  it("rejects a contradictory status + completedAt pair", () => {
    expect(
      taskPatchSchema.safeParse({ status: "done", completedAt: null }).success,
    ).toBe(false);
    expect(
      taskPatchSchema.safeParse({ status: "todo", completedAt: Date.now() }).success,
    ).toBe(false);
  });

  it("rejects an empty title in a patch", () => {
    expect(taskPatchSchema.safeParse({ title: "" }).success).toBe(false);
  });
});

describe("board schemas", () => {
  it("accepts shared (null owner) and personal boards", () => {
    expect(
      boardInputSchema.safeParse({ workspaceId: WS, ownerId: null, name: "Trip", color: "sky" }).success,
    ).toBe(true);
    expect(
      boardInputSchema.safeParse({ workspaceId: WS, ownerId: ME, name: "Mine", color: "sky" }).success,
    ).toBe(true);
  });

  it("rejects an unnamed board", () => {
    expect(
      boardInputSchema.safeParse({ workspaceId: WS, ownerId: null, name: " ", color: "sky" }).success,
    ).toBe(false);
  });

  it("accepts a partial board patch", () => {
    expect(boardPatchSchema.safeParse({ name: "Renamed" }).success).toBe(true);
    expect(boardPatchSchema.safeParse({}).success).toBe(true);
  });
});

describe("parseInput", () => {
  it("returns parsed data on success", () => {
    expect(parseInput(taskPatchSchema, { title: " x " }).title).toBe("x");
  });

  it("throws a plain Error with the first issue message", () => {
    expect(() => parseInput(taskInputSchema, { ...base, title: "" })).toThrowError(
      "Please add a title.",
    );
  });
});
