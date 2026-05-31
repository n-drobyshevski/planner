import { describe, it, expect } from "vitest";
import { positionBetween } from "@/lib/tasks/ordering";

describe("positionBetween", () => {
  it("returns 0 for the first item (both null)", () => {
    expect(positionBetween(null, null)).toBe(0);
  });

  it("drops at the top: after - 1", () => {
    expect(positionBetween(null, 10)).toBe(9);
  });

  it("drops at the bottom: before + 1", () => {
    expect(positionBetween(10, null)).toBe(11);
  });

  it("returns the midpoint between two neighbors", () => {
    expect(positionBetween(10, 20)).toBe(15);
    expect(positionBetween(0, 1)).toBe(0.5);
  });

  it("keeps strict ordering after repeated halving", () => {
    const lo = 0;
    let hi = 1;
    for (let i = 0; i < 20; i++) {
      const mid = positionBetween(lo, hi);
      expect(mid).toBeGreaterThan(lo);
      expect(mid).toBeLessThan(hi);
      hi = mid; // keep inserting just above lo
    }
  });
});
