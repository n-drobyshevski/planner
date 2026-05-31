import { describe, it, expect } from "vitest";
import { splitIntoBlocks, backToBack } from "@/lib/tasks/schedule";

const MIN = 60_000;

describe("splitIntoBlocks", () => {
  it("splits a 2h task into 4 contiguous 30-min blocks", () => {
    const segs = splitIntoBlocks(0, 120, 4);
    expect(segs).toEqual([
      { start: 0, end: 30 * MIN },
      { start: 30 * MIN, end: 60 * MIN },
      { start: 60 * MIN, end: 90 * MIN },
      { start: 90 * MIN, end: 120 * MIN },
    ]);
  });

  it("tiles the whole range with no gaps or overlaps", () => {
    const start = 1_700_000_000_000;
    const segs = splitIntoBlocks(start, 90, 3);
    expect(segs[0].start).toBe(start);
    expect(segs[segs.length - 1].end).toBe(start + 90 * MIN);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].start).toBe(segs[i - 1].end);
    }
  });

  it("count of 1 is a single block of the full duration", () => {
    expect(splitIntoBlocks(0, 60, 1)).toEqual([{ start: 0, end: 60 * MIN }]);
  });

  it("returns nothing for non-positive count or duration", () => {
    expect(splitIntoBlocks(0, 60, 0)).toEqual([]);
    expect(splitIntoBlocks(0, 0, 3)).toEqual([]);
  });
});

describe("backToBack", () => {
  it("lays blocks end-to-end from the start", () => {
    expect(backToBack(1000, [30, 60, 15])).toEqual([
      { start: 1000, end: 1000 + 30 * MIN },
      { start: 1000 + 30 * MIN, end: 1000 + 90 * MIN },
      { start: 1000 + 90 * MIN, end: 1000 + 105 * MIN },
    ]);
  });

  it("skips non-positive durations", () => {
    expect(backToBack(0, [0, 30, -5, 15])).toEqual([
      { start: 0, end: 30 * MIN },
      { start: 30 * MIN, end: 45 * MIN },
    ]);
  });

  it("returns nothing for an empty list", () => {
    expect(backToBack(0, [])).toEqual([]);
  });
});
