import { describe, expect, it } from "vitest";

import { deriveNights } from "@/lib/sleep/derive";
import { selectViewerSleepSpans } from "@/lib/sleep/viewer-sleep";
import type { Occurrence } from "@/lib/types";

// End-to-end of the Sleep tab's derived-timeline pipeline: a RAW both-members
// occurrence list → selectViewerSleepSpans → deriveNights(preFiltered). Pins
// that a partner's (or joint) sleep can never enter the viewer's nights.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 5, 1); // Mon 2026-06-01 00:00 UTC
const UTC = "UTC";

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

/** A 22:00→07:00 night attributed to its wake day. */
function night(wakeDayMs: number, owner: string, over: Partial<Occurrence> = {}): Occurrence {
  return occ({
    ownerId: owner,
    start: wakeDayMs - DAY + 22 * HOUR,
    end: wakeDayMs + 7 * HOUR,
    ...over,
  });
}

const VIEWER = "viewer";
const PARTNER = "partner";
const days = [T0, T0 + DAY, T0 + 2 * DAY];

describe("derived nights are scoped to the viewer", () => {
  it("derives only the viewer's night from a mixed both-members window", () => {
    const raw = [
      night(T0 + DAY, VIEWER), // viewer's night → should appear on Jun 2
      night(T0 + DAY, PARTNER), // partner's night, same date → must be excluded
      night(T0 + 2 * DAY, PARTNER, { isShared: true }), // joint night → still excluded
    ];

    const spans = selectViewerSleepSpans(raw, VIEWER, null);
    const nights = deriveNights(spans, days, UTC, { preFiltered: true });

    expect(nights[1]).toMatchObject({ dateKey: "2026-06-02", durationMs: 9 * HOUR });
    // The partner's same-date night did NOT extend or alter the viewer's night,
    // and the partner's joint night on Jun 3 produced nothing.
    expect(nights[2]).toMatchObject({ dateKey: "2026-06-03", durationMs: 0, start: null });
  });

  it("yields no nights when the viewer is unresolved (empty viewerId)", () => {
    const raw = [night(T0 + DAY, VIEWER), night(T0 + DAY, PARTNER)];
    const spans = selectViewerSleepSpans(raw, "", null);
    const nights = deriveNights(spans, days, UTC, { preFiltered: true });
    expect(nights.every((n) => n.durationMs === 0)).toBe(true);
  });
});
