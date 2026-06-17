import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { isWindowData, type WindowData } from "@/lib/supabase/queries";
import { qk } from "@/lib/supabase/query-keys";
import type { EventRow, OverrideRow } from "@/lib/types";

const WS = "ws-1";
const evt = (id: string) => ({ id, taskId: null } as unknown as EventRow);
const ovr = (eventId: string, occurrenceDate: number) =>
  ({ id: `${eventId}:${occurrenceDate}`, eventId, occurrenceDate, type: "modify" } as unknown as OverrideRow);

describe("isWindowData", () => {
  it("accepts a window payload", () => {
    expect(isWindowData({ events: [], overrides: [] })).toBe(true);
  });
  it("rejects the bare EventRow[] that backs the task-blocks query", () => {
    expect(isWindowData([evt("a"), evt("b")])).toBe(false);
  });
  it("rejects undefined / null / partial shapes", () => {
    expect(isWindowData(undefined)).toBe(false);
    expect(isWindowData(null)).toBe(false);
    expect(isWindowData({ events: [] })).toBe(false);
  });
});

describe("eventsAll-prefixed optimistic patch with a mixed cache", () => {
  // Reproduces the crash: the task-blocks query is keyed UNDER ["events", ws],
  // so setQueriesData({ queryKey: eventsAll }) matches it even though its data is
  // an EventRow[], not a WindowData. The guard must skip it instead of reading
  // `.overrides` off an array.
  it("upserts into windows and leaves the task-blocks array untouched", () => {
    const qc = new QueryClient();
    const windowData: WindowData = { events: [evt("recurring")], overrides: [] };
    const taskBlocks: EventRow[] = [evt("recurring"), evt("other")];

    qc.setQueryData(qk.window(WS, 0, 1000), windowData);
    qc.setQueryData(qk.taskBlocks(WS), taskBlocks);

    // The same guarded updater shape used by upsertOverrideInWindows.
    expect(() =>
      qc.setQueriesData<WindowData>({ queryKey: qk.eventsAll(WS) }, (old) => {
        if (!isWindowData(old)) return old;
        return { ...old, overrides: [...old.overrides, ovr("recurring", 500)] };
      }),
    ).not.toThrow();

    expect(qc.getQueryData<WindowData>(qk.window(WS, 0, 1000))?.overrides).toHaveLength(1);
    // Task-blocks entry is returned as-is — never mutated, never crashed on.
    expect(qc.getQueryData<EventRow[]>(qk.taskBlocks(WS))).toBe(taskBlocks);
  });
});
