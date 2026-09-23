import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createEvent, createTask } from "@/lib/supabase/mutations";
import type { EventInput, TaskInput } from "@/lib/supabase/mappers";

const eventInput: EventInput = {
  workspaceId: "w1",
  ownerId: "m1",
  title: "Anchor-made",
  start: Date.parse("2026-07-01T12:00:00.000Z"),
  end: Date.parse("2026-07-01T13:00:00.000Z"),
  timeZone: "UTC",
  isPrivate: true,
  clientRequestId: "anchor:abc123",
};

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";

const taskInput: TaskInput = {
  workspaceId: WORKSPACE_ID,
  ownerId: OWNER_ID,
  title: "Anchor-made task",
  clientRequestId: "anchor:def456",
};

const existingEventRow = {
  id: "e-existing",
  workspace_id: "w1",
  owner_id: "m1",
  category_id: null,
  title: "Anchor-made",
  description: null,
  location: null,
  is_private: true,
  is_shared: false,
  hidden_from_public: false,
  color: null,
  kind: "event",
  all_day: false,
  inactive: false,
  status: "confirmed",
  starts_at: "2026-07-01T12:00:00.000Z",
  ends_at: "2026-07-01T13:00:00.000Z",
  time_zone: "UTC",
  rrule: null,
  recurrence_ends_at: null,
  task_id: null,
  attributes: {},
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
  client_request_id: "anchor:abc123",
};

const existingTaskRow = {
  id: "t-existing",
  workspace_id: WORKSPACE_ID,
  owner_id: OWNER_ID,
  assignee_id: null,
  parent_id: null,
  collection_id: null,
  category_id: null,
  title: "Anchor-made task",
  description: null,
  is_private: true,
  color: null,
  board_id: null,
  priority: null,
  due_date: null,
  start_date: null,
  is_milestone: false,
  position: 0,
  sequential: false,
  completed_at: null,
  attributes: {},
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
  client_request_id: "anchor:def456",
};

/**
 * A minimal Supabase stand-in: `insert().select().single()` fails with a
 * Postgres unique_violation (23505), and a subsequent
 * `.select().eq(owner_id).eq(client_request_id).single()` re-read returns the
 * row a prior, otherwise-identical call already created. Exercises the
 * catch-23505-and-refetch idempotent-create path in lib/supabase/mutations.ts.
 */
function fakeClientWithConflict(existingRow: Record<string, unknown>) {
  const eqCalls: Array<[string, string]> = [];
  let mode: "insert" | "select" = "insert";
  const q = {
    insert: () => {
      mode = "insert";
      return q;
    },
    eq: (col: string, val: string) => {
      eqCalls.push([col, val]);
      return q;
    },
    select: () => q,
    single: async () => {
      if (mode === "insert") {
        return {
          data: null,
          error: { code: "23505", message: "duplicate key value violates unique constraint" },
        };
      }
      return { data: existingRow, error: null };
    },
  };
  const sb = {
    from: () => {
      mode = "select"; // a fresh `.from()` call starts the re-read chain
      return q;
    },
  } as unknown as SupabaseClient;
  return { sb, eqCalls };
}

describe("createEvent idempotency (clientRequestId)", () => {
  it("returns the existing row on a unique-violation instead of throwing", async () => {
    const { sb, eqCalls } = fakeClientWithConflict(existingEventRow);
    const row = await createEvent(sb, eventInput);
    expect(row.id).toBe("e-existing");
    expect(eqCalls).toEqual([
      ["owner_id", "m1"],
      ["client_request_id", "anchor:abc123"],
    ]);
  });

  it("rethrows a unique-violation with no clientRequestId set", async () => {
    const { sb } = fakeClientWithConflict(existingEventRow);
    await expect(createEvent(sb, { ...eventInput, clientRequestId: undefined })).rejects.toMatchObject(
      { code: "23505" },
    );
  });
});

describe("createTask idempotency (clientRequestId)", () => {
  it("returns the existing row on a unique-violation instead of throwing", async () => {
    const { sb, eqCalls } = fakeClientWithConflict(existingTaskRow);
    const row = await createTask(sb, taskInput);
    expect(row.id).toBe("t-existing");
    expect(eqCalls).toEqual([
      ["owner_id", OWNER_ID],
      ["client_request_id", "anchor:def456"],
    ]);
  });
});
