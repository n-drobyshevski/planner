import { describe, it, expect } from "vitest";
import { TZDate } from "@date-fns/tz";
import { expandEvent, expandEvents } from "@/lib/recurrence/expand";
import type { EventRow, OverrideRow, TimeWindow } from "@/lib/types";

const TZ = "Europe/Berlin";

/** real UTC ms for a Berlin wall-clock time (month is 0-based). */
function berlin(y: number, mo: number, d: number, h = 0, mi = 0): number {
  return new TZDate(y, mo, d, h, mi, 0, TZ).getTime();
}
/** Berlin wall-clock hour of a real instant. */
function berlinHour(ms: number): number {
  return new TZDate(ms, TZ).getHours();
}

function makeEvent(p: Partial<EventRow> = {}): EventRow {
  return {
    id: "e1",
    workspaceId: "w1",
    ownerId: "m1",
    categoryId: null,
    title: "Event",
    description: null,
    location: null,
    isPrivate: false,
    color: null,
    kind: "event",
    contextId: null,
    allDay: false,
    start: berlin(2026, 2, 27, 9),
    end: berlin(2026, 2, 27, 10),
    timeZone: TZ,
    rrule: null,
    recurrenceEndsAt: null,
    taskId: null,
    createdAt: 0,
    updatedAt: 0,
    ...p,
  };
}

function ov(p: Partial<OverrideRow> & Pick<OverrideRow, "occurrenceDate" | "type">): OverrideRow {
  return {
    id: "o1",
    workspaceId: "w1",
    eventId: "e1",
    title: null,
    description: null,
    location: null,
    categoryId: null,
    start: null,
    end: null,
    allDay: null,
    ...p,
  };
}

describe("expandEvent — single", () => {
  it("includes an event intersecting the window", () => {
    const e = makeEvent({ start: berlin(2026, 2, 27, 9), end: berlin(2026, 2, 27, 10) });
    const win: TimeWindow = { start: berlin(2026, 2, 27, 0), end: berlin(2026, 2, 28, 0) };
    const occ = expandEvent(e, [], win);
    expect(occ).toHaveLength(1);
    expect(occ[0].isRecurring).toBe(false);
    expect(occ[0].start).toBe(e.start);
  });

  it("excludes an event outside the window", () => {
    const e = makeEvent({ start: berlin(2026, 2, 20, 9), end: berlin(2026, 2, 20, 10) });
    const win: TimeWindow = { start: berlin(2026, 2, 27, 0), end: berlin(2026, 2, 28, 0) };
    expect(expandEvent(e, [], win)).toHaveLength(0);
  });

  it("carries kind and contextId onto the occurrence", () => {
    const ctx = makeEvent({ kind: "context" });
    const win: TimeWindow = { start: berlin(2026, 2, 27, 0), end: berlin(2026, 2, 28, 0) };
    const o = expandEvent(ctx, [], win)[0];
    expect(o.kind).toBe("context");

    const child = makeEvent({ contextId: "ctx-1" });
    expect(expandEvent(child, [], win)[0].contextId).toBe("ctx-1");
  });

  it("carries the event's own color onto the occurrence", () => {
    const e = makeEvent({ color: "#abcdef" });
    const win: TimeWindow = { start: berlin(2026, 2, 27, 0), end: berlin(2026, 2, 28, 0) };
    expect(expandEvent(e, [], win)[0].color).toBe("#abcdef");
  });
});

describe("expandEvent — recurring", () => {
  it("expands a daily series within the window only", () => {
    const e = makeEvent({ rrule: "FREQ=DAILY" });
    const win: TimeWindow = { start: berlin(2026, 2, 27, 0), end: berlin(2026, 3, 1, 0) }; // Mar 27..31
    const occ = expandEvent(e, [], win);
    expect(occ).toHaveLength(5);
    occ.forEach((o) => expect(o.isRecurring).toBe(true));
  });

  it("respects weekly BYDAY", () => {
    const e = makeEvent({ start: berlin(2026, 5, 1, 9), end: berlin(2026, 5, 1, 10), rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR" });
    const win: TimeWindow = { start: berlin(2026, 5, 1, 0), end: berlin(2026, 5, 8, 0) }; // one week of June 2026
    const occ = expandEvent(e, [], win);
    expect(occ).toHaveLength(3);
  });

  it("prunes past recurrenceEndsAt", () => {
    const e = makeEvent({ rrule: "FREQ=DAILY", recurrenceEndsAt: berlin(2026, 2, 28, 23) });
    const win: TimeWindow = { start: berlin(2026, 2, 27, 0), end: berlin(2026, 3, 1, 0) };
    const occ = expandEvent(e, [], win);
    expect(occ).toHaveLength(2); // Mar 27, 28 only
  });

  it("drops a cancelled occurrence (EXDATE)", () => {
    const e = makeEvent({ rrule: "FREQ=DAILY" });
    const win: TimeWindow = { start: berlin(2026, 2, 27, 0), end: berlin(2026, 3, 1, 0) };
    const cancelled = berlin(2026, 2, 28, 9);
    const occ = expandEvent(e, [ov({ occurrenceDate: cancelled, type: "cancel" })], win);
    expect(occ).toHaveLength(4);
    expect(occ.find((o) => o.occurrenceDate === cancelled)).toBeUndefined();
  });

  it("applies a modify override (title + time) and marks isException", () => {
    const e = makeEvent({ rrule: "FREQ=DAILY" });
    const win: TimeWindow = { start: berlin(2026, 2, 27, 0), end: berlin(2026, 3, 1, 0) };
    const target = berlin(2026, 2, 28, 9);
    const occ = expandEvent(
      e,
      [ov({ occurrenceDate: target, type: "modify", title: "Moved", start: berlin(2026, 2, 28, 14), end: berlin(2026, 2, 28, 15) })],
      win,
    );
    const mod = occ.find((o) => o.occurrenceDate === target)!;
    expect(mod.title).toBe("Moved");
    expect(mod.start).toBe(berlin(2026, 2, 28, 14));
    expect(mod.isException).toBe(true);
  });

  it("keeps the series color on every occurrence, incl. a modify-exception", () => {
    const e = makeEvent({ rrule: "FREQ=DAILY", color: "#abcdef" });
    const win: TimeWindow = { start: berlin(2026, 2, 27, 0), end: berlin(2026, 3, 1, 0) };
    const target = berlin(2026, 2, 28, 9);
    const occ = expandEvent(
      e,
      [ov({ occurrenceDate: target, type: "modify", title: "Moved" })],
      win,
    );
    expect(occ.every((o) => o.color === "#abcdef")).toBe(true);
  });

  it("keeps kind/contextId on every occurrence, incl. a modify-exception", () => {
    const e = makeEvent({ rrule: "FREQ=DAILY", kind: "context" });
    const win: TimeWindow = { start: berlin(2026, 2, 27, 0), end: berlin(2026, 3, 1, 0) };
    const target = berlin(2026, 2, 28, 9);
    const occ = expandEvent(
      e,
      [ov({ occurrenceDate: target, type: "modify", title: "Moved" })],
      win,
    );
    expect(occ.length).toBeGreaterThan(0);
    expect(occ.every((o) => o.kind === "context")).toBe(true);

    const child = makeEvent({ rrule: "FREQ=DAILY", contextId: "ctx-1" });
    const childOcc = expandEvent(
      child,
      [ov({ occurrenceDate: target, type: "modify", title: "Moved" })],
      win,
    );
    expect(childOcc.every((o) => o.contextId === "ctx-1")).toBe(true);
  });

  it("surfaces a modify whose new time is dragged into the window", () => {
    const e = makeEvent({ start: berlin(2026, 2, 2, 9), end: berlin(2026, 2, 2, 10), rrule: "FREQ=WEEKLY;BYDAY=MO" });
    // window is a single Wednesday with no natural Monday occurrence nearby
    const win: TimeWindow = { start: berlin(2026, 2, 18, 0), end: berlin(2026, 2, 19, 0) };
    const original = e.start; // a Monday weeks earlier, not in the padded window
    const occ = expandEvent(
      e,
      [ov({ occurrenceDate: original, type: "modify", start: berlin(2026, 2, 18, 10), end: berlin(2026, 2, 18, 11) })],
      win,
    );
    expect(occ).toHaveLength(1);
    expect(occ[0].start).toBe(berlin(2026, 2, 18, 10));
    expect(occ[0].isException).toBe(true);
  });

  it("keeps wall-clock time stable across a DST spring-forward (the critical case)", () => {
    // Europe/Berlin springs forward on 2026-03-29 (02:00 -> 03:00).
    const e = makeEvent({ start: berlin(2026, 2, 27, 9), end: berlin(2026, 2, 27, 10), rrule: "FREQ=DAILY" });
    const win: TimeWindow = { start: berlin(2026, 2, 27, 0), end: berlin(2026, 3, 1, 0) };
    const occ = expandEvent(e, [], win);
    expect(occ).toHaveLength(5);
    // Every occurrence is 09:00 *local*, even after the clock change.
    occ.forEach((o) => expect(berlinHour(o.start)).toBe(9));
    // Prove DST was actually applied: the UTC hour differs pre vs post jump.
    const mar28 = occ.find((o) => new TZDate(o.start, TZ).getDate() === 28)!;
    const mar30 = occ.find((o) => new TZDate(o.start, TZ).getDate() === 30)!;
    expect(new Date(mar28.start).getUTCHours()).toBe(8); // UTC+1 winter
    expect(new Date(mar30.start).getUTCHours()).toBe(7); // UTC+2 summer
  });
});

describe("expandEvents", () => {
  it("merges multiple events sorted by start", () => {
    const a = makeEvent({ id: "a", title: "A", start: berlin(2026, 2, 27, 14), end: berlin(2026, 2, 27, 15) });
    const b = makeEvent({ id: "b", title: "B", start: berlin(2026, 2, 27, 9), end: berlin(2026, 2, 27, 10) });
    const win: TimeWindow = { start: berlin(2026, 2, 27, 0), end: berlin(2026, 2, 28, 0) };
    const occ = expandEvents([a, b], [], win);
    expect(occ.map((o) => o.eventId)).toEqual(["b", "a"]);
  });
});
