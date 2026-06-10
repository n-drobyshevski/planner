import { describe, it, expect } from "vitest";
import { formatTime, formatOccurrenceWhen } from "@/lib/datetime/format";
import { getWindow, getVisibleDays } from "@/lib/datetime/window";
import {
  combineDateTime,
  dateInputToMs,
  dateInputToUtcMs,
  msToDateInput,
  msToTimeInput,
  allDayDateKey,
} from "@/lib/datetime/local";
import { groupByDay } from "@/lib/calendar/agenda";
import { occurrencesOnDay } from "@/lib/layout/pack-month";
import { expandEvent } from "@/lib/recurrence/expand";
import type { EventRow, Occurrence, TimeWindow } from "@/lib/types";

const BERLIN = "Europe/Berlin"; // June: CEST = UTC+2
const NY = "America/New_York"; // June: EDT = UTC-4
const KIRITIMATI = "Pacific/Kiritimati"; // UTC+14 (extreme east)

function occ(p: Partial<Occurrence>): Occurrence {
  return {
    key: "e:1",
    eventId: "e",
    occurrenceDate: 0,
    start: 0,
    end: 3_600_000,
    allDay: false,
    inactive: false,
    title: "t",
    description: null,
    location: null,
    categoryId: null,
    color: null,
    kind: "event",
    status: "confirmed",
    ownerId: "m",
    isPrivate: false,
    isShared: false,
    taskId: null,
    attributes: {},
    isRecurring: false,
    isException: false,
    ...p,
  };
}

function event(p: Partial<EventRow>): EventRow {
  return {
    id: "e1",
    workspaceId: "w1",
    ownerId: "m1",
    categoryId: null,
    title: "Event",
    description: null,
    location: null,
    isPrivate: false,
    isShared: false,
    color: null,
    kind: "event",
    allDay: false,
    inactive: false,
    status: "confirmed",
    start: 0,
    end: 3_600_000,
    timeZone: "UTC",
    rrule: null,
    recurrenceEndsAt: null,
    taskId: null,
    attributes: {},
    createdAt: 0,
    updatedAt: 0,
    ...p,
  };
}

describe("timed rendering is per-viewer-zone (same instant, different wall clocks)", () => {
  // 13:00 UTC on 1 Jun 2026.
  const inst = Date.UTC(2026, 5, 1, 13, 0);

  it("formats the same instant in each viewer's zone", () => {
    expect(formatTime(inst, BERLIN)).toBe("15:00"); // UTC+2
    expect(formatTime(inst, NY)).toBe("09:00"); // UTC-4
  });

  it("formatOccurrenceWhen (timed) renders in the viewer zone", () => {
    const end = inst + 30 * 60_000;
    expect(formatOccurrenceWhen(inst, end, false, BERLIN)).toBe(
      "Mon, 1 Jun · 15:00 – 15:30",
    );
    expect(formatOccurrenceWhen(inst, end, false, NY)).toBe(
      "Mon, 1 Jun · 09:00 – 09:30",
    );
  });
});

describe("day windows land on local midnight in the viewer zone", () => {
  const focused = Date.UTC(2026, 5, 1, 12, 0); // noon UTC, 1 Jun

  it("getWindow('day') boundaries differ by zone", () => {
    // Berlin local midnight 1 Jun = 31 May 22:00 UTC.
    expect(getWindow("day", focused, { timeZone: BERLIN }).start).toBe(
      Date.UTC(2026, 4, 31, 22, 0),
    );
    // NY local midnight 1 Jun = 1 Jun 04:00 UTC.
    expect(getWindow("day", focused, { timeZone: NY }).start).toBe(
      Date.UTC(2026, 5, 1, 4, 0),
    );
  });

  it("a spring-forward week still has 7 distinct local days (Berlin DST 29 Mar)", () => {
    const inMarch = Date.UTC(2026, 2, 30, 12, 0);
    const days = getVisibleDays("week", inMarch, { timeZone: BERLIN });
    expect(days).toHaveLength(7);
    expect(new Set(days).size).toBe(7);
  });
});

describe("local input helpers interpret wall-clock in the chosen zone", () => {
  it("combineDateTime round-trips and yields the right absolute instant", () => {
    const ms = combineDateTime("2026-06-01", "09:30", NY);
    expect(ms).toBe(Date.UTC(2026, 5, 1, 13, 30)); // 09:30 EDT = 13:30 UTC
    expect(msToTimeInput(ms, NY)).toBe("09:30");
    expect(msToDateInput(ms, NY)).toBe("2026-06-01");
  });

  it("timed midnight (dateInputToMs) is zone-local; all-day (dateInputToUtcMs) is UTC", () => {
    expect(dateInputToMs("2026-06-02", BERLIN)).toBe(Date.UTC(2026, 5, 1, 22, 0));
    expect(dateInputToUtcMs("2026-06-02")).toBe(Date.UTC(2026, 5, 2));
  });
});

describe("all-day events are floating dates (same date for every viewer)", () => {
  const start = Date.UTC(2026, 5, 2); // 2 Jun 2026 (a Tuesday)
  const end = Date.UTC(2026, 5, 3);

  it("formatOccurrenceWhen renders the same date regardless of zone", () => {
    expect(allDayDateKey(start)).toBe("2026-06-02");
    expect(formatOccurrenceWhen(start, end, true, NY)).toBe("Tue, 2 Jun · All day");
    expect(formatOccurrenceWhen(start, end, true, KIRITIMATI)).toBe(
      "Tue, 2 Jun · All day",
    );
  });

  it("lands in the 2 Jun column for viewers from UTC-4 to UTC+14", () => {
    const allDay = occ({ allDay: true, start, end });
    for (const zone of [NY, BERLIN, KIRITIMATI]) {
      const june2 = combineDateTime("2026-06-02", "00:00", zone);
      const june1 = combineDateTime("2026-06-01", "00:00", zone);
      expect(occurrencesOnDay([allDay], june2, zone)).toHaveLength(1);
      expect(occurrencesOnDay([allDay], june1, zone)).toHaveLength(0);
    }
  });

  it("buckets into the matching viewer-zone agenda day", () => {
    const allDay = occ({ allDay: true, start, end });
    const groups = groupByDay([allDay], KIRITIMATI);
    expect(groups).toHaveLength(1);
    expect(groups[0].dayMs).toBe(combineDateTime("2026-06-02", "00:00", KIRITIMATI));
  });
});

describe("recurring all-day expands in UTC for stable occurrence dates", () => {
  it("keeps every occurrence on exact UTC midnight despite a non-UTC event zone", () => {
    const e = event({
      allDay: true,
      start: Date.UTC(2026, 5, 1),
      end: Date.UTC(2026, 5, 2),
      rrule: "FREQ=DAILY",
      timeZone: NY, // deliberately non-UTC — the allDay→UTC branch must win
    });
    const win: TimeWindow = { start: Date.UTC(2026, 5, 1), end: Date.UTC(2026, 5, 5) };
    const occs = expandEvent(e, [], win);
    expect(occs.map((o) => o.start)).toEqual([
      Date.UTC(2026, 5, 1),
      Date.UTC(2026, 5, 2),
      Date.UTC(2026, 5, 3),
      Date.UTC(2026, 5, 4),
    ]);
    occs.forEach((o) => {
      expect(o.start % 86_400_000).toBe(0); // exact UTC midnight
      expect(o.occurrenceDate).toBe(o.start);
    });
  });
});
