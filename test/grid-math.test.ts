import { describe, it, expect } from "vitest";
import {
  HOUR_PX,
  SLOT_MIN,
  MIN_EVENT_MIN,
  minutesToY,
  yToMinutes,
  snapMinutes,
  msToY,
  durationToHeight,
  snapMsToSlot,
  dayIndexFromX,
} from "@/lib/datetime/grid-math";

describe("grid-math constants", () => {
  it("exposes expected default constants", () => {
    expect(HOUR_PX).toBe(48);
    expect(SLOT_MIN).toBe(15);
    expect(MIN_EVENT_MIN).toBe(15);
  });
});

describe("minutesToY / yToMinutes", () => {
  it("converts minutes to pixels using hourPx/60", () => {
    expect(minutesToY(60)).toBe(48);
    expect(minutesToY(30)).toBe(24);
    expect(minutesToY(0)).toBe(0);
    expect(minutesToY(15)).toBe(12);
  });

  it("converts pixels back to minutes", () => {
    expect(yToMinutes(48)).toBe(60);
    expect(yToMinutes(24)).toBe(30);
    expect(yToMinutes(0)).toBe(0);
  });

  it("round-trips minutesToY -> yToMinutes", () => {
    for (const m of [0, 15, 30, 45, 90, 137, 600, 1440]) {
      expect(yToMinutes(minutesToY(m))).toBeCloseTo(m, 10);
    }
  });

  it("round-trips with a custom hourPx", () => {
    const hp = 64;
    for (const m of [0, 15, 30, 47, 123, 1439]) {
      expect(yToMinutes(minutesToY(m, hp), hp)).toBeCloseTo(m, 10);
    }
  });
});

describe("snapMinutes", () => {
  it("snaps to the nearest 15-minute slot", () => {
    expect(snapMinutes(0)).toBe(0);
    expect(snapMinutes(7)).toBe(0); // 7 rounds down (nearest 0 vs 15)
    expect(snapMinutes(8)).toBe(15); // 8 rounds up
    expect(snapMinutes(22)).toBe(15);
    expect(snapMinutes(23)).toBe(30);
    expect(snapMinutes(37)).toBe(30);
    expect(snapMinutes(38)).toBe(45);
  });

  it("snaps to the nearest 30-minute slot", () => {
    expect(snapMinutes(14, 30)).toBe(0);
    expect(snapMinutes(15, 30)).toBe(30);
    expect(snapMinutes(44, 30)).toBe(30);
    expect(snapMinutes(45, 30)).toBe(60);
  });

  it("rounds exact half-slot up (round-half-up policy)", () => {
    expect(snapMinutes(7.5)).toBe(15);
    expect(snapMinutes(22.5)).toBe(30);
    expect(snapMinutes(15, 30)).toBe(30);
  });

  it("snaps negative minute offsets to the nearest slot", () => {
    // Dragging above the day grid yields negative offsets; nearest-slot must hold.
    expect(snapMinutes(-7)).toBe(0); // -0.467 slots -> rounds to 0
    expect(snapMinutes(-8)).toBe(-15); // -0.533 slots -> rounds to -1 slot
    expect(snapMinutes(-23)).toBe(-30);
    expect(snapMinutes(-15)).toBe(-15);
  });

  it("returns a slot-divisible value for arbitrary inputs", () => {
    for (const m of [3, 9, 21, 100, 137.6, -50.2]) {
      // `+ 0` normalizes the signed-zero that `%` produces for negative multiples.
      expect((snapMinutes(m) % SLOT_MIN) + 0).toBe(0);
    }
  });

  it("normalizes signed zero to +0", () => {
    // Math.round(-0.4) === -0; the snap must not leak negative zero into layout math.
    expect(Object.is(snapMinutes(-7), 0)).toBe(true);
    expect(Object.is(snapMinutes(-1, 30), 0)).toBe(true);
  });
});

describe("msToY", () => {
  it("computes Y from an absolute ms relative to dayStart", () => {
    const dayStart = 1_700_000_000_000;
    // exactly at day start
    expect(msToY(dayStart, dayStart)).toBe(0);
    // one hour later
    expect(msToY(dayStart + 60 * 60000, dayStart)).toBe(48);
    // 90 minutes later
    expect(msToY(dayStart + 90 * 60000, dayStart)).toBe(72);
    // with custom hourPx
    expect(msToY(dayStart + 30 * 60000, dayStart, 100)).toBe(50);
  });
});

describe("durationToHeight", () => {
  it("clamps a 5-minute event up to the minimum height", () => {
    const start = 1_700_000_000_000;
    const end = start + 5 * 60000; // 5 minutes
    const height = durationToHeight(start, end);
    expect(height).toBe(minutesToY(MIN_EVENT_MIN)); // 12
  });

  it("returns the true height for events longer than the minimum", () => {
    const start = 1_700_000_000_000;
    const end = start + 60 * 60000; // 1 hour
    expect(durationToHeight(start, end)).toBe(48);
  });

  it("treats an exactly-min event as the min height", () => {
    const start = 1_700_000_000_000;
    const end = start + MIN_EVENT_MIN * 60000;
    expect(durationToHeight(start, end)).toBe(minutesToY(MIN_EVENT_MIN));
  });

  it("respects custom hourPx and minMin", () => {
    const start = 1_700_000_000_000;
    const end = start + 1 * 60000; // 1 minute
    // minMin = 30, hourPx = 60 -> min height = 30 px
    expect(durationToHeight(start, end, 60, 30)).toBe(30);
  });
});

describe("snapMsToSlot", () => {
  it("rounds ms to the nearest 15-minute slot", () => {
    const slotMs = 15 * 60000;
    const base = 1_700_000_000_000;
    // align base to a slot boundary for predictable math
    const aligned = Math.round(base / slotMs) * slotMs;
    expect(snapMsToSlot(aligned)).toBe(aligned);
    expect(snapMsToSlot(aligned + 7 * 60000)).toBe(aligned); // 7 min -> down
    expect(snapMsToSlot(aligned + 8 * 60000)).toBe(aligned + slotMs); // 8 min -> up
    expect(snapMsToSlot(aligned + 14 * 60000)).toBe(aligned + slotMs);
  });

  it("rounds ms to a custom slot size", () => {
    const slotMs = 30 * 60000;
    const aligned = Math.round(1_700_000_000_000 / slotMs) * slotMs;
    expect(snapMsToSlot(aligned + 14 * 60000, 30)).toBe(aligned);
    expect(snapMsToSlot(aligned + 16 * 60000, 30)).toBe(aligned + slotMs);
  });

  it("always returns a slot-divisible epoch for an arbitrary (unaligned) ms", () => {
    const slotMs = SLOT_MIN * 60000;
    // A deliberately unaligned epoch (not pre-snapped) must still land on a boundary.
    for (const ms of [1_700_000_123_456, 1_699_999_999_999, 1_234_567_890_123]) {
      const snapped = snapMsToSlot(ms);
      expect(snapped % slotMs).toBe(0);
      // Result is the nearest boundary: original is within half a slot of it.
      expect(Math.abs(ms - snapped)).toBeLessThanOrEqual(slotMs / 2);
    }
  });

  it("normalizes signed zero to +0", () => {
    expect(Object.is(snapMsToSlot(-7 * 60000), 0)).toBe(true);
  });
});

describe("dayIndexFromX", () => {
  it("maps the middle of a column to its index", () => {
    // 7 columns, width 700 -> each col 100px
    expect(dayIndexFromX(50, 700, 7)).toBe(0);
    expect(dayIndexFromX(150, 700, 7)).toBe(1);
    expect(dayIndexFromX(350, 700, 7)).toBe(3); // middle column
    expect(dayIndexFromX(650, 700, 7)).toBe(6);
  });

  it("clamps at the left edge", () => {
    expect(dayIndexFromX(-100, 700, 7)).toBe(0);
    expect(dayIndexFromX(0, 700, 7)).toBe(0);
  });

  it("clamps at the right edge", () => {
    expect(dayIndexFromX(700, 700, 7)).toBe(6);
    expect(dayIndexFromX(99999, 700, 7)).toBe(6);
  });

  it("treats column boundaries as half-open [start, end)", () => {
    // colWidth = 100. x in [0,100) -> 0, x in [100,200) -> 1, etc.
    expect(dayIndexFromX(99.999, 700, 7)).toBe(0);
    expect(dayIndexFromX(100, 700, 7)).toBe(1);
    expect(dayIndexFromX(199.999, 700, 7)).toBe(1);
    expect(dayIndexFromX(200, 700, 7)).toBe(2);
  });

  it("always returns column 0 in single-column (day) view", () => {
    expect(dayIndexFromX(0, 300, 1)).toBe(0);
    expect(dayIndexFromX(150, 300, 1)).toBe(0);
    expect(dayIndexFromX(299.999, 300, 1)).toBe(0);
    expect(dayIndexFromX(99999, 300, 1)).toBe(0);
    expect(dayIndexFromX(-5, 300, 1)).toBe(0);
  });

  it("never returns an index outside [0, numCols-1]", () => {
    for (const x of [-1000, -1, 0, 1, 349, 350, 351, 700, 7000]) {
      const idx = dayIndexFromX(x, 700, 7);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThanOrEqual(6);
      expect(Number.isInteger(idx)).toBe(true);
    }
  });

  it("guards against a non-positive column count", () => {
    expect(dayIndexFromX(123, 700, 0)).toBe(0);
    expect(dayIndexFromX(123, 700, -3)).toBe(0);
  });
});
