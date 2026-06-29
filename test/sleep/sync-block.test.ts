import { describe, expect, it } from "vitest";

import { planSleepBlockSync } from "@/lib/sleep/sync-block";
import type { Occurrence } from "@/lib/types";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Monday 2026-06-15 00:00 UTC (wake day). */
const WAKE = Date.UTC(2026, 5, 15);
const UTC = "UTC";
const BERLIN = "Europe/Berlin";

// Default night window (matches the prefs defaults the tab passes through).
const START_HOUR = 20;
const END_HOUR = 12;

// Logged times for the night: bedtime 23:45 the evening before, wake 06:30.
const BED = WAKE - DAY + 23 * HOUR + 45 * MIN;
const WOKE = WAKE + 6 * HOUR + 30 * MIN;

let seq = 0;
function occ(over: Partial<Occurrence> = {}): Occurrence {
  seq += 1;
  const start = over.start ?? WAKE - DAY + 23 * HOUR;
  return {
    key: `k${seq}`,
    eventId: `e${seq}`,
    occurrenceDate: over.occurrenceDate ?? start,
    start,
    end: over.end ?? WAKE + 7 * HOUR,
    allDay: false,
    inactive: true,
    status: "confirmed",
    title: "Sleep",
    description: null,
    location: null,
    categoryId: null,
    color: null,
    kind: "event",
    ownerId: "m1",
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

const base = {
  date: "2026-06-15",
  bedtimeAt: BED,
  wokeAt: WOKE,
  timeZone: UTC,
  startHour: START_HOUR,
  endHour: END_HOUR,
};

describe("planSleepBlockSync", () => {
  it("creates a block when no sleep occurrence covers the night", () => {
    const plan = planSleepBlockSync({ ...base, viewerSleepOccurrences: [] });
    expect(plan).toEqual({ action: "create", start: BED, end: WOKE });
  });

  it("updates a one-off block in place to the logged times", () => {
    const block = occ({ eventId: "single", isRecurring: false });
    const plan = planSleepBlockSync({ ...base, viewerSleepOccurrences: [block] });
    expect(plan).toEqual({
      action: "update-single",
      eventId: "single",
      start: BED,
      end: WOKE,
    });
  });

  it("overrides only this night for a recurring routine", () => {
    const block = occ({
      eventId: "series",
      isRecurring: true,
      occurrenceDate: WAKE - DAY + 23 * HOUR,
    });
    const plan = planSleepBlockSync({ ...base, viewerSleepOccurrences: [block] });
    expect(plan).toEqual({
      action: "override",
      eventId: "series",
      occurrenceMs: WAKE - DAY + 23 * HOUR,
      start: BED,
      end: WOKE,
    });
  });

  it("picks the occurrence with the most in-window time", () => {
    const sliver = occ({ eventId: "sliver", start: WAKE - DAY + 23 * HOUR, end: WAKE - DAY + 23.5 * HOUR });
    const main = occ({ eventId: "main", start: WAKE - DAY + 23 * HOUR, end: WAKE + 7 * HOUR });
    const plan = planSleepBlockSync({ ...base, viewerSleepOccurrences: [sliver, main] });
    expect(plan).toMatchObject({ action: "update-single", eventId: "main" });
  });

  it("ignores a block that falls outside the night window (daytime nap)", () => {
    // A 13:00–14:00 nap on the wake day is past the 12:00 window end.
    const nap = occ({ eventId: "nap", start: WAKE + 13 * HOUR, end: WAKE + 14 * HOUR });
    const plan = planSleepBlockSync({ ...base, viewerSleepOccurrences: [nap] });
    expect(plan).toEqual({ action: "create", start: BED, end: WOKE });
  });

  it("uses wall-clock window bounds across a DST boundary (Berlin fall-back)", () => {
    // Wake day 2026-10-25 (25h Berlin day). A block 23:00 CEST → 07:30 CET sits
    // inside [20:00 prev, 12:00) wall-clock, so it's the night's block.
    const block = occ({
      eventId: "berlin",
      isRecurring: false,
      start: Date.UTC(2026, 9, 24, 21),
      end: Date.UTC(2026, 9, 25, 7, 30),
    });
    const plan = planSleepBlockSync({
      ...base,
      date: "2026-10-25",
      timeZone: BERLIN,
      bedtimeAt: Date.UTC(2026, 9, 24, 21, 30),
      wokeAt: Date.UTC(2026, 9, 25, 6, 30),
      viewerSleepOccurrences: [block],
    });
    expect(plan).toMatchObject({ action: "update-single", eventId: "berlin" });
  });
});
