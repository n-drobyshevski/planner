import { describe, it, expect } from "vitest";
import { packDay, type LayoutInterval } from "@/lib/layout/pack-day";

// Helpers: build epoch-ms intervals on an arbitrary day. The packing logic is
// time-zone agnostic (it only compares numbers), so a fixed UTC base is fine.
const DAY = Date.UTC(2026, 4, 31); // 2026-05-31 00:00:00 UTC
const h = (hours: number, minutes = 0): number =>
  DAY + hours * 3_600_000 + minutes * 60_000;
// `mine` sets the owner side (default = mine). In overlay (default) mode columns
// are ordered mine-first; `mine` is ignored in mode "single".
const iv = (
  sh: number,
  sm: number,
  eh: number,
  em: number,
  mine = true,
): LayoutInterval => ({ start: h(sh, sm), end: h(eh, em), mine });

// Mirrors the (unexported) constants in lib/layout/pack-day.ts. An overlapping
// cluster spreads across the FULL width: left edges step by SPREAD_STEP and each
// block's width shrinks so the last column is flush-right, while the spread width
// (100 - SPREAD_STEP*(colCount-1)) stays >= SPREAD_MIN_WIDTH (colCount <= 4);
// denser clusters fall back to equal side-by-side tiles. In overlay (default)
// mode columns are ordered by owner (mine first, partner next).
const SPREAD_STEP = 25;
// spreadW drops below 25 once colCount >= 5 -> tile fallback.
const SPREAD_MAX_COLS = 4;

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

  // ---- Stepped spread across the full width (same-owner clusters) ----------

  it("two overlapping -> 0–75 / 25–100 (75% each), later in front", () => {
    // colCount 2 -> spreadW 75; lefts 0 / 25, last column flush-right.
    const res = packDay([iv(9, 0, 10, 0), iv(9, 30, 10, 30)]);
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({ index: 0, colIndex: 0, colCount: 2, colSpan: 1 });
    expect(res[0].leftPct).toBeCloseTo(0, 10);
    expect(res[0].widthPct).toBeCloseTo(75, 10);
    expect(res[1]).toMatchObject({ index: 1, colIndex: 1, colCount: 2, colSpan: 1 });
    expect(res[1].leftPct).toBeCloseTo(25, 10);
    expect(res[1].widthPct).toBeCloseTo(75, 10);
    expect(res[1].leftPct + res[1].widthPct).toBeCloseTo(100, 10);
    expect(res[1].zIndex).toBeGreaterThan(res[0].zIndex);
  });

  it("three mutually overlapping -> left / center / right at 50% width", () => {
    const res = packDay([
      iv(9, 0, 12, 0), // earliest -> back
      iv(9, 30, 11, 0),
      iv(10, 0, 11, 30), // latest -> front
    ]);
    expect(res).toHaveLength(3);
    expect(res.every((r) => r.colCount === 3 && r.colSpan === 1)).toBe(true);
    expect(res[0].leftPct).toBeCloseTo(0, 10);
    expect(res[1].leftPct).toBeCloseTo(25, 10);
    expect(res[2].leftPct).toBeCloseTo(50, 10);
    expect(res.every((r) => Math.abs(r.widthPct - 50) < 1e-9)).toBe(true);
    expect(res[2].leftPct + res[2].widthPct).toBeCloseTo(100, 10); // flush-right
    expect(res[1].leftPct + res[1].widthPct / 2).toBeCloseTo(50, 10); // centered
    expect(res[0].zIndex).toBeLessThan(res[1].zIndex);
    expect(res[1].zIndex).toBeLessThan(res[2].zIndex);
  });

  it("four mutually overlapping -> four 25% columns, last flush-right", () => {
    const res = packDay([
      iv(9, 0, 12, 0),
      iv(9, 30, 12, 0),
      iv(10, 0, 12, 0),
      iv(10, 30, 12, 0),
    ]);
    expect(res.every((r) => r.colCount === 4)).toBe(true);
    expect(res.map((r) => Math.round(r.leftPct))).toEqual([0, 25, 50, 75]);
    expect(res.every((r) => Math.abs(r.widthPct - 25) < 1e-9)).toBe(true);
    expect(res[3].leftPct + res[3].widthPct).toBeCloseTo(100, 10);
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

  it("transitive chain A9-10 B9:30-10:30 C10:15-11 -> 2-up spread", () => {
    // A overlaps B, B overlaps C, but A does NOT overlap C -> C reuses A's column.
    const res = packDay([
      iv(9, 0, 10, 0), // A
      iv(9, 30, 10, 30), // B
      iv(10, 15, 11, 0), // C
    ]);
    expect(res).toHaveLength(3);
    expect(res.every((r) => r.colCount === 2)).toBe(true);
    expect(res[0].colIndex).toBe(0);
    expect(res[1].colIndex).toBe(1);
    expect(res[2].colIndex).toBe(0);
    // A & C share col0 (left); B is the stepped second column.
    expect(res[0].leftPct).toBeCloseTo(0, 10);
    expect(res[2].leftPct).toBeCloseTo(0, 10);
    expect(res[1].leftPct).toBeCloseTo(SPREAD_STEP, 10); // 25
    expect(res.every((r) => Math.abs(r.widthPct - 75) < 1e-9)).toBe(true);
    expect(res[0].zIndex).toBeLessThan(res[1].zIndex);
    expect(res[1].zIndex).toBeLessThan(res[2].zIndex);
  });

  // ---- Dense tile fallback (colCount >= 5) ---------------------------------

  it("five mutually overlapping -> equal tiles (20% each)", () => {
    const items = [
      iv(9, 0, 11, 0),
      iv(9, 15, 11, 0),
      iv(9, 30, 11, 0),
      iv(9, 45, 11, 0),
      iv(10, 0, 11, 0),
    ];
    const res = packDay(items);
    expect(res).toHaveLength(5);
    expect(res.every((r) => r.colCount === 5)).toBe(true);
    for (const r of res) {
      expect(r.colSpan).toBe(1);
      expect(r.widthPct).toBeCloseTo(20, 10);
    }
    expect(res.map((r) => Math.round(r.leftPct)).sort((a, b) => a - b)).toEqual([
      0, 20, 40, 60, 80,
    ]);
    assertNoHorizontalCollision(res, items);
  });

  it("dense cluster still expands colSpan into free columns", () => {
    // Five 9:00–9:15 blocks force a 5-column tile. E is a long spine; F starts
    // after they end and reuses a low column, expanding right into the now-free
    // higher columns (colSpan > 1).
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

  // ---- Two-calendar overlay: owner-ordered columns -------------------------

  it("two cross-owner overlapping -> 0–75 / 25–100 (mine left, partner right)", () => {
    const res = packDay([iv(9, 0, 10, 0, true), iv(9, 30, 10, 30, false)]);
    expect(res).toHaveLength(2);
    expect(res.every((r) => r.colCount === 2)).toBe(true);
    // Mine: left column, anchored left, 75% wide.
    expect(res[0].colIndex).toBe(0);
    expect(res[0].leftPct).toBeCloseTo(0, 10);
    expect(res[0].widthPct).toBeCloseTo(75, 10);
    // Partner: right column, 75% wide, flush to the right edge.
    expect(res[1].colIndex).toBe(1);
    expect(res[1].leftPct).toBeCloseTo(25, 10);
    expect(res[1].widthPct).toBeCloseTo(75, 10);
    expect(res[1].leftPct + res[1].widthPct).toBeCloseTo(100, 10);
    expect(res[1].zIndex).toBeGreaterThan(res[0].zIndex);
  });

  it("two mine + one partner -> three uniform 50% columns, mine left, partner right", () => {
    const res = packDay([
      iv(9, 0, 11, 0, true), // A (mine)
      iv(9, 15, 11, 0, false), // B (partner)
      iv(9, 30, 11, 0, true), // C (mine)
    ]);
    expect(res.every((r) => r.colCount === 3)).toBe(true);
    // Mine (A, C) take columns 0 and 1; partner (B) is offset to column 2.
    expect(res[0].colIndex).toBe(0); // A
    expect(res[2].colIndex).toBe(1); // C
    expect(res[1].colIndex).toBe(2); // B (partner), right of mine
    // Uniform 50% width — partner no longer wider than mine.
    expect(res.every((r) => Math.abs(r.widthPct - 50) < 1e-9)).toBe(true);
    expect(res[0].leftPct).toBeCloseTo(0, 10); // A
    expect(res[2].leftPct).toBeCloseTo(25, 10); // C
    expect(res[1].leftPct).toBeCloseTo(50, 10); // B, flush-right
    expect(res[1].leftPct + res[1].widthPct).toBeCloseTo(100, 10);
  });

  it("partner-only cluster -> uses the full width (no mine columns to its left)", () => {
    const res = packDay([iv(9, 0, 10, 0, false), iv(9, 30, 10, 30, false)]);
    expect(res).toHaveLength(2);
    expect(res.every((r) => r.colCount === 2)).toBe(true);
    expect(res[0].leftPct).toBeCloseTo(0, 10);
    expect(res[1].leftPct).toBeCloseTo(25, 10);
    expect(res.every((r) => Math.abs(r.widthPct - 75) < 1e-9)).toBe(true);
  });

  // ---- Single-calendar mode (mode: "single") -------------------------------

  it("single mode: matches the same-owner full-width spread (2 events)", () => {
    const items = [iv(9, 0, 11, 0), iv(10, 0, 12, 0)];
    const res = packDay(items, { mode: "single" });
    expect(res.every((r) => r.colCount === 2 && r.colSpan === 1)).toBe(true);
    expect(res[0].leftPct).toBeCloseTo(0, 10);
    expect(res[0].widthPct).toBeCloseTo(75, 10);
    expect(res[1].leftPct).toBeCloseTo(25, 10);
    expect(res[1].widthPct).toBeCloseTo(75, 10);
    expect(res[1].leftPct + res[1].widthPct).toBeCloseTo(100, 10);
  });

  it("single mode: three overlapping -> left / center / right at 50%", () => {
    const items = [iv(9, 0, 12, 0), iv(9, 30, 12, 0), iv(10, 0, 12, 0)];
    const res = packDay(items, { mode: "single" });
    expect(res.every((r) => r.colCount === 3)).toBe(true);
    expect(res.map((r) => r.leftPct)).toEqual([
      expect.closeTo(0, 10),
      expect.closeTo(25, 10),
      expect.closeTo(50, 10),
    ]);
    expect(res.every((r) => Math.abs(r.widthPct - 50) < 1e-9)).toBe(true);
    expect(res[2].leftPct + res[2].widthPct).toBeCloseTo(100, 10);
  });

  it("single mode: five+ overlapping -> equal tiles fallback (20% each)", () => {
    const items = [
      iv(9, 0, 11, 0),
      iv(9, 15, 11, 0),
      iv(9, 30, 11, 0),
      iv(9, 45, 11, 0),
      iv(10, 0, 11, 0),
    ];
    const res = packDay(items, { mode: "single" });
    expect(res.every((r) => r.colCount === 5)).toBe(true);
    expect(res.every((r) => Math.abs(r.widthPct - 20) < 1e-9)).toBe(true);
    assertNoHorizontalCollision(res, items);
  });

  it("single mode: non-overlapping events each keep the full width", () => {
    const res = packDay([iv(9, 0, 10, 0), iv(11, 0, 12, 0)], { mode: "single" });
    for (const r of res) {
      expect(r).toMatchObject({ colIndex: 0, colCount: 1, colSpan: 1 });
      expect(r.leftPct).toBeCloseTo(0, 10);
      expect(r.widthPct).toBeCloseTo(100, 10);
    }
  });

  it("single mode ignores owner; only column ORDER differs from overlay", () => {
    // Two mine events: identical in both modes (mine fills the left columns and,
    // with no partner, those span the full width).
    const items = [iv(9, 0, 11, 0, true), iv(10, 0, 12, 0, true)];
    const single = packDay(items, { mode: "single" });
    const overlay = packDay(items);
    expect(single.map((r) => [r.leftPct, r.widthPct])).toEqual(
      overlay.map((r) => [r.leftPct, r.widthPct]),
    );
    expect(single[0].leftPct).toBeCloseTo(0, 10);
    expect(single[1].leftPct).toBeCloseTo(25, 10);
    expect(single[1].leftPct + single[1].widthPct).toBeCloseTo(100, 10);
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

  it("property: overlapping items get distinct z and distinct columns", () => {
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
        items.push({ start: h(0, s * 15), end: h(0, e * 15), mine: rand() < 0.5 });
      }
      const res = packDay(items);
      expect(res).toHaveLength(count);

      for (let i = 0; i < count; i++) {
        expect(res[i].index).toBe(i);
        // Universal geometry bounds.
        expect(res[i].widthPct).toBeGreaterThan(0);
        expect(res[i].leftPct).toBeGreaterThanOrEqual(0);
        expect(res[i].leftPct + res[i].widthPct).toBeLessThanOrEqual(100 + 1e-9);
        expect(res[i].colSpan).toBeGreaterThanOrEqual(1);

        for (let j = i + 1; j < count; j++) {
          const timeOverlap =
            items[i].start < items[j].end && items[j].start < items[i].end;
          if (!timeOverlap) continue;
          // Overlapping items share a cluster: distinct z (one unambiguously in
          // front) and distinct columns within a shared colCount — owner-ordered
          // columns make even cross-owner overlaps distinct.
          expect(res[i].zIndex).not.toBe(res[j].zIndex);
          expect(res[i].colCount).toBe(res[j].colCount);
          expect(res[i].colIndex).not.toBe(res[j].colIndex);
        }
      }
    }
  });

  it("property: dense clusters (> SPREAD_MAX_COLS) never collide horizontally", () => {
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
      // All same side so they form one column group and tile it.
      const count = 6 + ri(7);
      const items: LayoutInterval[] = [];
      for (let k = 0; k < count; k++) {
        const s = ri(6); // 0..5 -> all start by 75 min in
        const e = 8 + ri(8); // 120..240 min -> all still running, all overlap
        items.push({ start: h(0, s * 15), end: h(0, e * 15) });
      }
      const res = packDay(items);
      expect(res.every((r) => r.colCount > SPREAD_MAX_COLS)).toBe(true);
      assertNoHorizontalCollision(res, items);
    }
  });
});

// Two blocks visually collide when they overlap in time AND in horizontal range.
// The tile (dense) path must never produce that; the spread is exempt (it overlaps
// on purpose, with later blocks layered in front).
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
