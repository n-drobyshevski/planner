import { describe, it, expect } from "vitest";
import { packDay, type LayoutInterval } from "@/lib/layout/pack-day";

// Helpers: build epoch-ms intervals on an arbitrary day. The packing logic is
// time-zone agnostic (it only compares numbers), so a fixed UTC base is fine.
const DAY = Date.UTC(2026, 4, 31); // 2026-05-31 00:00:00 UTC
const h = (hours: number, minutes = 0): number =>
  DAY + hours * 3_600_000 + minutes * 60_000;
const iv = (sh: number, sm: number, eh: number, em: number): LayoutInterval => ({
  start: h(sh, sm),
  end: h(eh, em),
});

describe("packDay", () => {
  it("empty -> []", () => {
    expect(packDay([])).toEqual([]);
  });

  it("single -> left0 width100", () => {
    const res = packDay([iv(9, 0, 10, 0)]);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      index: 0,
      colIndex: 0,
      colCount: 1,
      colSpan: 1,
      leftPct: 0,
      widthPct: 100,
    });
  });

  it("two overlapping (9-10, 9:30-10:30) -> left0/width50 and left50/width50", () => {
    const res = packDay([iv(9, 0, 10, 0), iv(9, 30, 10, 30)]);
    expect(res).toHaveLength(2);
    // result[i] corresponds to items[i]
    expect(res[0]).toMatchObject({
      index: 0,
      colIndex: 0,
      colCount: 2,
      colSpan: 1,
      leftPct: 0,
      widthPct: 50,
    });
    expect(res[1]).toMatchObject({
      index: 1,
      colIndex: 1,
      colCount: 2,
      colSpan: 1,
      leftPct: 50,
      widthPct: 50,
    });
  });

  it("three mutually overlapping -> thirds", () => {
    const res = packDay([
      iv(9, 0, 12, 0),
      iv(9, 30, 11, 0),
      iv(10, 0, 11, 30),
    ]);
    expect(res).toHaveLength(3);
    for (const r of res) {
      expect(r.colCount).toBe(3);
      expect(r.colSpan).toBe(1);
      expect(r.widthPct).toBeCloseTo(100 / 3, 10);
    }
    expect(res[0].colIndex).toBe(0);
    expect(res[0].leftPct).toBeCloseTo(0, 10);
    expect(res[1].colIndex).toBe(1);
    expect(res[1].leftPct).toBeCloseTo(100 / 3, 10);
    expect(res[2].colIndex).toBe(2);
    expect(res[2].leftPct).toBeCloseTo(200 / 3, 10);
  });

  it("touching back-to-back (10-11, 11-12) -> both col0 width100", () => {
    const res = packDay([iv(10, 0, 11, 0), iv(11, 0, 12, 0)]);
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({
      index: 0,
      colIndex: 0,
      colCount: 1,
      colSpan: 1,
      leftPct: 0,
      widthPct: 100,
    });
    expect(res[1]).toMatchObject({
      index: 1,
      colIndex: 0,
      colCount: 1,
      colSpan: 1,
      leftPct: 0,
      widthPct: 100,
    });
  });

  it("transitive chain A9-10 B9:30-10:30 C10:15-11 -> no visual overlap", () => {
    // A overlaps B, B overlaps C, but A does NOT overlap C (A ends 10:00, C starts 10:15).
    const res = packDay([
      iv(9, 0, 10, 0), // A
      iv(9, 30, 10, 30), // B
      iv(10, 15, 11, 0), // C
    ]);
    expect(res).toHaveLength(3);
    // All in the same cluster (transitively overlapping) -> colCount 2.
    expect(res[0].colCount).toBe(2);
    expect(res[1].colCount).toBe(2);
    expect(res[2].colCount).toBe(2);

    // A -> col0. B overlaps A -> col1. C does not overlap A -> reuses col0.
    expect(res[0]).toMatchObject({ index: 0, colIndex: 0 });
    expect(res[1]).toMatchObject({ index: 1, colIndex: 1 });
    expect(res[2]).toMatchObject({ index: 2, colIndex: 0 });

    // A (col0) cannot expand: col1 holds B which overlaps A.
    expect(res[0].colSpan).toBe(1);
    expect(res[0].widthPct).toBeCloseTo(50, 10);
    // C (col0) cannot expand into col1: B (9:30-10:30) DOES overlap C (10:15-11:00),
    // and B occupies col1, so C stays width 50.
    expect(res[2].colSpan).toBe(1);
    expect(res[2].widthPct).toBeCloseTo(50, 10);
    // B (col1) cannot expand rightward (edge) -> span 1.
    expect(res[1].colSpan).toBe(1);

    // Geometric non-overlap assertion: for any two items occupying overlapping
    // time AND overlapping horizontal ranges, that's a visual collision.
    const items = [iv(9, 0, 10, 0), iv(9, 30, 10, 30), iv(10, 15, 11, 0)];
    for (let i = 0; i < res.length; i++) {
      for (let j = i + 1; j < res.length; j++) {
        const a = items[i];
        const b = items[j];
        const timeOverlap = a.start < b.end && b.start < a.end;
        if (!timeOverlap) continue;
        const aL = res[i].leftPct;
        const aR = res[i].leftPct + res[i].widthPct;
        const bL = res[j].leftPct;
        const bR = res[j].leftPct + res[j].widthPct;
        const horizOverlap = aL < bR - 1e-9 && bL < aR - 1e-9;
        expect(horizOverlap).toBe(false);
      }
    }
  });

  it("nested A9-12 B10-11", () => {
    const res = packDay([iv(9, 0, 12, 0), iv(10, 0, 11, 0)]);
    expect(res).toHaveLength(2);
    expect(res[0].colCount).toBe(2);
    expect(res[1].colCount).toBe(2);
    // A -> col0, B overlaps A -> col1.
    expect(res[0]).toMatchObject({ index: 0, colIndex: 0, colSpan: 1 });
    expect(res[1]).toMatchObject({ index: 1, colIndex: 1, colSpan: 1 });
    expect(res[0].leftPct).toBeCloseTo(0, 10);
    expect(res[0].widthPct).toBeCloseTo(50, 10);
    expect(res[1].leftPct).toBeCloseTo(50, 10);
    expect(res[1].widthPct).toBeCloseTo(50, 10);
  });

  it("colSpan case: A9-11, B9-9:30(col1), C10-10:30(col1); B,C disjoint -> A cannot expand, width 50", () => {
    const res = packDay([
      iv(9, 0, 11, 0), // A
      iv(9, 0, 9, 30), // B
      iv(10, 0, 10, 30), // C
    ]);
    expect(res).toHaveLength(3);
    // colCount 2 across the cluster.
    expect(res[0].colCount).toBe(2);
    expect(res[1].colCount).toBe(2);
    expect(res[2].colCount).toBe(2);

    // A -> col0 (starts 9, ends later, sorted first among the 9:00 starts).
    expect(res[0].colIndex).toBe(0);
    // B -> col1 (overlaps A). C -> col1 (does not overlap B, reuses col1).
    expect(res[1].colIndex).toBe(1);
    expect(res[2].colIndex).toBe(1);

    // A cannot expand into col1 because col1 is "busy across A": B overlaps A.
    expect(res[0].colSpan).toBe(1);
    expect(res[0].widthPct).toBeCloseTo(50, 10);
    expect(res[0].leftPct).toBeCloseTo(0, 10);

    // B and C sit in col1.
    expect(res[1].leftPct).toBeCloseTo(50, 10);
    expect(res[1].widthPct).toBeCloseTo(50, 10);
    expect(res[2].leftPct).toBeCloseTo(50, 10);
    expect(res[2].widthPct).toBeCloseTo(50, 10);
  });

  it("preserves original input order in result mapping", () => {
    // Provide out-of-order items; result[i] must correspond to items[i].
    const items = [
      iv(11, 0, 12, 0), // 0: later
      iv(9, 0, 10, 0), // 1: earlier, separate cluster
    ];
    const res = packDay(items);
    expect(res.map((r) => r.index)).toEqual([0, 1]);
    // Disjoint clusters -> each full width.
    expect(res[0]).toMatchObject({ colCount: 1, widthPct: 100 });
    expect(res[1]).toMatchObject({ colCount: 1, widthPct: 100 });
  });

  it("disjoint groups expand independently and span only within their cluster", () => {
    // Two separate overlapping pairs.
    const res = packDay([
      iv(9, 0, 10, 0),
      iv(9, 30, 10, 30),
      iv(13, 0, 14, 0),
      iv(13, 30, 14, 30),
    ]);
    expect(res[0].colCount).toBe(2);
    expect(res[1].colCount).toBe(2);
    expect(res[2].colCount).toBe(2);
    expect(res[3].colCount).toBe(2);
  });

  it("expands colSpan rightward into a free column (span > 1)", () => {
    // A 9-12 (col0, the wide spine). B 9-9:30 (col1). C 9-9:30 (col2) -> 3-col cluster.
    // D 10-11 lands in col1 (does not overlap B or C). col2 over D's time is FREE
    // (C ended 9:30), so D must expand into col2: colSpan 2.
    const res = packDay([
      iv(9, 0, 12, 0), // 0: A
      iv(9, 0, 9, 30), // 1: B
      iv(9, 0, 9, 30), // 2: C
      iv(10, 0, 11, 0), // 3: D
    ]);
    expect(res).toHaveLength(4);
    // One transitive cluster, 3 columns.
    for (const r of res) expect(r.colCount).toBe(3);

    expect(res[0].colIndex).toBe(0); // A
    expect(res[0].colSpan).toBe(1);
    expect(res[0].widthPct).toBeCloseTo(100 / 3, 10);

    // D reuses col1 and expands rightward into the free col2.
    expect(res[3].colIndex).toBe(1);
    expect(res[3].colSpan).toBe(2);
    expect(res[3].leftPct).toBeCloseTo(100 / 3, 10);
    expect(res[3].widthPct).toBeCloseTo(200 / 3, 10);

    // Geometric guarantee: time-overlapping pairs must not overlap horizontally.
    const items = [iv(9, 0, 12, 0), iv(9, 0, 9, 30), iv(9, 0, 9, 30), iv(10, 0, 11, 0)];
    for (let i = 0; i < res.length; i++) {
      for (let j = i + 1; j < res.length; j++) {
        const timeOverlap =
          items[i].start < items[j].end && items[j].start < items[i].end;
        if (!timeOverlap) continue;
        const aL = res[i].leftPct;
        const aR = res[i].leftPct + res[i].widthPct;
        const bL = res[j].leftPct;
        const bR = res[j].leftPct + res[j].widthPct;
        const horizOverlap = aL < bR - 1e-9 && bL < aR - 1e-9;
        expect(horizOverlap).toBe(false);
      }
    }
  });

  it("property: random layouts never produce visual collisions and never share a column when time-overlapping", () => {
    // Deterministic PRNG (mulberry32) so the test is reproducible.
    let seed = 0x9e3779b9 >>> 0;
    const rand = (): number => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const ri = (max: number): number => Math.floor(rand() * max);

    for (let trial = 0; trial < 3000; trial++) {
      const count = 1 + ri(6);
      const items: LayoutInterval[] = [];
      for (let k = 0; k < count; k++) {
        const s = ri(20);
        const e = s + 1 + ri(8); // strictly positive duration
        items.push({ start: h(0, s * 15), end: h(0, e * 15) });
      }
      const res = packDay(items);
      expect(res).toHaveLength(count);
      // result[i] maps to items[i]
      for (let i = 0; i < count; i++) expect(res[i].index).toBe(i);

      for (let i = 0; i < count; i++) {
        // widthPct within (0, 100], leftPct within [0, 100)
        expect(res[i].widthPct).toBeGreaterThan(0);
        expect(res[i].leftPct + res[i].widthPct).toBeLessThanOrEqual(100 + 1e-9);
        expect(res[i].colSpan).toBeGreaterThanOrEqual(1);

        for (let j = i + 1; j < count; j++) {
          const a = items[i];
          const b = items[j];
          const timeOverlap = a.start < b.end && b.start < a.end;
          if (!timeOverlap) continue;
          // Time-overlapping items must occupy different columns within a cluster.
          // (Same cluster => same colCount; different colIndex.)
          expect(res[i].colCount).toBe(res[j].colCount);
          expect(res[i].colIndex).not.toBe(res[j].colIndex);
          // ...and must not collide horizontally.
          const aL = res[i].leftPct;
          const aR = res[i].leftPct + res[i].widthPct;
          const bL = res[j].leftPct;
          const bR = res[j].leftPct + res[j].widthPct;
          const horizOverlap = aL < bR - 1e-9 && bL < aR - 1e-9;
          expect(horizOverlap).toBe(false);
        }
      }
    }
  });
});
