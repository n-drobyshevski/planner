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

// Mirrors the (unexported) constants in lib/layout/pack-day.ts. Clusters with at
// most CASCADE_MAX columns cascade (overlapping, staggered, layered by z-index);
// denser clusters fall back to equal side-by-side lanes (split).
const CASCADE_MAX = 4;
const MAX_OFFSET_PCT = 45;

describe("packDay", () => {
  it("empty -> []", () => {
    expect(packDay([])).toEqual([]);
  });

  it("context backdrops must be pre-filtered (never packed with children)", () => {
    // A context spans the whole day; if it reached packDay it would collide
    // with every child and inflate the column count. day-column filters it out
    // (kind !== "context"), so the children pack exactly as if it weren't there.
    const children = [iv(9, 0, 10, 0)];
    expect(packDay(children)[0]).toMatchObject({
      colCount: 1,
      leftPct: 0,
      widthPct: 100,
    });
    // Regression guard: had the 9–17 context been included, colCount would be 2.
    expect(packDay([iv(9, 0, 17, 0), ...children])[1].colCount).toBe(2);
  });

  it("single -> full width, resting z", () => {
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

  // ---- Cascade (small clusters) --------------------------------------------

  it("two overlapping -> cascade: both run to the right edge, later start in front", () => {
    // 9–10 and 9:30–10:30. colCount 2 (<= CASCADE_MAX) -> cascade, step 28%.
    const res = packDay([iv(9, 0, 10, 0), iv(9, 30, 10, 30)]);
    expect(res).toHaveLength(2);
    // Earlier event: column 0, no offset, extends to the edge, sits behind.
    expect(res[0]).toMatchObject({ index: 0, colIndex: 0, colCount: 2, colSpan: 1 });
    expect(res[0].leftPct).toBeCloseTo(0, 10);
    expect(res[0].widthPct).toBeCloseTo(100, 10);
    // Later event: column 1, staggered right, also to the edge, sits in front.
    expect(res[1]).toMatchObject({ index: 1, colIndex: 1, colCount: 2, colSpan: 1 });
    expect(res[1].leftPct).toBeCloseTo(28, 10);
    expect(res[1].widthPct).toBeCloseTo(72, 10);
    // Both reach the right edge; later start layers on top.
    expect(res[0].leftPct + res[0].widthPct).toBeCloseTo(100, 10);
    expect(res[1].leftPct + res[1].widthPct).toBeCloseTo(100, 10);
    expect(res[1].zIndex).toBeGreaterThan(res[0].zIndex);
  });

  it("three mutually overlapping -> cascade staggered, all to the edge", () => {
    const res = packDay([
      iv(9, 0, 12, 0), // earliest -> back
      iv(9, 30, 11, 0),
      iv(10, 0, 11, 30), // latest -> front
    ]);
    expect(res).toHaveLength(3);
    for (const r of res) {
      expect(r.colCount).toBe(3);
      expect(r.colSpan).toBe(1);
      expect(r.leftPct + r.widthPct).toBeCloseTo(100, 10); // every block reaches the edge
    }
    // step = min(28, 45/2) = 22.5
    expect(res[0].leftPct).toBeCloseTo(0, 10);
    expect(res[1].leftPct).toBeCloseTo(22.5, 10);
    expect(res[2].leftPct).toBeCloseTo(45, 10);
    // z-index strictly increases with start time (later in front).
    expect(res[0].zIndex).toBeLessThan(res[1].zIndex);
    expect(res[1].zIndex).toBeLessThan(res[2].zIndex);
  });

  it("cascade caps the total stagger so the front block stays readable", () => {
    // Four mutually overlapping events: colCount 4 = CASCADE_MAX -> still cascade.
    const res = packDay([
      iv(9, 0, 12, 0),
      iv(9, 30, 12, 0),
      iv(10, 0, 12, 0),
      iv(10, 30, 12, 0),
    ]);
    expect(res.every((r) => r.colCount === 4)).toBe(true);
    // step = min(28, 45/3) = 15 -> lefts 0,15,30,45
    expect(res.map((r) => Math.round(r.leftPct))).toEqual([0, 15, 30, 45]);
    // No block is offset past the cap; the front (last) block keeps >= 55% width.
    expect(Math.max(...res.map((r) => r.leftPct))).toBeLessThanOrEqual(MAX_OFFSET_PCT + 1e-9);
    expect(res[3].widthPct).toBeCloseTo(55, 10);
  });

  it("touching back-to-back (10-11, 11-12) -> separate clusters, each full width", () => {
    const res = packDay([iv(10, 0, 11, 0), iv(11, 0, 12, 0)]);
    expect(res).toHaveLength(2);
    for (const r of res) {
      expect(r).toMatchObject({ colIndex: 0, colCount: 1, colSpan: 1 });
      expect(r.leftPct).toBeCloseTo(0, 10);
      expect(r.widthPct).toBeCloseTo(100, 10);
    }
  });

  it("transitive chain A9-10 B9:30-10:30 C10:15-11 -> one cascade cluster", () => {
    // A overlaps B, B overlaps C, but A does NOT overlap C -> C reuses A's column.
    const res = packDay([
      iv(9, 0, 10, 0), // A
      iv(9, 30, 10, 30), // B
      iv(10, 15, 11, 0), // C
    ]);
    expect(res).toHaveLength(3);
    expect(res.every((r) => r.colCount === 2)).toBe(true);
    // A -> col0. B overlaps A -> col1. C does not overlap A -> reuses col0.
    expect(res[0].colIndex).toBe(0);
    expect(res[1].colIndex).toBe(1);
    expect(res[2].colIndex).toBe(0);
    // Cascade: col0 blocks reach the edge (left 0), col1 staggered to left 28.
    expect(res[0].leftPct).toBeCloseTo(0, 10);
    expect(res[2].leftPct).toBeCloseTo(0, 10);
    expect(res[1].leftPct).toBeCloseTo(28, 10);
    // z-index follows start order A < B < C (later in front).
    expect(res[0].zIndex).toBeLessThan(res[1].zIndex);
    expect(res[1].zIndex).toBeLessThan(res[2].zIndex);
  });

  // ---- Split fallback (dense clusters) -------------------------------------

  it("five mutually overlapping -> split into equal lanes (no overlap)", () => {
    const res = packDay([
      iv(9, 0, 11, 0),
      iv(9, 15, 11, 0),
      iv(9, 30, 11, 0),
      iv(9, 45, 11, 0),
      iv(10, 0, 11, 0),
    ]);
    expect(res).toHaveLength(5);
    expect(res.every((r) => r.colCount === 5)).toBe(true);
    for (const r of res) {
      expect(r.colSpan).toBe(1);
      expect(r.widthPct).toBeCloseTo(20, 10); // 100/5
    }
    // Equal side-by-side lanes: 0,20,40,60,80 — no two collide horizontally.
    expect(res.map((r) => Math.round(r.leftPct)).sort((a, b) => a - b)).toEqual([
      0, 20, 40, 60, 80,
    ]);
    assertNoHorizontalCollision(res, [
      iv(9, 0, 11, 0),
      iv(9, 15, 11, 0),
      iv(9, 30, 11, 0),
      iv(9, 45, 11, 0),
      iv(10, 0, 11, 0),
    ]);
  });

  it("dense cluster still expands colSpan into free lanes", () => {
    // Five 9:00–9:15 blocks force a 5-column cluster (split). E is a long spine;
    // F starts after they end and reuses a low lane, expanding right into the
    // now-free higher lanes (colSpan > 1).
    const items = [
      iv(9, 0, 11, 0), // 0: E (long spine)
      iv(9, 0, 9, 15), // 1
      iv(9, 0, 9, 15), // 2
      iv(9, 0, 9, 15), // 3
      iv(9, 0, 9, 15), // 4
      iv(9, 30, 10, 0), // 5: F (after the batch; overlaps only E)
    ];
    const res = packDay(items);
    expect(res.every((r) => r.colCount === 5)).toBe(true);
    // E is the wide spine in col0 but cannot expand (F overlaps it in col1).
    expect(res[0]).toMatchObject({ colIndex: 0, colSpan: 1 });
    expect(res[0].widthPct).toBeCloseTo(20, 10);
    // F reuses col1 and spans the freed cols 2–4 to its right.
    expect(res[5].colIndex).toBe(1);
    expect(res[5].colSpan).toBe(4);
    expect(res[5].leftPct).toBeCloseTo(20, 10);
    expect(res[5].widthPct).toBeCloseTo(80, 10);
    assertNoHorizontalCollision(res, items);
  });

  // ---- Cross-cutting invariants --------------------------------------------

  it("preserves original input order in result mapping", () => {
    const res = packDay([
      iv(11, 0, 12, 0), // 0: later, separate cluster
      iv(9, 0, 10, 0), // 1: earlier, separate cluster
    ]);
    expect(res.map((r) => r.index)).toEqual([0, 1]);
    expect(res[0]).toMatchObject({ colCount: 1, widthPct: 100 });
    expect(res[1]).toMatchObject({ colCount: 1, widthPct: 100 });
  });

  it("disjoint groups pack independently", () => {
    const res = packDay([
      iv(9, 0, 10, 0),
      iv(9, 30, 10, 30),
      iv(13, 0, 14, 0),
      iv(13, 30, 14, 30),
    ]);
    expect(res.every((r) => r.colCount === 2)).toBe(true);
  });

  it("property: time-overlapping items get distinct columns + distinct z-index", () => {
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

      for (let i = 0; i < count; i++) {
        expect(res[i].index).toBe(i);
        // Universal geometry bounds (hold for both cascade and split).
        expect(res[i].widthPct).toBeGreaterThan(0);
        expect(res[i].leftPct).toBeGreaterThanOrEqual(0);
        expect(res[i].leftPct + res[i].widthPct).toBeLessThanOrEqual(100 + 1e-9);
        expect(res[i].colSpan).toBeGreaterThanOrEqual(1);

        for (let j = i + 1; j < count; j++) {
          const timeOverlap =
            items[i].start < items[j].end && items[j].start < items[i].end;
          if (!timeOverlap) continue;
          // Overlapping items share a cluster, occupy distinct columns, and get
          // a distinct z-index so one is unambiguously in front of the other.
          expect(res[i].colCount).toBe(res[j].colCount);
          expect(res[i].colIndex).not.toBe(res[j].colIndex);
          expect(res[i].zIndex).not.toBe(res[j].zIndex);
        }
      }
    }
  });

  it("property: dense clusters (> CASCADE_MAX cols) never collide horizontally", () => {
    let seed = 0x12345678 >>> 0;
    const rand = (): number => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const ri = (max: number): number => Math.floor(rand() * max);

    for (let trial = 0; trial < 1500; trial++) {
      // 6–12 intervals all covering a common instant -> guaranteed dense cluster.
      const count = 6 + ri(7);
      const items: LayoutInterval[] = [];
      for (let k = 0; k < count; k++) {
        const s = ri(6); // 0..5 -> all start by 75 min in
        const e = 8 + ri(8); // 120..240 min -> all still running, all overlap
        items.push({ start: h(0, s * 15), end: h(0, e * 15) });
      }
      const res = packDay(items);
      expect(res.every((r) => r.colCount > CASCADE_MAX)).toBe(true);
      assertNoHorizontalCollision(res, items);
    }
  });
});

// Two blocks visually collide when they overlap in time AND in horizontal range.
// The split path must never produce that; cascade is exempt (it overlaps on purpose).
function assertNoHorizontalCollision(
  res: ReturnType<typeof packDay>,
  items: LayoutInterval[],
): void {
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
}
