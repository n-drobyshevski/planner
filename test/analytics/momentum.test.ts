import { describe, it, expect } from "vitest";
import {
  bucketTrend,
  activeStreak,
  consistency,
  dayAnomalies,
} from "@/lib/analytics/momentum";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Monday 2026-06-01 00:00 UTC. */
const T0 = Date.UTC(2026, 5, 1);

/** Day-long buckets carrying the given ms values. */
const buckets = (values: number[]) =>
  values.map((ms, i) => ({ start: T0 + i * DAY, end: T0 + (i + 1) * DAY, ms }));

/** perDay rows from hour counts (0 = untracked day). */
const perDay = (hours: number[]) =>
  hours.map((h, i) => ({ dayMs: T0 + i * DAY, ms: h * HOUR }));

describe("bucketTrend", () => {
  it("returns nulls under 4 buckets", () => {
    expect(bucketTrend(buckets([1 * HOUR, 2 * HOUR, 3 * HOUR]))).toEqual({
      slopeMsPerBucket: null,
      direction: null,
    });
    expect(bucketTrend([])).toEqual({ slopeMsPerBucket: null, direction: null });
  });

  it("reports a rising series as up with the Theil–Sen slope", () => {
    const t = bucketTrend(buckets([10 * HOUR, 20 * HOUR, 30 * HOUR, 40 * HOUR]));
    expect(t.slopeMsPerBucket).toBe(10 * HOUR);
    expect(t.direction).toBe("up");
  });

  it("reports a falling series as down, even with one outlier bucket", () => {
    // Theil–Sen ignores the single spike that least squares would chase.
    const t = bucketTrend(
      buckets([40 * HOUR, 35 * HOUR, 100 * HOUR, 25 * HOUR, 20 * HOUR]),
    );
    expect(t.direction).toBe("down");
    expect(t.slopeMsPerBucket).toBe(-5 * HOUR);
  });

  it("reads a projected change under 10% of the median bucket as flat", () => {
    // Slope 1/6 h per bucket → projected change 0.5h < 10% of median (10h).
    const t = bucketTrend(buckets([10 * HOUR, 10 * HOUR, 10 * HOUR, 11 * HOUR]));
    expect(t.direction).toBe("flat");
    expect(t.slopeMsPerBucket).toBeCloseTo(HOUR / 6);
  });

  it("treats an all-zero series as flat (zero slope beats the zero threshold)", () => {
    const t = bucketTrend(buckets([0, 0, 0, 0]));
    expect(t).toEqual({ slopeMsPerBucket: 0, direction: "flat" });
  });
});

describe("activeStreak", () => {
  it("counts current back from the last day and tracks the longest run", () => {
    const s = activeStreak(perDay([2, 0, 3, 4, 5, 0, 1, 2]));
    expect(s).toEqual({ current: 2, longest: 3 });
  });

  it("current is 0 when the last day is inactive; runs can coincide", () => {
    expect(activeStreak(perDay([1, 1, 1, 0]))).toEqual({ current: 0, longest: 3 });
    expect(activeStreak(perDay([0, 1, 1, 1]))).toEqual({ current: 3, longest: 3 });
  });

  it("applies the minMsPerDay threshold (default: any tracked ms)", () => {
    const days = perDay([0.5, 2, 0.5]);
    expect(activeStreak(days)).toEqual({ current: 3, longest: 3 });
    expect(activeStreak(days, HOUR)).toEqual({ current: 0, longest: 1 });
  });

  it("is all zeros for an empty array", () => {
    expect(activeStreak([])).toEqual({ current: 0, longest: 0 });
  });
});

describe("consistency", () => {
  it("is null under 7 nonzero days", () => {
    expect(consistency(perDay([4, 4, 4, 4, 4, 4]))).toBeNull();
    expect(consistency(perDay([4, 0, 4, 0, 4, 0, 4, 4, 4]))).toBeNull(); // 6 nonzero
  });

  it("is the share of nonzero days within ±50% of the median nonzero day", () => {
    // Median 4h; band [2h, 6h]. 1h and 9h fall outside → 6/8. Zero days are
    // ignored entirely (absence of data, not inconsistency).
    const days = perDay([4, 0, 1, 4, 5, 9, 3, 4, 0, 6]);
    expect(consistency(days)).toBe(6 / 8);
  });

  it("is 1 for perfectly even days", () => {
    expect(consistency(perDay([4, 4, 4, 4, 4, 4, 4]))).toBe(1);
  });
});

describe("dayAnomalies", () => {
  // 14 base days alternating 9.5h/10.5h → median 10h, MAD 0.5h. A day at
  // 14h scores z = 0.6745·4/0.5 ≈ 5.4; at 7h ≈ −4.0.
  const base = Array.from({ length: 14 }, (_, i) => (i % 2 === 0 ? 9.5 : 10.5));

  it("returns [] under the nonzero-day minimum sample (default 14)", () => {
    const days = perDay([...base.slice(0, 12), 20]); // 13 nonzero
    expect(dayAnomalies(days)).toEqual([]);
    // Zero days don't count toward the sample.
    expect(dayAnomalies(perDay([...base.slice(0, 12), 20, 0, 0]))).toEqual([]);
  });

  it("flags high and low outliers with robust z, sorted by |z| desc", () => {
    const days = perDay([...base, 7, 14]);
    const out = dayAnomalies(days);
    expect(out).toHaveLength(2);
    expect(out[0].ms).toBe(14 * HOUR);
    expect(out[0].direction).toBe("high");
    expect(out[0].z).toBeCloseTo((0.6745 * 4) / 0.5);
    expect(out[1].ms).toBe(7 * HOUR);
    expect(out[1].direction).toBe("low");
    expect(out[1].z).toBeCloseTo((0.6745 * -3) / 0.5);
  });

  it("respects a custom threshold and minSample", () => {
    // 15 values: median 10.5h, MAD 1h → z(14h) ≈ 2.4, under the default 3.
    const days = perDay([...base, 14]);
    expect(dayAnomalies(days)).toEqual([]);
    expect(dayAnomalies(days, { zThreshold: 2 })).toHaveLength(1);
    expect(dayAnomalies(perDay([4, 4, 4, 8]), { minSample: 4, zThreshold: 3 })).toEqual(
      [], // MAD 0 → robustZ null → nothing flagged
    );
  });

  it("returns [] when MAD is 0 and caps the list at 5", () => {
    // Constant 14-day base + extreme spike: MAD stays 0 → no anomalies.
    expect(dayAnomalies(perDay([...Array(14).fill(4), 40]), {})).toEqual([]);

    // 6 qualifying outliers → capped at 5.
    const days = perDay([...base, 14, 14, 14, 7, 7, 7]);
    const out = dayAnomalies(days);
    expect(out).toHaveLength(5);
  });
});
