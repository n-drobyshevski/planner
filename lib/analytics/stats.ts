// Robust statistics primitives shared by lib/analytics/* and the suggestions
// engine. Pure + side-effect-free; plain numbers in, a number (or null when
// the statistic is undefined for the input) out. No domain types on purpose —
// callers translate ms/ratings into number series before calling in.

/** Minimum paired samples before a correlation is reported (else null). */
export const MIN_CORRELATION_PAIRS = 10;

/**
 * Median of `values`. Input order is irrelevant — a copy is sorted internally,
 * so already-sorted input (the suggestions engine's historical contract)
 * yields identical results. 0 for an empty array.
 */
export function median(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median absolute deviation (unscaled — robustZ applies the 0.6745 factor). */
export function mad(values: number[]): number {
  if (values.length === 0) return 0;
  const med = median(values);
  return median(values.map((v) => Math.abs(v - med)));
}

/**
 * Robust z-score 0.6745·(x − median)/MAD (0.6745 ≈ Φ⁻¹(0.75), which makes the
 * scale comparable to a classical z under normality). Null when MAD is 0 —
 * the data is (majority-)constant and every deviation would read as infinite.
 */
export function robustZ(value: number, med: number, madValue: number): number | null {
  if (madValue === 0) return null;
  return (0.6745 * (value - med)) / madValue;
}

/**
 * Pearson correlation of paired samples. Null when there are fewer than
 * MIN_CORRELATION_PAIRS pairs (tiny samples produce noise, not signal) or
 * either side has zero variance (the coefficient is undefined there).
 */
export function pearson(
  pairs: ReadonlyArray<readonly [number, number]>,
): number | null {
  const n = pairs.length;
  if (n < MIN_CORRELATION_PAIRS) return null;
  let sumX = 0;
  let sumY = 0;
  for (const [x, y] of pairs) {
    sumX += x;
    sumY += y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (const [x, y] of pairs) {
    const dx = x - meanX;
    const dy = y - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return null;
  return cov / Math.sqrt(varX * varY);
}

/** 1-based average ranks (ties share the mean of their positions). */
function ranks(values: number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const rank = (i + j) / 2 + 1; // mean of the 1-based positions i+1..j+1
    for (let k = i; k <= j; k++) out[order[k][1]] = rank;
    i = j + 1;
  }
  return out;
}

/**
 * Spearman rank correlation: average-rank transform (ties share their mean
 * rank) followed by pearson, inheriting the same null gates — under
 * MIN_CORRELATION_PAIRS pairs, or zero rank variance (an all-tied side).
 */
export function spearman(
  pairs: ReadonlyArray<readonly [number, number]>,
): number | null {
  if (pairs.length < MIN_CORRELATION_PAIRS) return null;
  const rx = ranks(pairs.map((p) => p[0]));
  const ry = ranks(pairs.map((p) => p[1]));
  return pearson(rx.map((r, i) => [r, ry[i]] as const));
}

/**
 * Theil–Sen slope estimator: the median of all pairwise slopes, robust to
 * outliers (a single wild point cannot drag it). Null when there are fewer
 * than 3 points or all x coincide (no slope is defined).
 */
export function theilSenSlope(
  points: ReadonlyArray<{ x: number; y: number }>,
): number | null {
  if (points.length < 3) return null;
  const slopes: number[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j].x - points[i].x;
      if (dx === 0) continue;
      slopes.push((points[j].y - points[i].y) / dx);
    }
  }
  if (slopes.length === 0) return null;
  return median(slopes);
}
