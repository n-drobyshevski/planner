import { describe, it, expect } from "vitest";
import { startOfDay, addDays, getTime } from "date-fns";
import {
  getWindow,
  getVisibleDays,
  navigate,
  AGENDA_DAYS,
} from "@/lib/datetime/window";
import { isCalendarViewParam, formatRangeLabel } from "@/lib/datetime/format";
import { groupByDay } from "@/lib/calendar/agenda";
import type { Occurrence } from "@/lib/types";

function occ(start: number, title: string, opts: Partial<Occurrence> = {}): Occurrence {
  return {
    key: `${title}-${start}`,
    eventId: "e",
    occurrenceDate: start,
    start,
    end: start + 3_600_000,
    allDay: false,
    inactive: false,
    title,
    description: null,
    location: null,
    categoryId: null,
    color: null,
    kind: "event",
    contextId: null,
    ownerId: "m",
    isPrivate: false,
    taskId: null,
    isRecurring: false,
    isException: false,
    ...opts,
  };
}

describe("agenda view windowing", () => {
  // Normalize via startOfDay so assertions are timezone-robust.
  const focus = getTime(startOfDay(new Date(2026, 5, 1, 12, 0))); // Mon Jun 1 2026

  it("getWindow spans [startOfDay(focus), +AGENDA_DAYS)", () => {
    const w = getWindow("agenda", focus);
    expect(w.start).toBe(focus);
    expect(w.end).toBe(getTime(addDays(focus, AGENDA_DAYS)));
  });

  it("getVisibleDays returns AGENDA_DAYS consecutive local-midnight days", () => {
    const days = getVisibleDays("agenda", focus);
    expect(days).toHaveLength(AGENDA_DAYS);
    expect(days[0]).toBe(focus);
    expect(days[1]).toBe(getTime(startOfDay(addDays(focus, 1))));
  });

  it("navigate pages by AGENDA_DAYS", () => {
    expect(navigate("agenda", focus, 1)).toBe(getTime(addDays(focus, AGENDA_DAYS)));
    expect(navigate("agenda", focus, -1)).toBe(getTime(addDays(focus, -AGENDA_DAYS)));
    expect(navigate("agenda", focus, 0)).toBe(focus);
  });

  it("is a recognized URL view param", () => {
    expect(isCalendarViewParam("agenda")).toBe(true);
  });

  it("produces a non-empty range label", () => {
    expect(formatRangeLabel("agenda", focus).length).toBeGreaterThan(0);
  });
});

describe("groupByDay", () => {
  // Build inputs with the same date-fns helpers groupByDay uses, so inputs and
  // buckets share one tz basis (avoids off-by-one across zones).
  const day0 = getTime(startOfDay(new Date(2026, 5, 1, 12, 0)));
  const day1 = getTime(startOfDay(addDays(day0, 1)));

  it("buckets occurrences by local day, ascending", () => {
    const groups = groupByDay([
      occ(day1 + 10 * 3_600_000, "later day"),
      occ(day0 + 9 * 3_600_000, "earlier day"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.dayMs)).toEqual([day0, day1]);
    expect(groups[0].items[0].title).toBe("earlier day");
    expect(groups[1].items[0].title).toBe("later day");
  });

  it("puts all-day items first, then by start time", () => {
    const groups = groupByDay([
      occ(day0 + 15 * 3_600_000, "3pm"),
      occ(day0 + 9 * 3_600_000, "9am"),
      occ(day0, "All day", { allDay: true }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.title)).toEqual(["All day", "9am", "3pm"]);
  });

  it("returns [] for no occurrences", () => {
    expect(groupByDay([])).toEqual([]);
  });
});
