import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateEvent, updateTask, StaleWriteError } from "@/lib/supabase/mutations";

// A microsecond-precision stored timestamp, like Postgres keeps. The app layer
// only ever sees it truncated to integer ms, so the optimistic-concurrency
// guard must match at ms resolution rather than exact equality.
const EXPECTED_MS = Date.parse("2026-06-02T13:40:26.159Z");
const STORED_MICROS = EXPECTED_MS * 1000 + 507; // .159507 — what the DB stores

const eventRow = {
  id: "e1",
  workspace_id: "w1",
  owner_id: "m1",
  category_id: null,
  title: "Work",
  description: null,
  location: null,
  is_private: false,
  color: null,
  kind: "event",
  context_id: null,
  all_day: false,
  inactive: false,
  status: "confirmed",
  starts_at: "2026-06-01T09:00:00.000Z",
  ends_at: "2026-06-01T10:00:00.000Z",
  time_zone: "UTC",
  rrule: null,
  recurrence_ends_at: null,
  task_id: null,
  created_at: "2026-06-01T08:00:00.000Z",
  updated_at: "2026-06-02T13:40:26.159507Z",
};

const taskRow = {
  id: "t1",
  workspace_id: "w1",
  owner_id: "m1",
  assignee_id: null,
  parent_id: null,
  category_id: null,
  title: "Do",
  description: null,
  is_private: false,
  color: null,
  status: "todo",
  priority: null,
  due_at: null,
  position: 0,
  sequential: false,
  completed_at: null,
  created_at: "2026-06-01T08:00:00.000Z",
  updated_at: "2026-06-02T13:40:26.159507Z",
};

interface Filter {
  op: "eq" | "gte" | "lt";
  col: string;
  val: string;
}

/**
 * Minimal Supabase query stand-in that records filters and, on `select()`,
 * evaluates the `updated_at` filters against a stored microsecond timestamp —
 * so the test exercises the real matching semantics, not just the call shape.
 */
function fakeClient(row: Record<string, unknown>, storedMicros: number) {
  const filters: Filter[] = [];
  const q = {
    update: () => q,
    eq: (col: string, val: string) => (filters.push({ op: "eq", col, val }), q),
    gte: (col: string, val: string) => (filters.push({ op: "gte", col, val }), q),
    lt: (col: string, val: string) => (filters.push({ op: "lt", col, val }), q),
    select: async () => {
      const microsMatch = filters
        .filter((f) => f.col === "updated_at")
        .every((f) => {
          const boundMicros = Date.parse(f.val) * 1000; // bounds are ms-precision
          if (f.op === "eq") return storedMicros === boundMicros;
          if (f.op === "gte") return storedMicros >= boundMicros;
          return storedMicros < boundMicros; // lt
        });
      return { data: microsMatch ? [row] : [], error: null };
    },
  };
  const sb = { from: () => q } as unknown as SupabaseClient;
  return { sb, filters };
}

describe("updateEvent/updateTask optimistic-concurrency guard", () => {
  it("matches a microsecond-precision row at ms resolution (no false stale write)", async () => {
    const { sb, filters } = fakeClient(eventRow, STORED_MICROS);
    const row = await updateEvent(sb, "e1", { title: "New" }, EXPECTED_MS);
    expect(row.id).toBe("e1");
    // The guard must be a 1 ms window, never an exact eq on updated_at.
    const ua = filters.filter((f) => f.col === "updated_at");
    expect(ua.some((f) => f.op === "eq")).toBe(false);
    expect(ua.map((f) => f.op).sort()).toEqual(["gte", "lt"]);
  });

  it("rejects a row changed in a later millisecond (real stale write)", async () => {
    // Stored value advanced by 1 ms — a genuine partner edit.
    const { sb } = fakeClient(eventRow, (EXPECTED_MS + 1) * 1000 + 100);
    await expect(updateEvent(sb, "e1", { title: "New" }, EXPECTED_MS)).rejects.toBeInstanceOf(
      StaleWriteError,
    );
  });

  it("applies the same guard to tasks", async () => {
    const { sb } = fakeClient(taskRow, STORED_MICROS);
    const row = await updateTask(sb, "t1", { title: "New" }, EXPECTED_MS);
    expect(row.id).toBe("t1");

    const { sb: sb2 } = fakeClient(taskRow, (EXPECTED_MS + 5) * 1000);
    await expect(updateTask(sb2, "t1", { title: "New" }, EXPECTED_MS)).rejects.toBeInstanceOf(
      StaleWriteError,
    );
  });
});
