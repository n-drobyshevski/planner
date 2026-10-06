import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { capThisAndFuture } from "@/lib/recurrence/edit-semantics";
import { revertSplit, splitSeries, StaleWriteError } from "@/lib/supabase/mutations";
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

const eqId = (call: Call) => call.ops.find(([op]) => op === "eq")![1];
const patchOf = (call: Call) => call.ops[0][1][0] as { rrule: string | null; recurrence_ends_at: string | null };

/**
 * Echoes an insert back as the stored row, like `INSERT … RETURNING`, and an
 * update as the one row it matched. `cap` sets how the first update answers.
 */
const respond =
  (cap: "ok" | "fail" | "no-row") =>
  (call: Call): { data?: unknown; error?: unknown } => {
    if (kind(call) === "insert") {
      const row = call.ops[0][1][0] as Record<string, unknown>;
      return { data: { ...row, id: "new-series" } };
    }
    if (kind(call) === "update") {
      if (cap === "fail") return { error: new Error("cap failed") };
      if (cap === "no-row") return { data: [] };
      return { data: [{ ...patchOf(call), id: eqId(call)[1] }] };
    }
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
    const { sb, calls } = fakeClient(respond("ok"));
    const created = await splitSeries(sb, series, from, { title: "Later standup" });

    expect(calls.map(kind)).toEqual(["insert", "update"]);
    expect(created.id).toBe("new-series");
    expect(created.title).toBe("Later standup");
    const cap = calls[1];
    expect(eqId(cap)).toEqual(["id", "evt-1"]);
    expect(patchOf(cap).recurrence_ends_at).toBe(new Date(from - 1000).toISOString());
  });

  it("leaves the original alone when the insert fails", async () => {
    const { sb, calls } = fakeClient((call) =>
      kind(call) === "insert" ? { error: new Error("offline") } : {},
    );
    await expect(splitSeries(sb, series, from, {})).rejects.toThrow("offline");
    expect(calls.map(kind)).toEqual(["insert"]);
  });

  it("restores the original rule and deletes the new series when the cap fails, then rethrows", async () => {
    const { sb, calls } = fakeClient(respond("fail"));
    await expect(splitSeries(sb, series, from, {})).rejects.toThrow("cap failed");

    expect(calls.map(kind)).toEqual(["insert", "update", "update", "delete"]);
    // The cap may have landed with its answer lost: the rule goes back first.
    const restore = calls[2];
    expect(eqId(restore)).toEqual(["id", "evt-1"]);
    expect(patchOf(restore)).toEqual({ rrule: "FREQ=WEEKLY;BYDAY=MO", recurrence_ends_at: null });
    expect(eqId(calls[3])).toEqual(["id", "new-series"]);
  });

  it("fails as stale and drops the new series when the original is gone", async () => {
    const { sb, calls } = fakeClient(respond("no-row"));
    await expect(splitSeries(sb, series, from, {})).rejects.toBeInstanceOf(StaleWriteError);

    expect(calls.map(kind)).toEqual(["insert", "update", "update", "delete"]);
    expect(eqId(calls[3])).toEqual(["id", "new-series"]);
  });
});

describe("revertSplit", () => {
  it("restores the original rule before deleting the new series", async () => {
    const { sb, calls } = fakeClient(respond("ok"));
    await revertSplit(sb, series, "new-series", from);

    expect(calls.map(kind)).toEqual(["update", "delete"]);
    expect(eqId(calls[0])).toEqual(["id", "evt-1"]);
    expect(patchOf(calls[0])).toEqual({ rrule: "FREQ=WEEKLY;BYDAY=MO", recurrence_ends_at: null });
    expect(eqId(calls[1])).toEqual(["id", "new-series"]);
  });

  it("keeps the new series when the restore fails, so the future isn't lost", async () => {
    const { sb, calls } = fakeClient(respond("fail"));
    await expect(revertSplit(sb, series, "new-series", from)).rejects.toThrow("cap failed");

    // The restore may have landed with only its answer lost: the cap is tried again.
    expect(calls.map(kind)).toEqual(["update", "update"]);
    expect(patchOf(calls[1]).rrule).toBe(capThisAndFuture(series, from).rrule);
  });

  it("caps the original again when the delete fails, so the future doesn't show twice", async () => {
    const { sb, calls } = fakeClient((call) =>
      kind(call) === "delete" ? { error: new Error("delete failed") } : respond("ok")(call),
    );
    await expect(revertSplit(sb, series, "new-series", from)).rejects.toThrow("delete failed");

    expect(calls.map(kind)).toEqual(["update", "delete", "delete", "update"]);
    expect(eqId(calls[3])).toEqual(["id", "evt-1"]);
    const cap = capThisAndFuture(series, from);
    expect(patchOf(calls[3])).toEqual({
      rrule: cap.rrule,
      recurrence_ends_at: new Date(from - 1000).toISOString(),
    });
  });

  it("still reports the failed undo when the re-cap fails too", async () => {
    let updates = 0;
    const { sb, calls } = fakeClient((call) => {
      if (kind(call) === "delete") return { error: new Error("delete failed") };
      if (kind(call) === "update" && ++updates > 1) return { error: new Error("offline") };
      return respond("ok")(call);
    });
    await expect(revertSplit(sb, series, "new-series", from)).rejects.toThrow("delete failed");

    expect(calls.map(kind)).toEqual(["update", "delete", "delete", "update"]);
  });

  it("tries a failed delete once more instead of capping, since it may have landed", async () => {
    let deletes = 0;
    const { sb, calls } = fakeClient((call) =>
      kind(call) === "delete" && deletes++ === 0 ? { error: new Error("timeout") } : respond("ok")(call),
    );
    await expect(revertSplit(sb, series, "new-series", from)).resolves.toBeUndefined();

    expect(calls.map(kind)).toEqual(["update", "delete", "delete"]);
  });
});
