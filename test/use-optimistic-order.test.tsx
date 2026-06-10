import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOptimisticOrder } from "@/lib/hooks/use-optimistic-order";

const byJoin = (a: string[], b: string[]) => a.join() === b.join();

describe("useOptimisticOrder", () => {
  it("starts from the source and resyncs when it changes", () => {
    const { result, rerender } = renderHook(
      ({ source }: { source: string[] }) => useOptimisticOrder(source, false, byJoin),
      { initialProps: { source: ["a", "b"] } },
    );
    expect(result.current[0]).toEqual(["a", "b"]);

    rerender({ source: ["b", "a"] });
    expect(result.current[0]).toEqual(["b", "a"]);
  });

  it("keeps a local (optimistic) value until the source actually changes", () => {
    const { result, rerender } = renderHook(
      ({ source }: { source: string[] }) => useOptimisticOrder(source, false, byJoin),
      { initialProps: { source: ["a", "b"] } },
    );
    act(() => result.current[1](["b", "a"]));
    expect(result.current[0]).toEqual(["b", "a"]);

    // Same content, new reference — must NOT reset the optimistic value.
    rerender({ source: ["a", "b"].slice() });
    expect(result.current[0]).toEqual(["b", "a"]);

    // Server caught up — resync.
    rerender({ source: ["b", "a"] });
    expect(result.current[0]).toEqual(["b", "a"]);
  });

  it("holds the local value through source changes while `hold` is set", () => {
    const { result, rerender } = renderHook(
      ({ source, hold }: { source: string[]; hold: boolean }) =>
        useOptimisticOrder(source, hold, byJoin),
      { initialProps: { source: ["a", "b", "c"], hold: false } },
    );
    // Drag starts: hold, then the caller reorders optimistically.
    rerender({ source: ["a", "b", "c"], hold: true });
    act(() => result.current[1](["c", "a", "b"]));

    // A concurrent change (e.g. partner edit) arrives mid-drag — don't reset.
    rerender({ source: ["a", "b"], hold: true });
    expect(result.current[0]).toEqual(["c", "a", "b"]);

    // Drag ends: resync to the latest source.
    rerender({ source: ["a", "b"], hold: false });
    expect(result.current[0]).toEqual(["a", "b"]);
  });

  it("defaults to reference equality", () => {
    const first = { ids: ["a"] };
    const { result, rerender } = renderHook(
      ({ source }: { source: { ids: string[] } }) => useOptimisticOrder(source, false),
      { initialProps: { source: first } },
    );
    const second = { ids: ["a"] };
    rerender({ source: second });
    expect(result.current[0]).toBe(second);
  });
});
