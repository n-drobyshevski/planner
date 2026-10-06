import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "../test-utils";
import { useTimeslotRequests } from "@/lib/hooks/use-timeslot-requests";

/** Records the update statement's builder calls and answers it with no error. */
const { calls } = vi.hoisted(() => ({ calls: [] as [string, unknown[]][] }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const builder: Record<string, unknown> = {};
    for (const op of ["from", "update", "eq"]) {
      builder[op] = (...args: unknown[]) => {
        calls.push([op, args]);
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
    return builder;
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

function hook() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => useTimeslotRequests("ws"), { wrapper }).result.current;
}

describe("useTimeslotRequests", () => {
  it("resolves a request only while it is still pending", async () => {
    calls.length = 0;
    await expect(hook().markDeclined("req-1")).resolves.toBe(true);

    expect(calls.filter(([op]) => op === "eq").map(([, args]) => args)).toEqual([
      ["id", "req-1"],
      ["status", "pending"],
    ]);
    const [, [patch]] = calls.find(([op]) => op === "update")!;
    expect(patch).toMatchObject({ status: "declined" });
  });
});
