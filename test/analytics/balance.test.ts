import { describe, it, expect } from "vitest";
import { categoryShares, categoryByBucket, memberByBucket } from "@/lib/analytics/balance";
import { OTHER_SERIES } from "@/lib/analytics/trends";
import type { Bucket } from "@/lib/insights/period";
import type { Occurrence, TimeWindow } from "@/lib/types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 5, 1); // Mon 1 Jun 2026 UTC

function occ(over: Partial<Occurrence>): Occurrence {
  return {
    key: "e:0",
    eventId: "e",
    occurrenceDate: 0,
    start: T0 + 9 * HOUR,
    end: T0 + 10 * HOUR,
    allDay: false,
    inactive: false,
    status: "confirmed",
    title: "t",
    description: null,
    location: null,
    categoryId: null,
    color: null,
    kind: "event",
    ownerId: "me",
    isPrivate: false,
    isShared: false,
    hiddenFromPublic: false,
    taskId: null,
    attributes: {},
    isRecurring: false,
    isException: false,
    ...over,
  };
}

const dayBuckets = (n: number): Bucket[] =>
  Array.from({ length: n }, (_, i) => ({ start: T0 + i * DAY, end: T0 + (i + 1) * DAY }));

const curWin: TimeWindow = { start: T0, end: T0 + 7 * DAY };
const prevWin: TimeWindow = { start: T0 - 7 * DAY, end: T0 };
const prevOcc = (categoryId: string | null, hours: number, key = "p") =>
  occ({
    key: `${key}:${categoryId}`,
    categoryId,
    start: T0 - 3 * DAY,
    end: T0 - 3 * DAY + hours * HOUR,
  });

describe("categoryShares", () => {
  it("computes shares of each window total and the share shift", () => {
    const shares = categoryShares(
      [
        occ({ key: "a", categoryId: "work", start: T0 + 9 * HOUR, end: T0 + 12 * HOUR }),
        occ({ key: "b", categoryId: "gym", start: T0 + 13 * HOUR, end: T0 + 14 * HOUR }),
      ],
      [prevOcc("work", 1), prevOcc("gym", 1, "q")],
      curWin,
      prevWin,
    );
    expect(shares).toEqual([
      {
        categoryId: "work",
        ms: 3 * HOUR,
        share: 0.75,
        prevMs: HOUR,
        prevShare: 0.5,
        deltaShare: 0.25,
      },
      {
        categoryId: "gym",
        ms: HOUR,
        share: 0.25,
        prevMs: HOUR,
        prevShare: 0.5,
        deltaShare: -0.25,
      },
    ]);
  });

  it("includes categories that only exist in one window", () => {
    const shares = categoryShares(
      [occ({ key: "a", categoryId: "new", start: T0 + 9 * HOUR, end: T0 + 10 * HOUR })],
      [prevOcc("gone", 2)],
      curWin,
      prevWin,
    );
    const byId = Object.fromEntries(shares.map((s) => [s.categoryId, s]));
    expect(byId["new"]).toMatchObject({ ms: HOUR, share: 1, prevMs: 0, prevShare: 0 });
    expect(byId["gone"]).toMatchObject({ ms: 0, share: 0, prevMs: 2 * HOUR, prevShare: 1 });
  });

  it("yields zero shares when a window has no tracked time", () => {
    const shares = categoryShares([], [prevOcc("work", 1)], curWin, prevWin);
    expect(shares[0].share).toBe(0);
    expect(shares[0].prevShare).toBe(1);
  });
});

describe("categoryByBucket", () => {
  it("matches the trends series shape (stacked-bar ready)", () => {
    const rows = categoryByBucket(
      [
        occ({ key: "a", categoryId: "a", start: T0 + 9 * HOUR, end: T0 + 11 * HOUR }),
        occ({ key: "b", categoryId: "b", start: T0 + DAY, end: T0 + DAY + HOUR }),
        occ({ key: "c", categoryId: "c", start: T0 + DAY + HOUR, end: T0 + DAY + 90 * 60_000 }),
      ],
      dayBuckets(2),
      2,
    );
    expect(rows.seriesKeys).toEqual(["a", "b", OTHER_SERIES]);
    expect(rows.rows[0].byKey).toEqual({ a: 2 * HOUR, b: 0, [OTHER_SERIES]: 0 });
    expect(rows.rows[1].byKey).toEqual({ a: 0, b: HOUR, [OTHER_SERIES]: HOUR / 2 });
  });
});

describe("memberByBucket", () => {
  it("splits per member per bucket, members ordered by total desc", () => {
    const { memberIds, rows } = memberByBucket(
      [
        occ({ key: "a", ownerId: "me", start: T0 + 9 * HOUR, end: T0 + 10 * HOUR }),
        occ({ key: "b", ownerId: "you", start: T0 + 9 * HOUR, end: T0 + 12 * HOUR }),
        occ({ key: "c", ownerId: "me", start: T0 + DAY, end: T0 + DAY + HOUR }),
      ],
      dayBuckets(2),
    );
    expect(memberIds).toEqual(["you", "me"]);
    expect(rows[0].byMember).toEqual({ you: 3 * HOUR, me: HOUR });
    expect(rows[1].byMember).toEqual({ you: 0, me: HOUR });
  });

  it("returns empty members for no occurrences", () => {
    const { memberIds, rows } = memberByBucket([], dayBuckets(1));
    expect(memberIds).toEqual([]);
    expect(rows[0].byMember).toEqual({});
  });
});
