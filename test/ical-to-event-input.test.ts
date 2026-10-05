import { describe, it, expect } from "vitest";

import type { IcsEvent } from "@/lib/ical/parse";
import {
  applyDraftTimes,
  draftExdates,
  draftTimes,
  icsEventToInput,
  isEdited,
  summarizableRecurrence,
} from "@/lib/ical/to-event-input";

const ZONE = "Europe/Berlin";
const DAY = 86_400_000;

function ev(over: Partial<IcsEvent> = {}): IcsEvent {
  return {
    key: "k",
    uid: "uid-1",
    title: "Standup",
    description: null,
    location: null,
    allDay: false,
    start: Date.UTC(2026, 9, 7, 7, 0), // 09:00 Berlin (CEST)
    end: Date.UTC(2026, 9, 7, 7, 30),
    timeZone: ZONE,
    rrule: null,
    recurrenceEndsAt: null,
    exdates: [],
    status: "confirmed",
    cancelled: false,
    warnings: [],
    ...over,
  };
}

const filing = {
  workspaceId: "ws",
  ownerId: "me",
  categoryId: "cat",
  isPrivate: true,
  isShared: false,
};

describe("icsEventToInput", () => {
  it("maps every field, files it and keeps the UID as attributes.icalUid", () => {
    const e = ev({
      title: "  Standup ",
      description: "Notes",
      location: "Room 1",
      rrule: "FREQ=WEEKLY;UNTIL=20261231T070000Z",
      recurrenceEndsAt: Date.UTC(2026, 11, 31, 7),
      status: "planned",
    });
    expect(icsEventToInput(e, filing)).toEqual({
      workspaceId: "ws",
      ownerId: "me",
      kind: "event",
      categoryId: "cat",
      isPrivate: true,
      isShared: false,
      title: "Standup",
      description: "Notes",
      location: "Room 1",
      allDay: false,
      status: "planned",
      start: e.start,
      end: e.end,
      timeZone: ZONE,
      rrule: "FREQ=WEEKLY;UNTIL=20261231T070000Z",
      recurrenceEndsAt: Date.UTC(2026, 11, 31, 7),
      attributes: { icalUid: "uid-1" },
    });
  });

  it("leaves attributes out without a UID and keeps a cancelled event cancelled", () => {
    const input = icsEventToInput(ev({ uid: null, cancelled: true, title: "" }), filing);
    expect(input.attributes).toBeUndefined();
    expect(input.status).toBe("cancelled");
    expect(input.title).toBe("");
  });
});

describe("draft times", () => {
  it("reads a timed event in the viewer's zone and round-trips it", () => {
    const e = ev();
    const times = draftTimes(e, ZONE);
    expect(times).toEqual({
      allDay: false,
      startDate: "2026-10-07",
      startTime: "09:00",
      endDate: "2026-10-07",
      endTime: "09:30",
    });
    const res = applyDraftTimes(e, times, ZONE);
    expect(res.ok && res.event).toEqual(e);
  });

  it("shows an all-day event's exclusive end as its last day", () => {
    const e = ev({ allDay: true, start: Date.UTC(2026, 9, 7), end: Date.UTC(2026, 9, 9) });
    const times = draftTimes(e, ZONE);
    expect(times.startDate).toBe("2026-10-07");
    expect(times.endDate).toBe("2026-10-08");
    const res = applyDraftTimes(e, times, ZONE);
    expect(res.ok && res.event.end).toBe(Date.UTC(2026, 9, 9));
  });

  it("switches a timed event to all-day on floating dates", () => {
    const e = ev();
    const res = applyDraftTimes(e, { ...draftTimes(e, ZONE), allDay: true }, ZONE);
    expect(res.ok && res.event).toMatchObject({
      allDay: true,
      start: Date.UTC(2026, 9, 7),
      end: Date.UTC(2026, 9, 7) + DAY,
    });
  });

  it("allows end = start but not an end before the start", () => {
    const e = ev();
    const same = applyDraftTimes(e, { ...draftTimes(e, ZONE), endTime: "09:00" }, ZONE);
    expect(same.ok).toBe(true);
    expect(applyDraftTimes(e, { ...draftTimes(e, ZONE), endTime: "08:00" }, ZONE)).toEqual({
      ok: false,
      error: "end-before-start",
    });
    expect(applyDraftTimes(e, { ...draftTimes(e, ZONE), startTime: "" }, ZONE)).toEqual({
      ok: false,
      error: "invalid",
    });
  });
});

describe("isEdited / draftExdates", () => {
  it("flags title and time changes only", () => {
    const e = ev();
    expect(isEdited(e, { ...e })).toBe(false);
    expect(isEdited(e, { ...e, title: "Other" })).toBe(true);
    expect(isEdited(e, { ...e, end: e.end + 60_000 })).toBe(true);
  });

  it("moves a series' EXDATEs with its start", () => {
    const e = ev({ rrule: "FREQ=DAILY", exdates: [Date.UTC(2026, 9, 9, 7)] });
    expect(draftExdates(e, e)).toEqual([Date.UTC(2026, 9, 9, 7)]);
    expect(draftExdates(e, { ...e, start: e.start + 3_600_000 })).toEqual([Date.UTC(2026, 9, 9, 8)]);
  });
});

describe("summarizableRecurrence", () => {
  it("accepts the rules the summary can say", () => {
    expect(summarizableRecurrence("FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T000000Z")).toMatchObject({
      freq: "WEEKLY",
      byWeekday: [0, 2],
      end: { type: "until" },
    });
    expect(summarizableRecurrence("FREQ=DAILY;INTERVAL=2;COUNT=5")).toMatchObject({
      freq: "DAILY",
      interval: 2,
      end: { type: "count", count: 5 },
    });
  });

  it("declines richer rules", () => {
    expect(summarizableRecurrence(null)).toBeNull();
    expect(summarizableRecurrence("FREQ=YEARLY")).toBeNull();
    expect(summarizableRecurrence("FREQ=MONTHLY;BYDAY=1MO")).toBeNull();
    expect(summarizableRecurrence("FREQ=MONTHLY;BYMONTHDAY=15")).toBeNull();
    expect(summarizableRecurrence("FREQ=MONTHLY;BYDAY=MO")).toBeNull();
  });
});
