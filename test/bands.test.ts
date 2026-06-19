import { describe, it, expect } from "vitest";
import { mergeRanges, partitionPublicOccurrences } from "@/lib/calendar/bands";
import type { EventKind, Occurrence } from "@/lib/types";

function occ(over: Partial<Occurrence> & Pick<Occurrence, "start" | "end">): Occurrence {
  return {
    key: `${over.eventId ?? "e"}:${over.start}`,
    eventId: "e",
    occurrenceDate: over.start,
    allDay: false,
    inactive: false,
    status: "confirmed",
    title: "t",
    description: null,
    location: null,
    categoryId: null,
    color: null,
    kind: "event" as EventKind,
    ownerId: "m",
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

const H = 3_600_000;

describe("mergeRanges", () => {
  it("returns an empty list for no ranges", () => {
    expect(mergeRanges([])).toEqual([]);
  });

  it("drops zero-length and inverted ranges", () => {
    expect(
      mergeRanges([
        { start: 100, end: 100 },
        { start: 300, end: 200 },
      ]),
    ).toEqual([]);
  });

  it("keeps disjoint ranges separate and sorted", () => {
    expect(
      mergeRanges([
        { start: 500, end: 600 },
        { start: 100, end: 200 },
      ]),
    ).toEqual([
      { start: 100, end: 200 },
      { start: 500, end: 600 },
    ]);
  });

  it("merges overlapping ranges into one", () => {
    expect(
      mergeRanges([
        { start: 100, end: 300 },
        { start: 200, end: 500 },
      ]),
    ).toEqual([{ start: 100, end: 500 }]);
  });

  it("merges touching ranges (end === next.start) so abutting blocks read as one band", () => {
    expect(
      mergeRanges([
        { start: 100, end: 200 },
        { start: 200, end: 300 },
      ]),
    ).toEqual([{ start: 100, end: 300 }]);
  });

  it("absorbs a fully-contained range", () => {
    expect(
      mergeRanges([
        { start: 100, end: 900 },
        { start: 300, end: 400 },
      ]),
    ).toEqual([{ start: 100, end: 900 }]);
  });

  it("does not mutate the input", () => {
    const input = [
      { start: 200, end: 400 },
      { start: 100, end: 250 },
    ];
    const snapshot = JSON.parse(JSON.stringify(input));
    mergeRanges(input);
    expect(input).toEqual(snapshot);
  });
});

describe("partitionPublicOccurrences", () => {
  it("keeps context zones as drawable occurrences (never bands)", () => {
    const ctx = occ({ start: 9 * H, end: 17 * H, kind: "context", eventId: "work" });
    const { occurrences, unavailableBands } = partitionPublicOccurrences([ctx]);
    expect(occurrences).toEqual([ctx]);
    expect(unavailableBands).toEqual([]);
  });

  it("keeps an inactive context as a drawable occurrence, not a band", () => {
    const ctx = occ({
      start: 9 * H,
      end: 17 * H,
      kind: "context",
      eventId: "work",
      inactive: true,
    });
    const { occurrences, unavailableBands } = partitionPublicOccurrences([ctx]);
    expect(occurrences).toEqual([ctx]);
    expect(unavailableBands).toEqual([]);
  });

  it("keeps active events as drawable occurrences", () => {
    const e = occ({ start: 10 * H, end: 11 * H });
    const { occurrences, unavailableBands } = partitionPublicOccurrences([e]);
    expect(occurrences).toEqual([e]);
    expect(unavailableBands).toEqual([]);
  });

  it("turns inactive non-cancelled events into merged bands, out of occurrences", () => {
    const sleepA = occ({ start: 0, end: 6 * H, inactive: true });
    const sleepB = occ({ start: 6 * H, end: 8 * H, inactive: true }); // abuts → merges
    const { occurrences, unavailableBands } = partitionPublicOccurrences([sleepA, sleepB]);
    expect(occurrences).toEqual([]);
    expect(unavailableBands).toEqual([{ start: 0, end: 8 * H }]);
  });

  it("drops cancelled-inactive events from both outputs", () => {
    const cancelled = occ({
      start: 0,
      end: 6 * H,
      inactive: true,
      status: "cancelled",
    });
    const { occurrences, unavailableBands } = partitionPublicOccurrences([cancelled]);
    expect(occurrences).toEqual([]);
    expect(unavailableBands).toEqual([]);
  });

  it("splits a mixed window correctly", () => {
    const ctx = occ({ start: 9 * H, end: 17 * H, kind: "context", eventId: "work" });
    const meeting = occ({ start: 10 * H, end: 11 * H, eventId: "m" });
    const sleep = occ({ start: 0, end: 6 * H, inactive: true, eventId: "s" });
    const { occurrences, unavailableBands } = partitionPublicOccurrences([
      ctx,
      meeting,
      sleep,
    ]);
    expect(occurrences).toEqual([ctx, meeting]);
    expect(unavailableBands).toEqual([{ start: 0, end: 6 * H }]);
  });
});
