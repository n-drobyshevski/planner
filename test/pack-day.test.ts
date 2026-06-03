import { describe, it, expect } from "vitest";
import { packDay, type LayoutInterval } from "@/lib/layout/pack-day";

// Helpers: build epoch-ms intervals on an arbitrary day. The packing logic is
// time-zone agnostic (it only compares numbers), so a fixed UTC base is fine.
const DAY = Date.UTC(2026, 4, 31); // 2026-05-31 00:00:00 UTC
const h = (hours: number, minutes = 0): number =>
  DAY + hours * 3_600_000 + minutes * 60_000;
// `mine` selects the owner lane (default = mine/left). Omit it for the legacy
// single-calendar cases (everything lands in the left lane).
const iv = (
  sh: number,
  sm: number,
  eh: number,
  em: number,
  mine = true,
): LayoutInterval => ({ start: h(sh, sm), end: h(eh, em), mine });

// Mirrors the (unexported) constants in lib/layout/pack-day.ts. Overlapping
// clusters split by owner into two lanes, each LANE_WIDTH_PCT of the column
// (mine left at 0%, the other person right at 25%). Within a lane, up to
// CASCADE_MAX columns cascade (staggered by MAX_OFFSET_PCT, relative scale);
// denser lanes fall back to equal side-by-side columns (split).
const CASCADE_MAX = 4;
const MAX_OFFSET_PCT = 45;
const LANE_WIDTH_PCT = 75;
// Relative cascade offsets scaled into the lane.
const lane = (rel: number) => (rel * LANE_WIDTH_PCT) / 100;

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

  // ---- Cascade within a lane (small same-side clusters) --------------------

  it("two overlapping (same side) -> cascade to the LANE edge, later in front", () => {
    // 9–10 and 9:30–10:30, both mine. colCount 2 (<= CASCADE_MAX) -> cascade,
    // relative step 28% scaled into the left 75% lane.
    const res = packDay([iv(9, 0, 10, 0), iv(9, 30, 10, 30)]);
    expect(res).toHaveLength(2);
    // Earlier event: column 0, no offset, extends to the lane edge, sits behind.
    expect(res[0]).toMatchObject({ index: 0, colIndex: 0, colCount: 2, colSpan: 1 });
    expect(res[0].leftPct).toBeCloseTo(0, 10);
    expect(res[0].widthPct).toBeCloseTo(75, 10);
    // Later event: column 1, staggered right, also to the lane edge, in front.
    expect(res[1]).toMatchObject({ index: 1, colIndex: 1, colCount: 2, colSpan: 1 });
    expect(res[1].leftPct).toBeCloseTo(lane(28), 10); // 21
    expect(res[1].widthPct).toBeCloseTo(lane(72), 10); // 54
    // Both reach the lane's right edge (75%); later start layers on top.
    expect(res[0].leftPct + res[0].widthPct).toBeCloseTo(75, 10);
    expect(res[1].leftPct + res[1].widthPct).toBeCloseTo(75, 10);
    expect(res[1].zIndex).toBeGreaterThan(res[0].zIndex);
  });

  it("three mutually overlapping (same side) -> cascade staggered, all to lane edge", () => {
    const res = packDay([
      iv(9, 0, 12, 0), // earliest -> back
      iv(9, 30, 11, 0),
      iv(10, 0, 11, 30), // latest -> front
    ]);
    expect(res).toHaveLength(3);
    for (const r of res) {
      expect(r.colCount).toBe(3);
      expect(r.colSpan).toBe(1);
      expect(r.leftPct + r.widthPct).toBeCloseTo(75, 10); // every block reaches the lane edge
    }
    // relative step = min(28, 45/2) = 22.5 -> scaled lefts 0, 16.875, 33.75
    expect(res[0].leftPct).toBeCloseTo(0, 10);
    expect(res[1].leftPct).toBeCloseTo(lane(22.5), 10);
    expect(res[2].leftPct).toBeCloseTo(lane(45), 10);
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
    // relative step = min(28, 45/3) = 15 -> relative lefts 0,15,30,45 scaled.
    expect(res[0].leftPct).toBeCloseTo(lane(0), 10);
    expect(res[1].leftPct).toBeCloseTo(lane(15), 10);
    expect(res[2].leftPct).toBeCloseTo(lane(30), 10);
    expect(res[3].leftPct).toBeCloseTo(lane(45), 10);
    // No block is offset past the (lane-scaled) cap; the front block keeps the
    // lane's >= 55% width.
    expect(Math.max(...res.map((r) => r.leftPct))).toBeLessThanOrEqual(
      lane(MAX_OFFSET_PCT) + 1e-9,
    );
    expect(res[3].widthPct).toBeCloseTo(lane(55), 10); // 41.25
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

  it("transitive chain A9-10 B9:30-10:30 C10:15-11 -> one cascade cluster (left lane)", () => {
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
    // Cascade: col0 blocks reach the lane edge (left 0), col1 staggered.
    expect(res[0].leftPct).toBeCloseTo(0, 10);
    expect(res[2].leftPct).toBeCloseTo(0, 10);
    expect(res[1].leftPct).toBeCloseTo(lane(28), 10);
    // z-index follows start order A < B < C (later in front).
    expect(res[0].zIndex).toBeLessThan(res[1].zIndex);
    expect(res[1].zIndex).toBeLessThan(res[2].zIndex);
  });

  // ---- Split fallback (dense same-side clusters) ---------------------------

  it("five mutually overlapping (same side) -> split into equal lane columns", () => {
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
      expect(r.widthPct).toBeCloseTo(lane(20), 10); // (100/5) scaled = 15
    }
    // Equal side-by-side columns within the left lane: 0,15,30,45,60.
    expect(res.map((r) => Math.round(r.leftPct)).sort((a, b) => a - b)).toEqual([
      0, 15, 30, 45, 60,
    ]);
    assertNoHorizontalCollision(res, items);
  });

  it("dense cluster still expands colSpan into free lane columns", () => {
    // Five 9:00–9:15 blocks force a 5-column lane (split). E is a long spine;
    // F starts after they end and reuses a low column, expanding right into the
    // now-free higher columns (colSpan > 1).
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
    expect(res[0].widthPct).toBeCloseTo(lane(20), 10);
    // F reuses col1 and spans the freed cols 2–4 to its right.
    expect(res[5].colIndex).toBe(1);
    expect(res[5].colSpan).toBe(4);
    expect(res[5].leftPct).toBeCloseTo(lane(20), 10);
    expect(res[5].widthPct).toBeCloseTo(lane(80), 10);
    assertNoHorizontalCollision(res, items);
  });

  // ---- Owner-anchored lanes (cross-calendar overlaps) ----------------------

  it("two cross-owner overlapping -> opposite 3/4 lanes (mine left, other right)", () => {
    const res = packDay([iv(9, 0, 10, 0, true), iv(9, 30, 10, 30, false)]);
    expect(res).toHaveLength(2);
    // Mine: left lane, anchored at the left border, full 3/4 width.
    expect(res[0]).toMatchObject({ colCount: 1, colSpan: 1 });
    expect(res[0].leftPct).toBeCloseTo(0, 10);
    expect(res[0].widthPct).toBeCloseTo(75, 10);
    // Other: right lane, hugging the right border, full 3/4 width.
    expect(res[1]).toMatchObject({ colCount: 1, colSpan: 1 });
    expect(res[1].leftPct).toBeCloseTo(25, 10);
    expect(res[1].widthPct).toBeCloseTo(75, 10);
    expect(res[1].leftPct + res[1].widthPct).toBeCloseTo(100, 10);
    // Later start sits in front, even across lanes.
    expect(res[1].zIndex).toBeGreaterThan(res[0].zIndex);
  });

  it("all-other overlapping cluster -> right lane only, left 25% gutter empty", () => {
    const res = packDay([iv(9, 0, 10, 0, false), iv(9, 30, 10, 30, false)]);
    expect(res).toHaveLength(2);
    // Cascaded within the right lane (25–100%); nothing in the left gutter.
    expect(res[0].leftPct).toBeCloseTo(25, 10);
    expect(res[0].widthPct).toBeCloseTo(75, 10);
    expect(res[1].leftPct).toBeCloseTo(25 + lane(28), 10); // 46
    expect(res.every((r) => r.leftPct >= 25 - 1e-9)).toBe(true);
  });

  it("mixed 2 mine + 1 other -> mine cascade in left lane, other anchored right", () => {
    const res = packDay([
      iv(9, 0, 11, 0, true), // A (mine)
      iv(9, 15, 11, 0, false), // B (other)
      iv(9, 30, 11, 0, true), // C (mine)
    ]);
    // A & C share the left lane (2 columns); B is alone in the right lane.
    expect(res[0]).toMatchObject({ colCount: 2, colIndex: 0 });
    expect(res[2]).toMatchObject({ colCount: 2, colIndex: 1 });
    expect(res[0].leftPct).toBeCloseTo(0, 10);
    expect(res[2].leftPct).toBeCloseTo(lane(28), 10); // 21
    expect(res[1]).toMatchObject({ colCount: 1 });
    expect(res[1].leftPct).toBeCloseTo(25, 10);
    expect(res[1].widthPct).toBeCloseTo(75, 10);
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

  it("property: overlapping items get distinct z; same-side overlaps get distinct columns", () => {
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
        // Universal geometry bounds (hold for both lanes, cascade and split).
        expect(res[i].widthPct).toBeGreaterThan(0);
        expect(res[i].leftPct).toBeGreaterThanOrEqual(0);
        expect(res[i].leftPct + res[i].widthPct).toBeLessThanOrEqual(100 + 1e-9);
        expect(res[i].colSpan).toBeGreaterThanOrEqual(1);

        for (let j = i + 1; j < count; j++) {
          const timeOverlap =
            items[i].start < items[j].end && items[j].start < items[i].end;
          if (!timeOverlap) continue;
          // Overlapping items get a distinct z-index (cluster-wide) so one is
          // unambiguously in front of the other.
          expect(res[i].zIndex).not.toBe(res[j].zIndex);
          // Columns are per owner-lane: only same-side overlaps are guaranteed
          // distinct columns within a shared colCount. Cross-side overlaps sit
          // in separate lanes and may reuse column indices.
          if (items[i].mine === items[j].mine) {
            expect(res[i].colCount).toBe(res[j].colCount);
            expect(res[i].colIndex).not.toBe(res[j].colIndex);
          }
        }
      }
    }
  });

  it("property: dense same-side clusters (> CASCADE_MAX cols) never collide horizontally", () => {
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
      // All same side (default mine) so they share one lane and tile it.
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
// Within a single lane the split path must never produce that; cascade is exempt
// (it overlaps on purpose), as are cross-lane pairs (the lanes overlap by design).
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
