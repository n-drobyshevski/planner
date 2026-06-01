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

describe("mapEvent — kind/contextId", () => {
  it("reads kind and context_id from the row", () => {
    const ctx = mapEvent({ ...baseRow, kind: "context" });
    expect(ctx.kind).toBe("context");
    expect(ctx.contextId).toBeNull();

    const child = mapEvent({ ...baseRow, context_id: "ctx-1" });
    expect(child.kind).toBe("event"); // default when column absent
    expect(child.contextId).toBe("ctx-1");
  });

  it("defaults kind to event when the column is missing", () => {
    expect(mapEvent(baseRow).kind).toBe("event");
  });
});

describe("eventInputToRow — kind/contextId", () => {
  const input: EventInput = {
    workspaceId: "w1",
    ownerId: "m1",
    title: "Work",
    isPrivate: false,
    start: 0,
    end: 1,
    timeZone: "UTC",
  };

  it("defaults to a normal event with no context", () => {
    const row = eventInputToRow(input);
    expect(row.kind).toBe("event");
    expect(row.context_id).toBeNull();
  });

  it("passes through kind and contextId", () => {
    const row = eventInputToRow({ ...input, kind: "context" });
    expect(row.kind).toBe("context");

    const child = eventInputToRow({ ...input, contextId: "ctx-1" });
    expect(child.context_id).toBe("ctx-1");
  });
});

describe("eventPatchToRow — kind/contextId", () => {
  it("only writes fields present in the patch", () => {
    expect(eventPatchToRow({ title: "x" })).not.toHaveProperty("context_id");
    expect(eventPatchToRow({ contextId: "ctx-1" })).toEqual({ context_id: "ctx-1" });
    expect(eventPatchToRow({ contextId: null })).toEqual({ context_id: null });
    expect(eventPatchToRow({ kind: "context" })).toEqual({ kind: "context" });
  });
});
