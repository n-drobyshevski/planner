import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyOverride, canRevertOverride, revertOverride } from "@/lib/supabase/mutations";

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
      for (const op of ["select", "eq", "maybeSingle", "upsert", "delete"]) {
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

const occurrence = Date.UTC(2026, 9, 5, 7);
const input = { eventId: "evt-1", occurrenceDate: occurrence, type: "cancel" as const };
const earlier = { id: "ov-1", event_id: "evt-1", type: "modify", title: "Moved standup" };

describe("applyOverride", () => {
  it("returns the override it replaced as the known prior", async () => {
    const { sb, calls } = fakeClient((call) => (kind(call) === "select" ? { data: earlier } : {}));
    const { prior } = await applyOverride(sb, "ws", input);

    expect(prior).toEqual({ kind: "known", row: earlier });
    expect(canRevertOverride(prior)).toBe(true);
    expect(calls.map(kind)).toEqual(["select", "upsert"]);
  });

  it("reports no prior when the occurrence had no override", async () => {
    const { sb } = fakeClient(() => ({}));
    const { prior } = await applyOverride(sb, "ws", input);

    expect(prior).toEqual({ kind: "none" });
    expect(canRevertOverride(prior)).toBe(true);
  });

  it("still applies the edit when the prior can't be read, but leaves it unknown", async () => {
    const { sb, calls } = fakeClient((call) =>
      kind(call) === "select" ? { error: new Error("offline") } : {},
    );
    const { prior } = await applyOverride(sb, "ws", input);

    expect(prior).toEqual({ kind: "unknown" });
    expect(canRevertOverride(prior)).toBe(false);
    expect(calls.map(kind)).toEqual(["select", "upsert"]);
  });

  it("fails when the upsert fails", async () => {
    const { sb } = fakeClient((call) =>
      kind(call) === "upsert" ? { error: new Error("denied") } : {},
    );
    await expect(applyOverride(sb, "ws", input)).rejects.toThrow("denied");
  });
});

describe("revertOverride", () => {
  it("puts a known prior back", async () => {
    const { sb, calls } = fakeClient(() => ({}));
    await revertOverride(sb, "evt-1", occurrence, { kind: "known", row: earlier });

    expect(calls.map(kind)).toEqual(["upsert"]);
    expect(calls[0].ops[0][1][0]).toEqual(earlier);
  });

  it("removes the override when there was none", async () => {
    const { sb, calls } = fakeClient(() => ({}));
    await revertOverride(sb, "evt-1", occurrence, { kind: "none" });

    expect(calls.map(kind)).toEqual(["delete"]);
  });

  it("refuses an unknown prior rather than deleting an earlier override", async () => {
    const { sb, calls } = fakeClient(() => ({}));
    await expect(revertOverride(sb, "evt-1", occurrence, { kind: "unknown" })).rejects.toThrow();

    expect(calls).toEqual([]);
  });
});
