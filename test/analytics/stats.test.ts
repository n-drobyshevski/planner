import { describe, it, expect } from "vitest";
import {
  median,
  mad,
  robustZ,
  pearson,
  spearman,
  theilSenSlope,
  MIN_CORRELATION_PAIRS,
} from "@/lib/analytics/stats";

describe("median", () => {
  it("returns 0 for an empty array (the suggestions engine's contract)", () => {
    expect(median([])).toBe(0);
  });

  it("matches the old suggestions median on sorted input (odd and even)", () => {
    // The replaced helper required sortedAsc; same values, same results.
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([5])).toBe(5);
  });

  it("accepts unsorted input without mutating it", () => {
    const values = [4, 1, 3, 2];
    expect(median(values)).toBe(2.5);
    expect(values).toEqual([4, 1, 3, 2]); // sorts a copy
  });
});

describe("mad", () => {
  it("is the median of absolute deviations from the median", () => {
    // median 2; |dev| = [1, 1, 0, 0, 2, 4, 7] → median 1.
    expect(mad([1, 1, 2, 2, 4, 6, 9])).toBe(1);
  });

  it("is 0 for constant or empty data", () => {
    expect(mad([3, 3, 3, 3])).toBe(0);
    expect(mad([])).toBe(0);
  });
});

describe("robustZ", () => {
  it("scales the deviation by 0.6745 / MAD", () => {
    expect(robustZ(7, 3, 2)).toBeCloseTo((0.6745 * 4) / 2);
    expect(robustZ(1, 3, 2)).toBeCloseTo((0.6745 * -2) / 2);
    expect(robustZ(3, 3, 2)).toBe(0);
  });

  it("is null when MAD is 0", () => {
    expect(robustZ(7, 3, 0)).toBeNull();
  });
});

/** n points along y = a·x + b (x = 1..n). */
const line = (n: number, a: number, b = 0): (readonly [number, number])[] =>
  Array.from({ length: n }, (_, i) => [i + 1, a * (i + 1) + b] as const);

describe("pearson", () => {
  it("is null under MIN_CORRELATION_PAIRS pairs", () => {
    expect(pearson(line(MIN_CORRELATION_PAIRS - 1, 1))).toBeNull();
    expect(pearson([])).toBeNull();
  });

  it("is null when either side has zero variance", () => {
    const flatY = Array.from({ length: 10 }, (_, i) => [i, 5] as const);
    const flatX = Array.from({ length: 10 }, (_, i) => [5, i] as const);
    expect(pearson(flatY)).toBeNull();
    expect(pearson(flatX)).toBeNull();
  });

  it("returns 1 for a perfect positive and -1 for a perfect inverse relation", () => {
    expect(pearson(line(10, 2, 3))).toBeCloseTo(1);
    expect(pearson(line(10, -2, 100))).toBeCloseTo(-1);
  });

  it("is near 0 for an uncorrelated symmetric pattern", () => {
    // y is a symmetric tent over x — covariance cancels exactly.
    const tent = Array.from(
      { length: 10 },
      (_, i) => [i, Math.abs(i - 4.5)] as const,
    );
    expect(pearson(tent)).toBeCloseTo(0);
  });
});

describe("spearman", () => {
  it("is null under MIN_CORRELATION_PAIRS pairs and for an all-tied side", () => {
    expect(spearman(line(9, 1))).toBeNull();
    const allTied = Array.from({ length: 10 }, (_, i) => [3, i] as const);
    expect(spearman(allTied)).toBeNull(); // zero rank variance
  });

  it("returns 1 for any monotone relation, even a nonlinear one", () => {
    const cubic = Array.from({ length: 10 }, (_, i) => [i, (i - 3) ** 3] as const);
    expect(spearman(cubic)).toBeCloseTo(1);
    const inverse = Array.from({ length: 10 }, (_, i) => [i, -(i ** 2)] as const);
    expect(spearman(inverse)).toBeCloseTo(-1);
  });

  it("averages ranks for ties", () => {
    // x = 1,1,2,2,3,3,4,4,5,5 → ranks 1.5,1.5,3.5,… vs y ranks 1..10.
    const pairs = Array.from(
      { length: 10 },
      (_, i) => [Math.floor(i / 2) + 1, i + 1] as const,
    );
    // Hand-computed pearson over the rank vectors: 80 / √(80 × 82.5).
    expect(spearman(pairs)).toBeCloseTo(80 / Math.sqrt(80 * 82.5));
  });
});

describe("theilSenSlope", () => {
  it("is null under 3 points or when all x coincide", () => {
    expect(theilSenSlope([])).toBeNull();
    expect(
      theilSenSlope([
        { x: 0, y: 1 },
        { x: 1, y: 2 },
      ]),
    ).toBeNull();
    expect(
      theilSenSlope([
        { x: 2, y: 1 },
        { x: 2, y: 5 },
        { x: 2, y: 9 },
      ]),
    ).toBeNull();
  });

  it("recovers the exact slope of a line", () => {
    const points = Array.from({ length: 6 }, (_, i) => ({ x: i, y: 3 * i - 7 }));
    expect(theilSenSlope(points)).toBe(3);
  });

  it("shrugs off a single wild outlier (unlike least squares)", () => {
    const points = Array.from({ length: 9 }, (_, i) => ({ x: i, y: 2 * i }));
    points.push({ x: 9, y: 1000 });
    // 36 of 45 pairwise slopes are exactly 2 — the median stays 2.
    expect(theilSenSlope(points)).toBe(2);
  });
});
