/**
 * Insights fixtures, area "stats" (owner: A1): the robust statistics of
 * lib/analytics/stats.ts that momentum builds on. pearson / spearman are not
 * ported in v1 (no v1 surface uses them), so they have no section.
 *
 * ```ts
 * sections: {
 *   median:        { name; input: { values: number[] };                       expected: number }[];
 *   mad:           { name; input: { values: number[] };                       expected: number }[];
 *   robustZ:       { name; input: { value: number; med: number; mad: number }; expected: number | null }[];
 *   theilSenSlope: { name; input: { points: { x: number; y: number }[] };      expected: number | null }[];
 * }
 * ```
 *
 * Seeds: every `it` of test/analytics/stats.test.ts outside the pearson and
 * spearman describes (one case per call). Added: 366 PRNG points (and their
 * values for median / mad), a flat series (slope exactly 0), negative and
 * fractional inputs, and unsorted points with repeated x.
 */
import { mad, median, robustZ, theilSenSlope } from "@/lib/analytics/stats";
import { HOUR, mulberry32, type Case } from "./shared";

export const sections = ["median", "mad", "robustZ", "theilSenSlope"] as const;

type Point = { x: number; y: number };

const medianCase = (name: string, values: number[]): Case => ({ name, input: { values }, expected: median(values) });
const madCase = (name: string, values: number[]): Case => ({ name, input: { values }, expected: mad(values) });
const zCase = (name: string, value: number, med: number, madValue: number): Case => ({
  name,
  input: { value, med, mad: madValue },
  expected: robustZ(value, med, madValue),
});
const slopeCase = (name: string, points: Point[]): Case => ({
  name,
  input: { points },
  expected: theilSenSlope(points),
});

/** 366 daily points: a gentle rise, PRNG noise and a few spikes, integer ms like perDay. */
function prngPoints(): Point[] {
  const rand = mulberry32(366);
  return Array.from({ length: 366 }, (_, i) => {
    const spike = rand() < 0.03 ? 12 * HOUR : 0;
    return { x: i, y: Math.round(2 * HOUR + i * 9_000 + rand() * 4 * HOUR + spike) };
  });
}

export function build(): Record<(typeof sections)[number], Case[]> {
  const prng = prngPoints();
  const prngValues = prng.map((p) => p.y);
  const rand = mulberry32(41);
  const fractional = Array.from({ length: 41 }, () => Math.round(rand() * 1000) / 7);

  const line = Array.from({ length: 6 }, (_, i) => ({ x: i, y: 3 * i - 7 }));
  const outlier = Array.from({ length: 9 }, (_, i) => ({ x: i, y: 2 * i }));
  outlier.push({ x: 9, y: 1000 });

  return {
    median: [
      medianCase("median / returns 0 for an empty array (the suggestions engine's contract)", []),
      medianCase("median / matches the old suggestions median on sorted input (odd and even) (odd)", [1, 2, 3]),
      medianCase("median / matches the old suggestions median on sorted input (odd and even) (even)", [1, 2, 3, 4]),
      medianCase("median / matches the old suggestions median on sorted input (odd and even) (single)", [5]),
      medianCase("median / accepts unsorted input without mutating it", [4, 1, 3, 2]),
      medianCase("366 PRNG values", prngValues),
      medianCase("fractional values", fractional),
      medianCase("negative values, even count", [-3, 7, -11, 2, 0, -0.5]),
      medianCase("duplicates around the middle", [5, 1, 5, 5, 9, 1]),
    ],
    mad: [
      madCase("mad / is the median of absolute deviations from the median", [1, 1, 2, 2, 4, 6, 9]),
      madCase("mad / is 0 for constant or empty data (constant)", [3, 3, 3, 3]),
      madCase("mad / is 0 for constant or empty data (empty)", []),
      madCase("366 PRNG values", prngValues),
      madCase("fractional values", fractional),
      madCase("an even count with a fractional median", [1, 2, 3, 10]),
    ],
    robustZ: [
      zCase("robustZ / scales the deviation by 0.6745 / MAD (above)", 7, 3, 2),
      zCase("robustZ / scales the deviation by 0.6745 / MAD (below)", 1, 3, 2),
      zCase("robustZ / scales the deviation by 0.6745 / MAD (at the median)", 3, 3, 2),
      zCase("robustZ / is null when MAD is 0", 7, 3, 0),
      zCase("hour-scale values", 14 * HOUR, 10 * HOUR, HOUR / 2),
      zCase("fractional MAD", 1.25, 0.5, 0.3),
    ],
    theilSenSlope: [
      slopeCase("theilSenSlope / is null under 3 points or when all x coincide (empty)", []),
      slopeCase("theilSenSlope / is null under 3 points or when all x coincide (two points)", [
        { x: 0, y: 1 },
        { x: 1, y: 2 },
      ]),
      slopeCase("theilSenSlope / is null under 3 points or when all x coincide (same x)", [
        { x: 2, y: 1 },
        { x: 2, y: 5 },
        { x: 2, y: 9 },
      ]),
      slopeCase("theilSenSlope / recovers the exact slope of a line", line),
      slopeCase("theilSenSlope / shrugs off a single wild outlier (unlike least squares)", outlier),
      slopeCase("366 PRNG points", prng),
      slopeCase(
        "a flat series: slope exactly 0",
        Array.from({ length: 8 }, (_, i) => ({ x: i, y: 5 * HOUR })),
      ),
      slopeCase("unsorted x with a repeated x (skipped pairs)", [
        { x: 3, y: 10 },
        { x: 1, y: 4 },
        { x: 3, y: 7 },
        { x: 0, y: 2 },
        { x: 2, y: 9 },
      ]),
      slopeCase("even number of slopes averages the middle pair", [
        { x: 0, y: 0 },
        { x: 1, y: 3 },
        { x: 2, y: 1 },
        { x: 3, y: 7 },
      ]),
    ],
  };
}
