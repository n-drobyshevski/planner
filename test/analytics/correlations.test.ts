import { describe, it, expect } from "vitest";
import {
  satisfactionByCategory,
  energyLoadPerDay,
  deepWorkShare,
  satisfactionByDaypart,
  MIN_CATEGORY_RATINGS,
  DAYPARTS,
} from "@/lib/analytics/correlations";
import type { Occurrence, TimeWindow } from "@/lib/types";

const HOUR = 3_600_000;
const MIN = 60_000;
const DAY = 24 * HOUR;

// Mon 1 Jun 2026 UTC — mid-year, no DST in UTC; Berlin cases are explicit.
const T0 = Date.UTC(2026, 5, 1);
const UTC = "UTC";
const BERLIN = "Europe/Berlin";

let seq = 0;

function occ(over: Partial<Occurrence> = {}): Occurrence {
  seq += 1;
  return {
    key: `k${seq}`,
    eventId: `e${seq}`,
    occurrenceDate: over.start ?? T0,
    start: T0,
    end: T0 + HOUR,
    allDay: false,
    inactive: false,
    status: "confirmed",
    title: "Event",
    description: null,
    location: null,
    categoryId: null,
    color: null,
    kind: "event",
    ownerId: "m1",
    isPrivate: false,
    isShared: false,
    taskId: null,
    attributes: {},
    isRecurring: false,
    isException: false,
    ...over,
  };
}

const days = (n: number) => Array.from({ length: n }, (_, i) => T0 + i * DAY);
const win = (n: number): TimeWindow => ({ start: T0, end: T0 + n * DAY });

/** A 1h rated occurrence at hour `h` of day `d`. */
const rated = (
  satisfaction: 1 | 2 | 3 | 4 | 5,
  over: Partial<Occurrence> = {},
): Occurrence => occ({ attributes: { satisfaction }, ...over });

describe("satisfactionByCategory", () => {
  it("weights the mean by clipped duration, not by occurrence count", () => {
    // catA: four 1h @4 and one 4h @2 → (4·1·4 + 4·2) / 8h = 3.
    const occs = [
      ...Array.from({ length: 4 }, (_, i) =>
        rated(4, {
          categoryId: "catA",
          start: T0 + i * DAY + 9 * HOUR,
          end: T0 + i * DAY + 10 * HOUR,
        }),
      ),
      rated(2, {
        categoryId: "catA",
        start: T0 + 4 * DAY + 9 * HOUR,
        end: T0 + 4 * DAY + 13 * HOUR,
      }),
    ];
    const rows = satisfactionByCategory(occs, win(7));
    expect(rows).toEqual([
      { categoryId: "catA", agg: { mean: 3, n: 5, ms: 8 * HOUR } },
    ]);
  });

  it("clips the weighting ms to the window", () => {
    // 5 rated occurrences; one extends 2h past the window end → only 1h counts.
    const occs = [
      ...Array.from({ length: 4 }, (_, i) =>
        rated(4, { categoryId: "catA", start: T0 + i * HOUR, end: T0 + (i + 1) * HOUR }),
      ),
      rated(1, { categoryId: "catA", start: T0 + DAY - HOUR, end: T0 + DAY + 2 * HOUR }),
    ];
    const rows = satisfactionByCategory(occs, win(1));
    expect(rows[0].agg.ms).toBe(5 * HOUR);
    expect(rows[0].agg.mean).toBe((4 * 4 + 1) / 5); // 3.4
  });

  it("drops categories under MIN_CATEGORY_RATINGS and unrated/inactive/outside occurrences", () => {
    const fiveOf = (categoryId: string, satisfaction: 1 | 2 | 3 | 4 | 5) =>
      Array.from({ length: MIN_CATEGORY_RATINGS }, (_, i) =>
        rated(satisfaction, {
          categoryId,
          start: T0 + i * DAY + 9 * HOUR,
          end: T0 + i * DAY + 10 * HOUR,
        }),
      );
    const occs = [
      ...fiveOf("catA", 2),
      ...fiveOf("catB", 5),
      // catC: only 4 ratings → gated out.
      ...fiveOf("catC", 5).slice(0, 4),
      // Doesn't help catA reach a higher mean: unrated, inactive, outside.
      occ({ categoryId: "catA" }),
      rated(5, { categoryId: "catA", inactive: true }),
      rated(5, { categoryId: "catA", start: T0 - 2 * HOUR, end: T0 - HOUR }),
    ];
    const rows = satisfactionByCategory(occs, win(7));
    // Sorted by mean descending; catC missing.
    expect(rows.map((r) => r.categoryId)).toEqual(["catB", "catA"]);
    expect(rows[1].agg).toEqual({ mean: 2, n: 5, ms: 5 * HOUR });
  });
});

describe("energyLoadPerDay", () => {
  it("weights rated ms by energy and keeps unrated ms in totalMs only", () => {
    const occs = [
      occ({ attributes: { energy: 3 }, start: T0 + 9 * HOUR, end: T0 + 11 * HOUR }), // 2h ×3
      occ({ attributes: { energy: 1 }, start: T0 + 12 * HOUR, end: T0 + 13 * HOUR }), // 1h ×1
      occ({ start: T0 + 14 * HOUR, end: T0 + 15 * HOUR }), // unrated 1h
    ];
    const rows = energyLoadPerDay(occs, days(2), win(2));
    expect(rows[0]).toEqual({
      dayMs: T0,
      weightedMs: 2 * HOUR * 3 + 1 * HOUR * 1,
      ratedMs: 3 * HOUR,
      totalMs: 4 * HOUR,
    });
    expect(rows[1]).toEqual({ dayMs: T0 + DAY, weightedMs: 0, ratedMs: 0, totalMs: 0 });
  });

  it("splits multi-day occurrences across day boundaries like computeUsage", () => {
    // 23:00 → 02:00 next day, energy 2: 1h on day 0, 2h on day 1.
    const occs = [
      occ({ attributes: { energy: 2 }, start: T0 + 23 * HOUR, end: T0 + DAY + 2 * HOUR }),
    ];
    const rows = energyLoadPerDay(occs, days(2), win(2));
    expect(rows[0].weightedMs).toBe(1 * HOUR * 2);
    expect(rows[1].weightedMs).toBe(2 * HOUR * 2);
    expect(rows[0].totalMs + rows[1].totalMs).toBe(3 * HOUR);
  });

  it("excludes inactive occurrences entirely", () => {
    const occs = [
      occ({ attributes: { energy: 3 }, inactive: true, start: T0, end: T0 + 8 * HOUR }),
    ];
    const rows = energyLoadPerDay(occs, days(1), win(1));
    expect(rows[0]).toEqual({ dayMs: T0, weightedMs: 0, ratedMs: 0, totalMs: 0 });
  });
});

describe("deepWorkShare", () => {
  it("splits clipped ms into deep / shallow / unrated and computes the share", () => {
    const occs = [
      occ({ attributes: { focus: "deep" }, start: T0 + 9 * HOUR, end: T0 + 12 * HOUR }),
      occ({ attributes: { focus: "shallow" }, start: T0 + 13 * HOUR, end: T0 + 14 * HOUR }),
      occ({ start: T0 + 15 * HOUR, end: T0 + 17 * HOUR }),
      // Deep but inactive → ignored.
      occ({ attributes: { focus: "deep" }, inactive: true, start: T0, end: T0 + 5 * HOUR }),
    ];
    expect(deepWorkShare(occs, win(1))).toEqual({
      deepMs: 3 * HOUR,
      shallowMs: 1 * HOUR,
      unratedMs: 2 * HOUR,
      share: 0.75,
    });
  });

  it("returns a null share when no ms is focus-rated", () => {
    const occs = [occ({ start: T0 + 9 * HOUR, end: T0 + 10 * HOUR })];
    expect(deepWorkShare(occs, win(1)).share).toBeNull();
    expect(deepWorkShare([], win(1)).share).toBeNull();
  });
});

describe("satisfactionByDaypart", () => {
  const byPart = (rows: ReturnType<typeof satisfactionByDaypart>) =>
    Object.fromEntries(rows.map((r) => [r.daypart, r.agg]));

  it("always returns all 4 dayparts in display order, n possibly 0", () => {
    const rows = satisfactionByDaypart([], win(1), UTC);
    expect(rows.map((r) => r.daypart)).toEqual(DAYPARTS);
    for (const r of rows) expect(r.agg).toEqual({ mean: 0, n: 0, ms: 0 });
  });

  it("attributes rated ms to dayparts by overlap, counting n once per touched part", () => {
    // 11:00–13:00 @5 → 1h morning + 1h midday; 21:00–23:00 @3 → 1h evening + 1h night.
    const occs = [
      rated(5, { start: T0 + 11 * HOUR, end: T0 + 13 * HOUR }),
      rated(3, { start: T0 + 21 * HOUR, end: T0 + 23 * HOUR }),
    ];
    const agg = byPart(satisfactionByDaypart(occs, win(1), UTC));
    expect(agg.morning).toEqual({ mean: 5, n: 1, ms: HOUR });
    expect(agg.midday).toEqual({ mean: 5, n: 1, ms: HOUR });
    expect(agg.evening).toEqual({ mean: 3, n: 1, ms: HOUR });
    expect(agg.night).toEqual({ mean: 3, n: 1, ms: HOUR });
  });

  it("duration-weights the mean within a daypart and clips to the window", () => {
    // Morning: 3h @2 plus 1h @5 → (3·2 + 1·5)/4 = 2.75. The @5 block starts
    // before the window; only its in-window hour counts.
    const occs = [
      rated(2, { start: T0 + 6 * HOUR, end: T0 + 9 * HOUR }),
      rated(5, { start: T0 - HOUR, end: T0 + 6 * HOUR }),
    ];
    // Window starts at 05:00 so the @5 block clips to 05:00–06:00 (morning).
    const window: TimeWindow = { start: T0 + 5 * HOUR, end: T0 + DAY };
    const agg = byPart(satisfactionByDaypart(occs, window, UTC));
    expect(agg.morning).toEqual({ mean: 2.75, n: 2, ms: 4 * HOUR });
    expect(agg.night.ms).toBe(0);
  });

  it("ignores inactive and unrated occurrences", () => {
    const occs = [
      rated(5, { inactive: true, start: T0 + 9 * HOUR, end: T0 + 10 * HOUR }),
      occ({ start: T0 + 9 * HOUR, end: T0 + 10 * HOUR }),
    ];
    const agg = byPart(satisfactionByDaypart(occs, win(1), UTC));
    expect(agg.morning).toEqual({ mean: 0, n: 0, ms: 0 });
  });

  it("uses local hours across the Berlin spring-forward (skipped hour gets nothing)", () => {
    // Sun 29 Mar 2026, 02:00 CET → 03:00 CEST (01:00Z). Absolute 00:30Z–03:30Z
    // is local 01:30–05:30 minus the skipped hour: 2.5h night (1:xx, 3:xx,
    // 4:xx) + 0.5h morning (5:00–5:30) = 3h real time.
    const window: TimeWindow = {
      start: Date.UTC(2026, 2, 28, 23), // Sun 00:00 CET
      end: Date.UTC(2026, 2, 29, 22), // Mon 00:00 CEST
    };
    const occs = [
      rated(4, { start: Date.UTC(2026, 2, 29, 0, 30), end: Date.UTC(2026, 2, 29, 3, 30) }),
    ];
    const agg = byPart(satisfactionByDaypart(occs, window, BERLIN));
    expect(agg.night).toEqual({ mean: 4, n: 1, ms: 2.5 * HOUR });
    expect(agg.morning).toEqual({ mean: 4, n: 1, ms: 30 * MIN });
    expect(agg.midday.ms).toBe(0);
  });
});
