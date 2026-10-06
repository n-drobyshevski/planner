import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en";
import { renderHook } from "./test-utils";
import { useEventMutations } from "@/lib/hooks/use-event-mutations";
import { useHistoryStore } from "@/stores/history-store";
import type { EventRow } from "@/lib/types";

const { applyOverride, revertOverride, splitSeries, revertSplit } = vi.hoisted(() => ({
  applyOverride: vi.fn(),
  revertOverride: vi.fn(),
  splitSeries: vi.fn(),
  revertSplit: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/hooks/use-notify", () => ({ useNotify: () => ({ success: vi.fn() }) }));
vi.mock("@/lib/supabase/mutations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/mutations")>()),
  applyOverride,
  revertOverride,
  splitSeries,
  revertSplit,
}));

function mutations() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  );
  return renderHook(() => useEventMutations("ws"), { wrapper }).result.current;
}

const series = {
  id: "evt-1",
  rrule: "FREQ=WEEKLY;BYDAY=MO",
  recurrenceEndsAt: null,
} as EventRow;
const occurrence = Date.UTC(2026, 9, 5, 7);

const undoStack = () => useHistoryStore.getState().stack;

beforeEach(() => {
  vi.clearAllMocks();
  useHistoryStore.getState().clear();
});

describe("this-occurrence edits", () => {
  it("offer an undo that restores a known prior", async () => {
    const prior = { kind: "known", row: { id: "ov-1" } } as const;
    applyOverride.mockResolvedValue({ prior });
    revertOverride.mockResolvedValue(undefined);

    await mutations().editThis(series, occurrence, { title: "Moved" });
    expect(undoStack()).toHaveLength(1);

    await expect(undoStack()[0].undo()).resolves.toBe(true);
    expect(revertOverride).toHaveBeenCalledWith({}, "evt-1", occurrence, prior);
  });

  it("offer no undo when the replaced override is unknown", async () => {
    applyOverride.mockResolvedValue({ prior: { kind: "unknown" } });

    await expect(mutations().editThis(series, occurrence, { title: "Moved" })).resolves.toBe(true);
    await expect(mutations().deleteThis(series, occurrence)).resolves.toBe(true);

    expect(undoStack()).toEqual([]);
    expect(revertOverride).not.toHaveBeenCalled();
  });
});

describe("this-and-following edits", () => {
  it("undo through revertSplit, which restores the rule before dropping the new series", async () => {
    splitSeries.mockResolvedValue({ id: "new-series" });
    revertSplit.mockResolvedValue(undefined);

    await mutations().editFuture(series, occurrence, { title: "Later" });
    await expect(undoStack()[0].undo()).resolves.toBe(true);

    expect(revertSplit).toHaveBeenCalledWith({}, series, "new-series");
  });
});
