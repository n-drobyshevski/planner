import { describe, it, expect } from "vitest";
import {
  resolvePeriod,
  granularityChoices,
  defaultGranularity,
  parseRangeParam,
  parseGranularityParam,
  parseTabParam,
  parsePeriodSearch,
  periodToSearch,
  MAX_CUSTOM_DAYS,
  type PeriodState,
} from "@/lib/insights/period";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// All boundary expectations are computed in an explicit fixed zone so the
// suite is machine-independent. Berlin observes DST (CET/CEST), which the DST
// cases below rely on; UTC is used where plain arithmetic should hold.
const BERLIN = "Europe/Berlin";
const UTC = "UTC";

/** Epoch ms of a wall-clock instant in a zone (via Date.UTC minus the offset
 *  is error-prone — instead express instants as UTC and only assert relations). */
const utc = (y: number, mo: number, d: number, h = 0, mi = 0) =>
  Date.UTC(y, mo, d, h, mi);

function state(over: Partial<PeriodState> = {}): PeriodState {
  return { preset: "this-week", granularity: "day", ...over };
}

describe("resolvePeriod — calendar presets (UTC)", () => {
  // Wed 10 Jun 2026, 12:00 UTC. Weeks start Monday.
  const now = utc(2026, 5, 10, 12);

  it("this-week spans Mon–Sun and compares to last week", () => {
    const p = resolvePeriod(state(), { timeZone: UTC, now });
    expect(p.window.start).toBe(utc(2026, 5, 8)); // Mon 8 Jun
    expect(p.window.end).toBe(utc(2026, 5, 15)); // Mon 15 Jun (exclusive)
    expect(p.days).toHaveLength(7);
    expect(p.days[0]).toBe(utc(2026, 5, 8));
    expect(p.prevWindow).toEqual({ start: utc(2026, 5, 1), end: utc(2026, 5, 8) });
    expect(p.prevDays).toHaveLength(7);
    expect(p.label).toMatch(/^This week · 8 – 14 Jun 2026$/);
    expect(p.clamped).toBe(false);
  });

  it("last-week is the week before, comparing to the one before that", () => {
    const p = resolvePeriod(state({ preset: "last-week" }), { timeZone: UTC, now });
    expect(p.window).toEqual({ start: utc(2026, 5, 1), end: utc(2026, 5, 8) });
    expect(p.prevWindow).toEqual({ start: utc(2026, 4, 25), end: utc(2026, 5, 1) });
  });

  it("this-month spans the calendar month and compares to the previous month", () => {
    const p = resolvePeriod(state({ preset: "this-month" }), { timeZone: UTC, now });
    expect(p.window).toEqual({ start: utc(2026, 5, 1), end: utc(2026, 6, 1) });
    expect(p.days).toHaveLength(30);
    // Previous month has a different length (May = 31 days) — calendar-unit compare.
    expect(p.prevWindow).toEqual({ start: utc(2026, 4, 1), end: utc(2026, 5, 1) });
    expect(p.prevDays).toHaveLength(31);
  });

  it("last-30d rolls back from the end of today and compares to the prior 30", () => {
    const p = resolvePeriod(state({ preset: "last-30d" }), { timeZone: UTC, now });
    expect(p.window.end).toBe(utc(2026, 5, 11)); // tomorrow midnight (today inclusive)
    expect(p.window.start).toBe(utc(2026, 4, 12));
    expect(p.days).toHaveLength(30);
    expect(p.prevWindow).toEqual({ start: utc(2026, 3, 12), end: utc(2026, 4, 12) });
  });
});

describe("resolvePeriod — custom ranges", () => {
  const now = utc(2026, 5, 10, 12);

  it("treats from/to as inclusive days (any ms within them)", () => {
    const p = resolvePeriod(
      state({
        preset: "custom",
        customFrom: utc(2026, 5, 1, 15), // 3pm on 1 Jun
        customTo: utc(2026, 5, 3, 9), // 9am on 3 Jun
        granularity: "day",
      }),
      { timeZone: UTC, now },
    );
    expect(p.window).toEqual({ start: utc(2026, 5, 1), end: utc(2026, 5, 4) });
    expect(p.days).toHaveLength(3);
    expect(p.prevWindow).toEqual({ start: utc(2026, 4, 29), end: utc(2026, 5, 1) });
  });

  it("swaps reversed bounds", () => {
    const p = resolvePeriod(
      state({
        preset: "custom",
        customFrom: utc(2026, 5, 3),
        customTo: utc(2026, 5, 1),
      }),
      { timeZone: UTC, now },
    );
    expect(p.window).toEqual({ start: utc(2026, 5, 1), end: utc(2026, 5, 4) });
  });

  it("clamps over-long ranges to the most recent MAX_CUSTOM_DAYS days", () => {
    const p = resolvePeriod(
      state({
        preset: "custom",
        customFrom: utc(2024, 0, 1),
        customTo: utc(2026, 5, 1),
      }),
      { timeZone: UTC, now },
    );
    expect(p.clamped).toBe(true);
    expect(p.window.end).toBe(utc(2026, 5, 2));
    expect(p.days).toHaveLength(MAX_CUSTOM_DAYS);
  });

  it("falls back to this-week when the custom range is missing", () => {
    const p = resolvePeriod(state({ preset: "custom" }), { timeZone: UTC, now });
    expect(p.window).toEqual({ start: utc(2026, 5, 8), end: utc(2026, 5, 15) });
  });
});

describe("resolvePeriod — DST (Europe/Berlin)", () => {
  it("spring-forward week has a 23-hour day yet 7 day entries", () => {
    // DST starts Sun 29 Mar 2026 in Berlin (02:00 → 03:00). Week Mon 23 – Sun 29.
    const now = Date.UTC(2026, 2, 25, 12); // Wed 25 Mar
    const p = resolvePeriod(state(), { timeZone: BERLIN, now });
    expect(p.days).toHaveLength(7);
    // The last day (Sun 29) is 23 hours long; the window still ends on Mon 00:00.
    const sunday = p.days[6];
    expect(p.window.end - sunday).toBe(23 * HOUR);
    // Total window: 6×24h + 23h.
    expect(p.window.end - p.window.start).toBe(6 * DAY + 23 * HOUR);
    // Day buckets tile the window exactly.
    expect(p.buckets[0].start).toBe(p.window.start);
    expect(p.buckets.at(-1)!.end).toBe(p.window.end);
  });

  it("month buckets across DST land on local month starts", () => {
    // Custom range Mar 1 – May 31 2026 (DST starts 29 Mar), month granularity.
    const now = Date.UTC(2026, 5, 10, 12);
    const p = resolvePeriod(
      state({
        preset: "custom",
        customFrom: Date.UTC(2026, 2, 1, 12),
        customTo: Date.UTC(2026, 4, 31, 12),
        granularity: "month",
      }),
      { timeZone: BERLIN, now },
    );
    expect(p.granularity).toBe("month");
    expect(p.buckets).toHaveLength(3);
    // Buckets tile the window with no gaps.
    expect(p.buckets[0].start).toBe(p.window.start);
    for (let i = 1; i < p.buckets.length; i++) {
      expect(p.buckets[i].start).toBe(p.buckets[i - 1].end);
    }
    expect(p.buckets.at(-1)!.end).toBe(p.window.end);
    // March is 31 days minus the lost DST hour.
    expect(p.buckets[0].end - p.buckets[0].start).toBe(31 * DAY - HOUR);
  });
});

describe("buckets — week granularity", () => {
  it("clips edge buckets to the window and aligns interior ones to Mondays", () => {
    const now = utc(2026, 5, 10, 12);
    // Wed 13 May – Tue 9 Jun (28 days), week buckets.
    const p = resolvePeriod(
      state({
        preset: "custom",
        customFrom: utc(2026, 4, 13),
        customTo: utc(2026, 5, 9),
        granularity: "week",
      }),
      { timeZone: UTC, now },
    );
    expect(p.granularity).toBe("week");
    // First bucket: Wed 13 → Mon 18 (clipped); then full weeks; last clipped.
    expect(p.buckets[0]).toEqual({ start: utc(2026, 4, 13), end: utc(2026, 4, 18) });
    expect(p.buckets[1]).toEqual({ start: utc(2026, 4, 18), end: utc(2026, 4, 25) });
    expect(p.buckets.at(-1)!.end).toBe(p.window.end);
    // Tiling: each bucket starts where the previous ended.
    for (let i = 1; i < p.buckets.length; i++) {
      expect(p.buckets[i].start).toBe(p.buckets[i - 1].end);
    }
  });
});

describe("granularity rules", () => {
  const day = (n: number) => ({ start: 0, end: n * DAY });

  it("offers day ≤ 35d, week ≥ 14d, month ≥ 60d", () => {
    expect(granularityChoices(day(7))).toEqual(["day"]);
    expect(granularityChoices(day(14))).toEqual(["day", "week"]);
    expect(granularityChoices(day(30))).toEqual(["day", "week"]);
    expect(granularityChoices(day(90))).toEqual(["week", "month"]);
    expect(granularityChoices(day(366))).toEqual(["week", "month"]);
  });

  it("falls back to the preset default when the requested one isn't allowed", () => {
    const now = utc(2026, 5, 10, 12);
    // 90 days with granularity "day" (not allowed) → preset default "week".
    const p = resolvePeriod(state({ preset: "last-90d", granularity: "day" }), {
      timeZone: UTC,
      now,
    });
    expect(p.granularity).toBe("week");
  });

  it("defaults custom ranges by length", () => {
    expect(defaultGranularity("custom", day(20))).toBe("day");
    expect(defaultGranularity("custom", day(120))).toBe("week");
    expect(defaultGranularity("custom", day(300))).toBe("month");
    expect(defaultGranularity("this-week", day(7))).toBe("day");
    expect(defaultGranularity("last-90d", day(90))).toBe("week");
  });
});

describe("URL codec", () => {
  it("parses range tokens with a this-week default", () => {
    expect(parseRangeParam("this-week")).toBe("this-week");
    expect(parseRangeParam("30d")).toBe("last-30d");
    expect(parseRangeParam("90d")).toBe("last-90d");
    expect(parseRangeParam("bogus")).toBe("this-week");
    expect(parseRangeParam(undefined)).toBe("this-week");
  });

  it("parses granularity and tab leniently", () => {
    expect(parseGranularityParam("week")).toBe("week");
    expect(parseGranularityParam("bogus")).toBeNull();
    expect(parseTabParam("patterns")).toBe("patterns");
    expect(parseTabParam("optimize")).toBe("optimize");
    expect(parseTabParam(undefined)).toBe("overview");
    expect(parseTabParam("bogus")).toBe("overview");
  });

  it("degrades custom without from/to to this-week", () => {
    const s = parsePeriodSearch({ range: "custom" });
    expect(s.preset).toBe("this-week");
  });

  it("parses a custom range into machine-local day seeds", () => {
    // parseDateParam yields a coarse machine-local midnight; resolvePeriod
    // re-normalizes it to the viewer zone, so only presence is asserted here
    // (exact ms is machine-dependent by design — same as the calendar param).
    const s = parsePeriodSearch({
      range: "custom",
      from: "2026-06-01",
      to: "2026-06-07",
      granularity: "day",
    });
    expect(s.preset).toBe("custom");
    expect(s.customFrom).toBeTypeOf("number");
    expect(s.customTo).toBeTypeOf("number");
    expect(s.customFrom!).toBeLessThan(s.customTo!);
  });

  it("encodes a custom range with day labels in the given zone", () => {
    const search = periodToSearch(
      state({
        preset: "custom",
        customFrom: utc(2026, 5, 1, 12), // any ms within the day works
        customTo: utc(2026, 5, 7, 12),
      }),
      "trends",
      UTC,
    );
    expect(search).toContain("range=custom");
    expect(search).toContain("from=2026-06-01");
    expect(search).toContain("to=2026-06-07");
    expect(search).toContain("tab=trends");
  });

  it("omits the default overview tab from the query", () => {
    expect(periodToSearch(state(), "overview", UTC)).toBe(
      "?range=this-week&granularity=day",
    );
  });
});
