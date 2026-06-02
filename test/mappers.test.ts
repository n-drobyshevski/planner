import { describe, it, expect } from "vitest";
import {
  mapEvent,
  eventInputToRow,
  eventPatchToRow,
  type EventInput,
} from "@/lib/supabase/mappers";

const baseRow = {
  id: "e1",
  workspace_id: "w1",
  owner_id: "m1",
  category_id: null,
  title: "Work",
  description: null,
  location: null,
  is_private: false,
  color: null,
  all_day: false,
  starts_at: "2026-06-01T09:00:00.000Z",
  ends_at: "2026-06-01T17:00:00.000Z",
  time_zone: "America/New_York",
  rrule: null,
  recurrence_ends_at: null,
  task_id: null,
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z",
};

describe("mapEvent — kind", () => {
  it("reads kind from the row", () => {
    const ctx = mapEvent({ ...baseRow, kind: "context" });
    expect(ctx.kind).toBe("context");

    // A context window paints a category via its own category_id.
    const painted = mapEvent({ ...baseRow, kind: "context", category_id: "cat-1" });
    expect(painted.categoryId).toBe("cat-1");
  });

  it("defaults kind to event when the column is missing", () => {
    expect(mapEvent(baseRow).kind).toBe("event");
  });
});

describe("eventInputToRow — kind/category", () => {
  const input: EventInput = {
    workspaceId: "w1",
    ownerId: "m1",
    title: "Work",
    isPrivate: false,
    start: 0,
    end: 1,
    timeZone: "UTC",
  };

  it("defaults to a normal event", () => {
    const row = eventInputToRow(input);
    expect(row.kind).toBe("event");
    expect(row).not.toHaveProperty("context_id");
  });

  it("passes through kind and the painted category", () => {
    const row = eventInputToRow({ ...input, kind: "context", categoryId: "cat-1" });
    expect(row.kind).toBe("context");
    expect(row.category_id).toBe("cat-1");
  });
});

describe("eventPatchToRow — kind/category", () => {
  it("only writes fields present in the patch (and never context_id)", () => {
    expect(eventPatchToRow({ title: "x" })).not.toHaveProperty("context_id");
    expect(eventPatchToRow({ categoryId: "cat-1" })).toEqual({ category_id: "cat-1" });
    expect(eventPatchToRow({ categoryId: null })).toEqual({ category_id: null });
    expect(eventPatchToRow({ kind: "context" })).toEqual({ kind: "context" });
  });
});
