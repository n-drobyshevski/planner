import { describe, it, expect, beforeEach, vi } from "vitest";
import { useHistoryStore } from "@/stores/history-store";

const reset = () => useHistoryStore.setState({ stack: [], undoing: false });

describe("history store", () => {
  beforeEach(reset);

  it("runs the newest entry first (LIFO) and returns its label", async () => {
    const order: string[] = [];
    useHistoryStore.getState().push({
      label: "first",
      undo: async () => {
        order.push("first");
        return true;
      },
    });
    useHistoryStore.getState().push({
      label: "second",
      undo: async () => {
        order.push("second");
        return true;
      },
    });

    expect(await useHistoryStore.getState().runUndo()).toBe("second");
    expect(await useHistoryStore.getState().runUndo()).toBe("first");
    expect(order).toEqual(["second", "first"]);
    expect(useHistoryStore.getState().stack).toHaveLength(0);
  });

  it("returns null on an empty stack", async () => {
    expect(await useHistoryStore.getState().runUndo()).toBeNull();
  });

  it("returns null when the inverse reports failure", async () => {
    useHistoryStore.getState().push({ label: "x", undo: async () => false });
    expect(await useHistoryStore.getState().runUndo()).toBeNull();
  });

  it("treats a thrown inverse as failure", async () => {
    useHistoryStore.getState().push({
      label: "x",
      undo: async () => {
        throw new Error("boom");
      },
    });
    expect(await useHistoryStore.getState().runUndo()).toBeNull();
  });

  it("skips entries older than the max age", async () => {
    vi.useFakeTimers();
    try {
      useHistoryStore.getState().push({ label: "stale", undo: async () => true });
      vi.advanceTimersByTime(6 * 60_000); // > 5 min
      expect(await useHistoryStore.getState().runUndo()).toBeNull();
      expect(useHistoryStore.getState().stack).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a re-entrant undo while one is in flight", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    useHistoryStore.getState().push({
      label: "slow",
      undo: async () => {
        await gate;
        return true;
      },
    });

    const first = useHistoryStore.getState().runUndo();
    // A second call before the first resolves is rejected by the guard.
    expect(await useHistoryStore.getState().runUndo()).toBeNull();
    release();
    expect(await first).toBe("slow");
  });

  it("caps the stack at the maximum size", () => {
    for (let i = 0; i < 40; i++) {
      useHistoryStore.getState().push({ label: `${i}`, undo: async () => true });
    }
    const { stack } = useHistoryStore.getState();
    expect(stack).toHaveLength(30);
    // The oldest were dropped; newest is retained.
    expect(stack[stack.length - 1].label).toBe("39");
    expect(stack[0].label).toBe("10");
  });

  it("push returns the new entry's id", () => {
    const id = useHistoryStore.getState().push({ label: "x", undo: async () => true });
    expect(typeof id).toBe("string");
    expect(useHistoryStore.getState().stack[0].id).toBe(id);
  });

  it("undoById runs and removes a SPECIFIC entry, regardless of position", async () => {
    const ran: string[] = [];
    const idA = useHistoryStore.getState().push({
      label: "older",
      undo: async () => (ran.push("older"), true),
    });
    useHistoryStore.getState().push({
      label: "newer",
      undo: async () => (ran.push("newer"), true),
    });
    expect(await useHistoryStore.getState().undoById(idA)).toBe("older");
    expect(ran).toEqual(["older"]); // newer untouched
    expect(useHistoryStore.getState().stack.map((e) => e.label)).toEqual(["newer"]);
  });

  it("undoById after Ctrl+Z does not double-run (entry already gone)", async () => {
    let runs = 0;
    const id = useHistoryStore.getState().push({
      label: "delete",
      undo: async () => (runs++, true),
    });
    await useHistoryStore.getState().runUndo(); // Ctrl+Z
    expect(await useHistoryStore.getState().undoById(id)).toBeNull(); // toast click after
    expect(runs).toBe(1);
  });

  it("undoById on an unknown id is a no-op", async () => {
    expect(await useHistoryStore.getState().undoById("nope")).toBeNull();
  });

  it("undoById clears the entry even when the inverse fails", async () => {
    const id = useHistoryStore.getState().push({ label: "x", undo: async () => false });
    expect(await useHistoryStore.getState().undoById(id)).toBeNull();
    expect(useHistoryStore.getState().stack).toHaveLength(0);
  });
});
