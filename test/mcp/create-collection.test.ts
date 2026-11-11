import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCollection } from "@/lib/supabase/mutations";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";

/** A Supabase stand-in that records inserts and deletes, per table. */
function fakeSupabase(opts: { boardError?: Error } = {}) {
  const inserts: { table: string; rows: unknown }[] = [];
  const deletes: { table: string; id: unknown }[] = [];
  const sb = {
    from(table: string) {
      return {
        insert(rows: unknown) {
          inserts.push({ table, rows });
          const result =
            table === "boards"
              ? { error: opts.boardError ?? null }
              : { data: { id: "col-new" }, error: null };
          return {
            select: () => ({ single: async () => result }),
            then: (resolve: (v: unknown) => unknown) => resolve(result),
          };
        },
        delete() {
          return {
            eq: async (_col: string, id: unknown) => {
              deletes.push({ table, id });
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { sb: sb as unknown as SupabaseClient, inserts, deletes };
}

const base = { workspaceId: WORKSPACE_ID, ownerId: OWNER_ID, name: "Board", color: "#c0492a" };

describe("createCollection", () => {
  it("seeds the three default columns when none are given", async () => {
    const { sb, inserts } = fakeSupabase();
    expect(await createCollection(sb, base)).toBe("col-new");
    const boards = inserts.find((i) => i.table === "boards")!.rows as Record<string, unknown>[];
    expect(boards.map((b) => [b.name, b.position, b.is_done, b.line_style])).toEqual([
      ["To Do", 0, false, "solid"],
      ["In Progress", 1, false, "solid"],
      ["Done", 2, true, "solid"],
    ]);
  });

  it("seeds the given columns, left to right, in the new collection", async () => {
    const { sb, inserts } = fakeSupabase();
    await createCollection(sb, {
      ...base,
      columns: [
        { name: "Backlog", isDone: false },
        { name: "Review", isDone: false },
        { name: "Shipped", isDone: true },
        { name: "Parked", isDone: false },
      ],
    });
    const boards = inserts.find((i) => i.table === "boards")!.rows as Record<string, unknown>[];
    expect(boards).toEqual([
      { workspace_id: WORKSPACE_ID, collection_id: "col-new", name: "Backlog", line_style: "solid", position: 0, is_done: false },
      { workspace_id: WORKSPACE_ID, collection_id: "col-new", name: "Review", line_style: "solid", position: 1, is_done: false },
      { workspace_id: WORKSPACE_ID, collection_id: "col-new", name: "Shipped", line_style: "solid", position: 2, is_done: true },
      { workspace_id: WORKSPACE_ID, collection_id: "col-new", name: "Parked", line_style: "solid", position: 3, is_done: false },
    ]);
  });

  it("checks the column names before writing anything", async () => {
    const { sb, inserts } = fakeSupabase();
    await expect(createCollection(sb, { ...base, columns: [{ name: "  ", isDone: true }] })).rejects.toThrow(
      "Please name the column.",
    );
    expect(inserts).toEqual([]);
  });

  it("takes the collection back when its columns can't be written", async () => {
    const { sb, deletes } = fakeSupabase({ boardError: new Error("boards refused") });
    await expect(createCollection(sb, base)).rejects.toThrow("boards refused");
    expect(deletes).toEqual([{ table: "collections", id: "col-new" }]);
  });
});
