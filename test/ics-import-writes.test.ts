import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createEventsBulk, insertCancelOverrides } from "@/lib/supabase/mutations";
import { fetchImportDuplicates } from "@/lib/supabase/queries";
import type { EventInput } from "@/lib/supabase/mappers";

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
      for (const op of ["insert", "select", "delete", "in", "eq", "lte", "gte", "order", "range"]) {
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

const input = (i: number): EventInput => ({
  workspaceId: "ws",
  ownerId: "me",
  title: `E${i}`,
  start: Date.UTC(2026, 9, 1) + i * 3_600_000,
  end: Date.UTC(2026, 9, 1) + i * 3_600_000 + 1_800_000,
  timeZone: "UTC",
});

const echoRows = (call: Call) => {
  const insert = call.ops.find(([op]) => op === "insert");
  const rows = (insert?.[1][0] as Record<string, unknown>[]) ?? [];
  return { data: rows.map((r, i) => ({ ...r, id: `${r.title}-${i}` })) };
};

describe("createEventsBulk", () => {
  it("inserts 200 rows per statement and returns them in input order", async () => {
    const { sb, calls } = fakeClient(echoRows);
    const rows = await createEventsBulk(sb, Array.from({ length: 450 }, (_, i) => input(i)));
    expect(calls.map((c) => (c.ops[0][1][0] as unknown[]).length)).toEqual([200, 200, 50]);
    expect(rows).toHaveLength(450);
    expect(rows[0].title).toBe("E0");
    expect(rows[449].title).toBe("E449");
  });

  it("deletes the chunks already written when a later one fails", async () => {
    let inserts = 0;
    const { sb, calls } = fakeClient((call) => {
      if (call.ops[0][0] === "delete") return {};
      inserts += 1;
      return inserts === 2 ? { error: new Error("boom") } : echoRows(call);
    });
    await expect(createEventsBulk(sb, Array.from({ length: 250 }, (_, i) => input(i)))).rejects.toThrow("boom");
    const del = calls.find((c) => c.ops[0][0] === "delete")!;
    expect((del.ops.find(([op]) => op === "in")![1][1] as string[]).length).toBe(200);
  });
});

describe("insertCancelOverrides", () => {
  it("bulk-inserts cancel rows shaped like applyOverride's", async () => {
    const { sb, calls } = fakeClient(() => ({}));
    await insertCancelOverrides(sb, "ws", [{ eventId: "e1", occurrenceDate: Date.UTC(2026, 9, 8, 9) }]);
    expect(calls[0].table).toBe("event_overrides");
    expect(calls[0].ops[0]).toEqual([
      "insert",
      [[{ workspace_id: "ws", event_id: "e1", occurrence_date: "2026-10-08T09:00:00.000Z", type: "cancel" }]],
    ]);
  });
});

describe("fetchImportDuplicates", () => {
  it("looks UIDs up in chunks and pages the window past 1000 rows", async () => {
    let page = 0;
    const row = (id: string, uid: string | null) => ({
      id,
      title: id,
      starts_at: "2026-10-07T09:00:00Z",
      ends_at: "2026-10-07T10:00:00Z",
      attributes: uid ? { icalUid: uid } : {},
    });
    const { sb, calls } = fakeClient((call) => {
      if (call.ops.some(([op]) => op === "in")) return { data: [row("a", "uid-a")] };
      page += 1;
      return {
        data:
          page === 1
            ? Array.from({ length: 1000 }, (_, i) => row(`w${i}`, null))
            : [row("a", "uid-a"), row("last", null)],
      };
    });
    const uids = Array.from({ length: 150 }, (_, i) => `uid-${i}`).concat('bad"uid');
    const existing = await fetchImportDuplicates(sb, {
      workspaceId: "ws",
      ownerId: "me",
      uids,
      minStart: Date.UTC(2026, 9, 1),
      maxEnd: Date.UTC(2026, 9, 31),
    });

    const uidCalls = calls.filter((c) => c.ops.some(([op]) => op === "in"));
    expect(uidCalls.map((c) => (c.ops.find(([op]) => op === "in")![1][1] as string[]).length)).toEqual([100, 50]);
    expect(uidCalls[0].ops.find(([op]) => op === "in")![1][0]).toBe("attributes->>icalUid");
    const ranges = calls.flatMap((c) => c.ops.filter(([op]) => op === "range").map(([, a]) => a));
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    // Deduplicated by id; the UID read back from attributes.
    expect(existing).toHaveLength(1002);
    expect(existing.find((e) => e.title === "a")).toEqual({
      icalUid: "uid-a",
      title: "a",
      start: Date.UTC(2026, 9, 7, 9),
      end: Date.UTC(2026, 9, 7, 10),
    });
  });
});
