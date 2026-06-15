import { describe, it, expect } from "vitest";
import {
  taskInputSchema,
  taskPatchSchema,
  collectionInputSchema,
  collectionPatchSchema,
  boardInputSchema,
  boardPatchSchema,
  boardFormSchema,
  parseInput,
} from "@/lib/tasks/schemas";

const WS = "11111111-1111-4111-8111-111111111111";
const ME = "22222222-2222-4222-8222-222222222222";
const BOARD = "33333333-3333-4333-8333-333333333333";
const COLLECTION = "44444444-4444-4444-8444-444444444444";

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
      collectionId: null,
      categoryId: null,
      description: "fragile stuff first",
      isPrivate: true,
      color: "peach",
      boardId: BOARD,
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

  it("accepts a board id (the column) and a null board", () => {
    expect(taskInputSchema.safeParse({ ...base, boardId: BOARD }).success).toBe(true);
    expect(taskInputSchema.safeParse({ ...base, boardId: null }).success).toBe(true);
    expect(taskInputSchema.safeParse({ ...base, boardId: "nope" }).success).toBe(false);
  });
});

describe("taskPatchSchema", () => {
  it("accepts a partial patch", () => {
    expect(taskPatchSchema.safeParse({ boardId: BOARD }).success).toBe(true);
    expect(taskPatchSchema.safeParse({ position: 3.25 }).success).toBe(true);
    // completedAt is normalized server-side from the board, so it stands alone.
    expect(taskPatchSchema.safeParse({ completedAt: Date.now() }).success).toBe(true);
  });

  it("strips workspace/owner moves", () => {
    const r = taskPatchSchema.parse({ workspaceId: WS, title: "x" } as Record<string, unknown>);
    expect("workspaceId" in r).toBe(false);
  });

  it("rejects an empty title in a patch", () => {
    expect(taskPatchSchema.safeParse({ title: "" }).success).toBe(false);
  });
});

describe("board schemas", () => {
  it("accepts a board input with name + line style + done flag", () => {
    expect(
      boardInputSchema.safeParse({
        workspaceId: WS,
        collectionId: COLLECTION,
        name: "In Progress",
        lineStyle: "dashed",
        position: 1,
        isDone: false,
      }).success,
    ).toBe(true);
  });

  it("rejects an unnamed board and an unknown line style", () => {
    expect(
      boardInputSchema.safeParse({ workspaceId: WS, collectionId: COLLECTION, name: " " }).success,
    ).toBe(false);
    expect(
      boardInputSchema.safeParse({
        workspaceId: WS,
        collectionId: COLLECTION,
        name: "X",
        lineStyle: "zigzag",
      }).success,
    ).toBe(false);
  });

  it("accepts a partial board patch and the board form shape", () => {
    expect(boardPatchSchema.safeParse({ isDone: true }).success).toBe(true);
    expect(boardPatchSchema.safeParse({}).success).toBe(true);
    expect(
      boardFormSchema.safeParse({ name: "Done", lineStyle: "solid", isDone: true }).success,
    ).toBe(true);
  });
});

describe("collection schemas", () => {
  it("accepts shared (null owner) and personal collections", () => {
    expect(
      collectionInputSchema.safeParse({ workspaceId: WS, ownerId: null, name: "Trip", color: "sky" }).success,
    ).toBe(true);
    expect(
      collectionInputSchema.safeParse({ workspaceId: WS, ownerId: ME, name: "Mine", color: "sky" }).success,
    ).toBe(true);
  });

  it("rejects an unnamed collection", () => {
    expect(
      collectionInputSchema.safeParse({ workspaceId: WS, ownerId: null, name: " ", color: "sky" }).success,
    ).toBe(false);
  });

  it("accepts a partial collection patch", () => {
    expect(collectionPatchSchema.safeParse({ name: "Renamed" }).success).toBe(true);
    expect(collectionPatchSchema.safeParse({}).success).toBe(true);
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
