import { create } from "zustand";

/**
 * Undo history (client-only, ephemeral). Each mutation that succeeds pushes an
 * `UndoEntry` whose `undo` thunk performs the inverse write. Ctrl/Cmd+Z (see
 * `components/undo-hotkey.tsx`) pops and runs the newest entry.
 *
 * Thunks must close ONLY over captured primitives (ids, prior field values, the
 * post-write `updatedAt`, a Supabase client) — never over component/render
 * state — because they may run long after the originating view has unmounted.
 */
export interface UndoEntry {
  /** Stable id (de-dup / future removal). */
  id: string;
  /** Human label shown in the "Undone: <label>" toast. */
  label: string;
  /** When the action happened (ms) — entries older than MAX_AGE_MS are dropped. */
  at: number;
  /** Async inverse. Resolves true on success, false on a handled failure. */
  undo: () => Promise<boolean>;
}

interface HistoryState {
  /** Bounded LIFO stack; newest last. */
  stack: UndoEntry[];
  /** Re-entrancy guard (Ctrl+Z held / double-fire). */
  undoing: boolean;
  push: (entry: Omit<UndoEntry, "id" | "at">) => void;
  /** Pop + run the newest live entry. Returns its label on success, else null. */
  runUndo: () => Promise<string | null>;
  clear: () => void;
}

/** Keep the stack small — undo is for recent slips, not a full audit log. */
const MAX = 30;
/** Drop entries this old when undo is invoked (avoid surprising stale reversals). */
const MAX_AGE_MS = 5 * 60_000;

export const useHistoryStore = create<HistoryState>((set, get) => ({
  stack: [],
  undoing: false,

  push: (entry) =>
    set((s) => {
      const next = [
        ...s.stack,
        { ...entry, id: crypto.randomUUID(), at: Date.now() },
      ];
      // Trim to the newest MAX entries.
      return { stack: next.length > MAX ? next.slice(next.length - MAX) : next };
    }),

  runUndo: async () => {
    if (get().undoing) return null;
    // Pop the newest entry that hasn't expired; discard any stale ones above it.
    const cutoff = Date.now() - MAX_AGE_MS;
    let entry: UndoEntry | undefined;
    set((s) => {
      const stack = [...s.stack];
      while (stack.length > 0) {
        const e = stack.pop()!;
        if (e.at >= cutoff) {
          entry = e;
          break;
        }
      }
      return { stack, undoing: entry != null };
    });
    if (!entry) return null;
    try {
      const ok = await entry.undo();
      return ok ? entry.label : null;
    } catch {
      return null;
    } finally {
      set({ undoing: false });
    }
  },

  clear: () => set({ stack: [] }),
}));
