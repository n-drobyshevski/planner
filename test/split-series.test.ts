import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { splitSeries } from "@/lib/supabase/mutations";
import type { EventRow } from "@/lib/types";

type Call = { table: string; ops: [string, unknown[]][] };

/**
 * A chainable stand-in for the supabase client: records each statement's
 * builder calls and answers it with `respond(call)` once awaited.
 */
function fakeClient(respond: (call: Call) => { data?: unknown; error?: unknown }) {
  const calls: Call[] = [];
  const sb = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      for (const op of ["insert", "update", "select", "single", "delete", "eq"]) {
        builder[op] = (...args: unknown[]) => {
          call.ops.push([op, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null, ...respond(call) });
      return builder;
    },
  };
  return { sb: sb as unknown as SupabaseClient, calls };
}

const kind = (call: Call) => call.ops[0][0];

/** Echoes an insert back as the stored row, like `INSERT … RETURNING`. */
const respond =
  (failCap: boolean) =>
  (call: Call): { data?: unknown; error?: unknown } => {
    if (kind(call) === "insert") {
      const row = call.ops[0][1][0] as Record<string, unknown>;
      return { data: { ...row, id: "new-series" } };
    }
    if (kind(call) === "update" && failCap) return { error: new Error("cap failed") };
    return {};
  };

const series: EventRow = {
  id: "evt-1",
  workspaceId: "ws",
  ownerId: "me",
  categoryId: null,
  title: "Standup",
  description: null,
  location: null,
  isPrivate: false,
  isShared: false,
  hiddenFromPublic: false,
  color: null,
  kind: "event",
  allDay: false,
  inactive: false,
  status: "confirmed",
  start: Date.UTC(2026, 0, 5, 10),
  end: Date.UTC(2026, 0, 5, 11),
  timeZone: "UTC",
  rrule: "FREQ=WEEKLY;BYDAY=MO",
  recurrenceEndsAt: null,
  taskId: null,
  attributes: {},
  createdAt: Date.UTC(2025, 11, 1),
  updatedAt: Date.UTC(2025, 11, 1),
};
const from = Date.UTC(2026, 1, 2, 10);

describe("splitSeries", () => {
  it("inserts the new series before capping the original", async () => {
    const { sb, calls } = fakeClient(respond(false));
    const created = await splitSeries(sb, series, from, { title: "Later standup" });

    expect(calls.map(kind)).toEqual(["insert", "update"]);
    expect(created.id).toBe("new-series");
    expect(created.title).toBe("Later standup");
    const cap = calls[1];
    expect(cap.ops.find(([op]) => op === "eq")![1]).toEqual(["id", "evt-1"]);
    expect((cap.ops[0][1][0] as { recurrence_ends_at: string }).recurrence_ends_at).toBe(
      new Date(from - 1000).toISOString(),
    );
  });

  it("leaves the original alone when the insert fails", async () => {
    const { sb, calls } = fakeClient((call) =>
      kind(call) === "insert" ? { error: new Error("offline") } : {},
    );
    await expect(splitSeries(sb, series, from, {})).rejects.toThrow("offline");
    expect(calls.map(kind)).toEqual(["insert"]);
  });

  it("deletes the new series again when the cap fails, then rethrows", async () => {
    const { sb, calls } = fakeClient(respond(true));
    await expect(splitSeries(sb, series, from, {})).rejects.toThrow("cap failed");

    expect(calls.map(kind)).toEqual(["insert", "update", "delete"]);
    expect(calls[2].ops.find(([op]) => op === "eq")![1]).toEqual(["id", "new-series"]);
  });
});
