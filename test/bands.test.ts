import { describe, it, expect } from "vitest";
import { mergeRanges } from "@/lib/calendar/bands";

describe("mergeRanges", () => {
  it("returns an empty list for no ranges", () => {
    expect(mergeRanges([])).toEqual([]);
  });

  it("drops zero-length and inverted ranges", () => {
    expect(
      mergeRanges([
        { start: 100, end: 100 },
        { start: 300, end: 200 },
      ]),
    ).toEqual([]);
  });

  it("keeps disjoint ranges separate and sorted", () => {
    expect(
      mergeRanges([
        { start: 500, end: 600 },
        { start: 100, end: 200 },
      ]),
    ).toEqual([
      { start: 100, end: 200 },
      { start: 500, end: 600 },
    ]);
  });

  it("merges overlapping ranges into one", () => {
    expect(
      mergeRanges([
        { start: 100, end: 300 },
        { start: 200, end: 500 },
      ]),
    ).toEqual([{ start: 100, end: 500 }]);
  });

  it("merges touching ranges (end === next.start) so abutting blocks read as one band", () => {
    expect(
      mergeRanges([
        { start: 100, end: 200 },
        { start: 200, end: 300 },
      ]),
    ).toEqual([{ start: 100, end: 300 }]);
  });

  it("absorbs a fully-contained range", () => {
    expect(
      mergeRanges([
        { start: 100, end: 900 },
        { start: 300, end: 400 },
      ]),
    ).toEqual([{ start: 100, end: 900 }]);
  });

  it("does not mutate the input", () => {
    const input = [
      { start: 200, end: 400 },
      { start: 100, end: 250 },
    ];
    const snapshot = JSON.parse(JSON.stringify(input));
    mergeRanges(input);
    expect(input).toEqual(snapshot);
  });
});
