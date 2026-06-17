import { describe, expect, it } from "vitest";

import { isViewerSleep, selectViewerSleepSpans } from "@/lib/sleep/viewer-sleep";
import type { Occurrence } from "@/lib/types";

const HOUR = 60 * 60_000;
const T0 = Date.UTC(2026, 5, 1);

let seq = 0;
function occ(over: Partial<Occurrence> = {}): Occurrence {
  seq += 1;
  return {
    key: `k${seq}`,
    eventId: `e${seq}`,
    occurrenceDate: T0,
    start: T0,
    end: T0 + HOUR,
    allDay: false,
    inactive: true,
    status: "confirmed",
    title: "Sleep",
    description: null,
    location: null,
    categoryId: null,
    color: null,
    kind: "event",
    ownerId: "viewer",
    isPrivate: false,
    isShared: false,
    taskId: null,
    attributes: {},
    isRecurring: false,
    isException: false,
    ...over,
  };
}

const VIEWER = "viewer";
const PARTNER = "partner";
const SLEEP_CAT = "sleep-cat";

describe("isViewerSleep — ownership gate (heuristic mode, no sleep category)", () => {
  it("accepts the viewer's own inactive timed event", () => {
    expect(isViewerSleep(occ({ ownerId: VIEWER, inactive: true }), VIEWER, null)).toBe(true);
  });

  it("rejects a partner-owned inactive event", () => {
    expect(isViewerSleep(occ({ ownerId: PARTNER, inactive: true }), VIEWER, null)).toBe(false);
  });

  it("rejects a shared/joint inactive event the partner owns (stricter than filterForInsights)", () => {
    // filterForInsights admits isShared items; sleep must NOT — a partner's joint
    // sleep block is still the partner's sleep, never yours.
    expect(
      isViewerSleep(occ({ ownerId: PARTNER, isShared: true, inactive: true }), VIEWER, null),
    ).toBe(false);
  });

  it("rejects the viewer's own ACTIVE event (heuristic counts only inactive)", () => {
    expect(isViewerSleep(occ({ ownerId: VIEWER, inactive: false }), VIEWER, null)).toBe(false);
  });
});

describe("isViewerSleep — sleep-category mode", () => {
  it("accepts the viewer's event in the sleep category (even if active)", () => {
    expect(
      isViewerSleep(
        occ({ ownerId: VIEWER, categoryId: SLEEP_CAT, inactive: false }),
        VIEWER,
        SLEEP_CAT,
      ),
    ).toBe(true);
  });

  it("rejects a partner-owned event in the same sleep category", () => {
    expect(
      isViewerSleep(occ({ ownerId: PARTNER, categoryId: SLEEP_CAT }), VIEWER, SLEEP_CAT),
    ).toBe(false);
  });

  it("rejects the viewer's event in a different category", () => {
    expect(
      isViewerSleep(occ({ ownerId: VIEWER, categoryId: "other" }), VIEWER, SLEEP_CAT),
    ).toBe(false);
  });
});

describe("isViewerSleep — unresolved viewer & shape guards", () => {
  it("returns false for every occurrence when viewerId is empty, even ownerId === ''", () => {
    // The insights-shell falls back to "" before the current member resolves.
    expect(isViewerSleep(occ({ ownerId: "" }), "", null)).toBe(false);
    expect(isViewerSleep(occ({ ownerId: PARTNER }), "", null)).toBe(false);
    expect(isViewerSleep(occ({ ownerId: VIEWER }), "", SLEEP_CAT)).toBe(false);
  });

  it("rejects all-day occurrences", () => {
    expect(isViewerSleep(occ({ ownerId: VIEWER, allDay: true }), VIEWER, null)).toBe(false);
  });

  it("rejects context backdrops (kind !== 'event')", () => {
    expect(isViewerSleep(occ({ ownerId: VIEWER, kind: "context" }), VIEWER, null)).toBe(false);
  });
});

describe("selectViewerSleepSpans", () => {
  it("keeps only the viewer's own sleep spans from a mixed list", () => {
    const spans = selectViewerSleepSpans(
      [
        occ({ ownerId: VIEWER, inactive: true }),
        occ({ ownerId: PARTNER, inactive: true }),
        occ({ ownerId: PARTNER, isShared: true, inactive: true }),
        occ({ ownerId: VIEWER, inactive: false }), // active → dropped in heuristic mode
      ],
      VIEWER,
      null,
    );
    expect(spans).toHaveLength(1);
    expect(spans[0].ownerId).toBe(VIEWER);
    expect(spans[0].inactive).toBe(true);
  });
});
