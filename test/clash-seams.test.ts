import { describe, it, expect } from "vitest";
import { packDay, type LayoutInterval } from "@/lib/layout/pack-day";
import { clashRanges } from "@/lib/layout/clash-seams";

// Same fixed-UTC base as pack-day.test.ts; the logic only compares numbers.
const DAY = Date.UTC(2026, 4, 31);
const h = (hours: number, minutes = 0): number =>
  DAY + hours * 3_600_000 + minutes * 60_000;
const iv = (sh: number, sm: number, eh: number, em: number): LayoutInterval => ({
  start: h(sh, sm),
  end: h(eh, em),
});
// clashRanges always consumes packDay's output for the same intervals.
const run = (items: LayoutInterval[]) => clashRanges(items, packDay(items));

describe("clashRanges", () => {
  it("empty -> []", () => {
    expect(run([])).toEqual([]);
  });

  it("single event -> no clash", () => {
    expect(run([iv(9, 0, 10, 0)])).toEqual([null]);
  });

  it("back-to-back (touching endpoints do not overlap) -> no clash", () => {
    expect(run([iv(10, 0, 11, 0), iv(11, 0, 12, 0)])).toEqual([null, null]);
  });

  it("disjoint events -> no clash", () => {
    expect(run([iv(9, 0, 10, 0), iv(13, 0, 14, 0)])).toEqual([null, null]);
  });

  it("two overlapping -> only the front (right-staggered) block carries the seam", () => {
    // 9–10 (back, leftPct 0) and 9:30–10:30 (front, leftPct 28).
    const res = run([iv(9, 0, 10, 0), iv(9, 30, 10, 30)]);
    expect(res[0]).toBeNull();
    expect(res[1]).toEqual({ start: h(9, 30), end: h(10, 0) });
  });

  it("the seam spans only the overlap, not the whole front block", () => {
    // Front block 10:00–11:30 only overlaps the back block 9:00–10:30 from 10:00–10:30.
    const res = run([iv(9, 0, 10, 30), iv(10, 0, 11, 30)]);
    expect(res[1]).toEqual({ start: h(10, 0), end: h(10, 30) });
  });

  it("transitive chain: the middle block seams across BOTH neighbours, edges stay clear", () => {
    // A 9–10 (col0), B 9:30–10:30 (col1), C 10:15–11 (col0, reuses A's lane).
    // A and C never overlap, so only B carries a seam — unioned over A and C.
    const res = run([iv(9, 0, 10, 0), iv(9, 30, 10, 30), iv(10, 15, 11, 0)]);
    expect(res[0]).toBeNull();
    expect(res[2]).toBeNull();
    expect(res[1]).toEqual({ start: h(9, 30), end: h(10, 30) });
  });

  it("three-deep cascade -> each higher lane seams over the lanes it covers", () => {
    const res = run([iv(9, 0, 12, 0), iv(9, 30, 11, 0), iv(10, 0, 11, 30)]);
    expect(res[0]).toBeNull(); // back lane, nothing to its left
    expect(res[1]).toEqual({ start: h(9, 30), end: h(11, 0) }); // over A
    expect(res[2]).toEqual({ start: h(10, 0), end: h(11, 30) }); // over A + B (unioned)
  });

  it("dense split (5 mutually overlapping) -> leftmost lane clear, the other four clash", () => {
    const items = [
      iv(9, 0, 11, 0),
      iv(9, 15, 11, 0),
      iv(9, 30, 11, 0),
      iv(9, 45, 11, 0),
      iv(10, 0, 11, 0),
    ];
    const res = run(items);
    expect(res.filter((r) => r === null)).toHaveLength(1);
    expect(res.filter(Boolean)).toHaveLength(4);
  });

  it("clash ranges always fall within the carrying event's own interval", () => {
    const items = [
      iv(9, 0, 12, 0),
      iv(9, 30, 11, 0),
      iv(10, 0, 11, 30),
      iv(13, 0, 14, 0),
    ];
    const res = run(items);
    res.forEach((r, i) => {
      if (!r) return;
      expect(r.start).toBeGreaterThanOrEqual(items[i].start);
      expect(r.end).toBeLessThanOrEqual(items[i].end);
      expect(r.start).toBeLessThan(r.end);
    });
  });
});
