/**
 * Insights fixtures, area "jsmath" (owner: F0): the JS number semantics the
 * Kotlin port re-implements in `JsMath` instead of using Kotlin's own.
 *
 * ```ts
 * sections: {
 *   round:   { name; input: { x: number };                 expected: number }[];  // Math.round(x)
 *   toFixed: { name; input: { x: number; digits: number }; expected: string }[];  // x.toFixed(digits)
 * }
 * ```
 *
 * Math.round is half toward +∞ (not half-even, not floor(x + 0.5)); toFixed
 * rounds the EXACT binary value half up and prints "-" for negatives that
 * round to zero. JSON cannot carry -0, so the "-0" case arrives as 0.
 */
import { mulberry32, type Case } from "./shared";

export const sections = ["round", "toFixed"] as const;

const ROUND_EDGES: [string, number][] = [
  ["0.5", 0.5],
  ["1.5", 1.5],
  ["2.5", 2.5],
  ["-0.5", -0.5],
  ["-1.5", -1.5],
  ["-2.5", -2.5],
  ["largest double below 0.5", 0.49999999999999994],
  ["1e15 + 0.5", 1e15 + 0.5],
  ["2^52 - 0.5", 4503599627370495.5],
  ["23h DST day in days", 6.958333333333333],
  ["25h DST day in days", 7.041666666666667],
  ["zero", 0],
  ["-0.4", -0.4],
  ["-0.6", -0.6],
  ["integer", 42],
];

const TO_FIXED_EDGES: [number, number][] = [
  [1.005, 2],
  [1.25, 1],
  [1.35, 1],
  [2.45, 1],
  [3.05, 1],
  [0.05, 1],
  [2.25, 1],
  [3.999, 1],
  [0, 1],
  [-0.04, 1],
  [-1.25, 1],
  [-0, 1],
  [-1.005, 2],
  [4, 1],
  [1.5, 0],
  [2.5, 0],
];

export function build(): Record<(typeof sections)[number], Case[]> {
  const round: Case[] = ROUND_EDGES.map(([name, x]) => ({
    name,
    input: { x },
    expected: Math.round(x),
  }));
  const rand = mulberry32(7);
  for (let i = 0; i < 50; i++) {
    // Mixed magnitudes and signs, with a share of exact .5 fractions.
    const base = (rand() - 0.5) * 10 ** Math.floor(rand() * 7);
    const x = rand() < 0.25 ? Math.trunc(base) + 0.5 : base;
    round.push({ name: `prng ${i}`, input: { x }, expected: Math.round(x) });
  }

  const toFixed: Case[] = TO_FIXED_EDGES.map(([x, digits]) => ({
    name: `${Object.is(x, -0) ? "-0" : String(x)} to ${digits}`,
    input: { x, digits },
    expected: x.toFixed(digits),
  }));
  const means = mulberry32(11);
  for (let i = 0; i < 40; i++) {
    // Duration-weighted means on the 1..4 rating scale, as the Patterns tab prints them.
    const x = 1 + means() * 3;
    toFixed.push({ name: `prng mean ${i}`, input: { x, digits: 1 }, expected: x.toFixed(1) });
  }
  return { round, toFixed };
}
