import { describe, it, expect } from "vitest";
import {
  mapTaskStream,
  taskStreamInputToRow,
  taskStreamPatchToRow,
  type TaskStreamInput,
} from "@/lib/supabase/mappers";
import { DEFAULT_FLOWS_DISPLAY, type FlowsDisplay } from "@/lib/tasks/flows-display";
import { parseInput, taskStreamNameSchema } from "@/lib/tasks/schemas";

// Built from the defaults so the test follows FlowsDisplay as it grows; only
// fields that exist from the first version are changed.
const definition: FlowsDisplay = {
  ...DEFAULT_FLOWS_DISPLAY,
  filter: {
    ...DEFAULT_FLOWS_DISPLAY.filter,
    boardIds: ["b1", "b2"],
    priorities: [2, 3],
    done: "open",
  },
  groupBy: "priority",
  sortBy: "due",
  sortDir: "desc",
};

const baseRow = {
  id: "s1",
  workspace_id: "w1",
  member_id: "m1",
  name: "Errands",
  definition,
  position: 2,
  created_at: "2026-11-01T10:00:00.000Z",
  updated_at: "2026-11-02T10:00:00.000Z",
};

describe("task stream mappers", () => {
  it("maps a row to the domain shape", () => {
    expect(mapTaskStream(baseRow)).toEqual({
      id: "s1",
      workspaceId: "w1",
      memberId: "m1",
      name: "Errands",
      definition,
      position: 2,
      createdAt: Date.parse("2026-11-01T10:00:00.000Z"),
      updatedAt: Date.parse("2026-11-02T10:00:00.000Z"),
    });
  });

  it("round-trips input -> row -> domain", () => {
    const input: TaskStreamInput = {
      workspaceId: "w1",
      memberId: "m1",
      name: "Errands",
      definition,
      position: 2,
    };
    const row = taskStreamInputToRow(input);
    expect(row).toEqual({
      workspace_id: "w1",
      member_id: "m1",
      name: "Errands",
      definition,
      position: 2,
    });
    // jsonb comes back from PostgREST as parsed JSON.
    const stored = {
      ...row,
      definition: JSON.parse(JSON.stringify(row.definition)),
      id: "s1",
      created_at: baseRow.created_at,
      updated_at: baseRow.updated_at,
    };
    const back = mapTaskStream(stored);
    expect(back.definition).toEqual(definition);
    expect(back).toMatchObject({ workspaceId: "w1", memberId: "m1", name: "Errands", position: 2 });
  });

  it("defaults position to 0 on insert", () => {
    const row = taskStreamInputToRow({ workspaceId: "w1", memberId: "m1", name: "x", definition });
    expect(row.position).toBe(0);
  });

  it("builds a patch row with only the provided fields", () => {
    expect(taskStreamPatchToRow({})).toEqual({});
    expect(taskStreamPatchToRow({ name: "Home" })).toEqual({ name: "Home" });
    expect(taskStreamPatchToRow({ definition })).toEqual({ definition });
  });

  it.each([
    ["null", null],
    ["a string", "groupBy=priority"],
    ["an array", [1, 2]],
    ["a number", 42],
  ])("falls back to the default display when definition is %s", (_label, raw) => {
    const s = mapTaskStream({ ...baseRow, definition: raw });
    expect(s.definition).toEqual(DEFAULT_FLOWS_DISPLAY);
  });

  it("keeps valid fields and resets malformed ones without throwing", () => {
    const raw = {
      groupBy: "priority",
      sortBy: "not-a-sort",
      sortDir: 7,
      filter: { boardIds: "b1", priorities: [1], done: "maybe" },
      unknownFutureField: { nested: true },
    };
    let s: ReturnType<typeof mapTaskStream> | undefined;
    expect(() => {
      s = mapTaskStream({ ...baseRow, definition: raw });
    }).not.toThrow();
    expect(s!.definition.groupBy).toBe("priority");
    expect(s!.definition.sortBy).toBe(DEFAULT_FLOWS_DISPLAY.sortBy);
    expect(s!.definition.sortDir).toBe(DEFAULT_FLOWS_DISPLAY.sortDir);
    expect(s!.definition.filter.boardIds).toBe(DEFAULT_FLOWS_DISPLAY.filter.boardIds);
    expect(s!.definition.filter.priorities).toEqual([1]);
    expect(s!.definition.filter.done).toBe(DEFAULT_FLOWS_DISPLAY.filter.done);
  });
});

describe("taskStreamNameSchema", () => {
  it("trims the name", () => {
    expect(parseInput(taskStreamNameSchema, "  Errands  ")).toBe("Errands");
  });

  it("accepts 1 and 60 characters", () => {
    expect(parseInput(taskStreamNameSchema, "a")).toBe("a");
    expect(parseInput(taskStreamNameSchema, "x".repeat(60))).toHaveLength(60);
  });

  it("rejects empty, whitespace-only and over-long names with a readable message", () => {
    expect(() => parseInput(taskStreamNameSchema, "")).toThrow("Please name the stream.");
    expect(() => parseInput(taskStreamNameSchema, "   ")).toThrow("Please name the stream.");
    expect(() => parseInput(taskStreamNameSchema, "x".repeat(61))).toThrow(/under 60/);
  });

  it("measures length after trimming", () => {
    expect(parseInput(taskStreamNameSchema, `  ${"x".repeat(60)}  `)).toHaveLength(60);
  });

  it("rejects non-strings", () => {
    expect(() => parseInput(taskStreamNameSchema, 12)).toThrow(Error);
  });
});
