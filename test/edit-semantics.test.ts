import { describe, it, expect } from "vitest";
import { RRule } from "rrule";
import type { EventRow } from "@/lib/types";
import {
  cancelOccurrence,
  modifyOccurrence,
  editAll,
  splitThisAndFuture,
  type OccurrencePatch,
} from "@/lib/recurrence/edit-semantics";

// A weekly recurring master event: Mon & Wed, 10:00–11:00 UTC, starting 2026-01-05 (a Monday).
const baseStart = Date.UTC(2026, 0, 5, 10, 0, 0); // 2026-01-05T10:00:00Z
const baseEnd = Date.UTC(2026, 0, 5, 11, 0, 0); // 1h duration

function makeEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: "evt-1",
    workspaceId: "ws-1",
    ownerId: "owner-1",
    categoryId: "cat-1",
    title: "Standup",
    description: "Daily sync",
    location: "Room A",
    isPrivate: false,
    isShared: false,
    color: null,
    kind: "event",
    allDay: false,
    inactive: false,
    status: "confirmed",
    start: baseStart,
    end: baseEnd,
    timeZone: "America/New_York",
    rrule: "FREQ=WEEKLY;BYDAY=MO,WE",
    recurrenceEndsAt: null,
    taskId: null,
    attributes: {},
    createdAt: Date.UTC(2025, 11, 1),
    updatedAt: Date.UTC(2025, 11, 1),
    ...overrides,
  };
}

describe("cancelOccurrence", () => {
  it("returns a cancel override input with no patch", () => {
    const occ = Date.UTC(2026, 0, 7, 10, 0, 0);
    const result = cancelOccurrence("evt-1", occ);
    expect(result).toEqual({
      eventId: "evt-1",
      occurrenceDate: occ,
      type: "cancel",
    });
    expect(result.patch).toBeUndefined();
  });
});

describe("modifyOccurrence", () => {
  it("returns a modify override input carrying the patch", () => {
    const occ = Date.UTC(2026, 0, 7, 10, 0, 0);
    const patch: OccurrencePatch = {
      title: "Special standup",
      start: Date.UTC(2026, 0, 7, 11, 0, 0),
      end: Date.UTC(2026, 0, 7, 12, 0, 0),
    };
    const result = modifyOccurrence("evt-1", occ, patch);
    expect(result).toEqual({
      eventId: "evt-1",
      occurrenceDate: occ,
      type: "modify",
      patch,
    });
  });

  it("preserves null-able patch fields", () => {
    const occ = Date.UTC(2026, 0, 7, 10, 0, 0);
    const patch: OccurrencePatch = { location: null, categoryId: null };
    const result = modifyOccurrence("evt-1", occ, patch);
    expect(result.patch).toEqual({ location: null, categoryId: null });
  });
});

describe("editAll", () => {
  it("returns only patched scalar fields", () => {
    const event = makeEvent();
    const result = editAll(event, { title: "Renamed", location: null });
    expect(result).toEqual({ title: "Renamed", location: null });
  });

  it("shifts end by the same delta when start moves and end is not given", () => {
    const event = makeEvent();
    const newStart = baseStart + 30 * 60 * 1000; // +30 min
    const result = editAll(event, { start: newStart });
    expect(result.start).toBe(newStart);
    // duration preserved
    expect(result.end).toBe(baseEnd + 30 * 60 * 1000);
    expect((result.end as number) - (result.start as number)).toBe(
      baseEnd - baseStart,
    );
  });

  it("uses explicit end when both start and end are given", () => {
    const event = makeEvent();
    const newStart = baseStart + 60 * 60 * 1000;
    const newEnd = baseStart + 3 * 60 * 60 * 1000;
    const result = editAll(event, { start: newStart, end: newEnd });
    expect(result.start).toBe(newStart);
    expect(result.end).toBe(newEnd);
  });

  it("updates end alone when only end is given", () => {
    const event = makeEvent();
    const newEnd = baseEnd + 15 * 60 * 1000;
    const result = editAll(event, { end: newEnd });
    expect(result.start).toBeUndefined();
    expect(result.end).toBe(newEnd);
  });

  it("does not touch times when neither start nor end is patched", () => {
    const event = makeEvent();
    const result = editAll(event, { description: "New desc" });
    expect(result).toEqual({ description: "New desc" });
    expect(result.start).toBeUndefined();
    expect(result.end).toBeUndefined();
  });

  it("treats start === 0 (epoch) as a real patch, not absent", () => {
    const event = makeEvent();
    const result = editAll(event, { start: 0 });
    expect(result.start).toBe(0);
    // end shifted by the (negative) delta, preserving duration
    expect(result.end).toBe(0 + (baseEnd - baseStart));
    expect((result.end as number) - (result.start as number)).toBe(
      baseEnd - baseStart,
    );
  });

  it("preserves a falsy allDay=false patch value", () => {
    const event = makeEvent({ allDay: true });
    const result = editAll(event, { allDay: false });
    expect(result.allDay).toBe(false);
  });

  it("carries the inactive flag (series-level)", () => {
    expect(editAll(makeEvent({ inactive: false }), { inactive: true }).inactive).toBe(true);
    // falsy false must still be treated as a real patch, not absent
    expect(editAll(makeEvent({ inactive: true }), { inactive: false }).inactive).toBe(false);
    // absent => not in the patch result
    expect("inactive" in editAll(makeEvent(), {})).toBe(false);
  });

  it("returns an empty object for an empty patch", () => {
    const event = makeEvent();
    expect(editAll(event, {})).toEqual({});
  });
});

describe("splitThisAndFuture", () => {
  // Pick an occurrence start in the middle of the series: 2026-02-02 10:00 UTC.
  const fromOccurrenceMs = Date.UTC(2026, 1, 2, 10, 0, 0);

  it("the new series inherits the master's attributes", () => {
    const event = makeEvent({ attributes: { energy: 3, mood: "calm" } });
    const { newSeries } = splitThisAndFuture(event, fromOccurrenceMs, {});
    expect(newSeries.attributes).toEqual({ energy: 3, mood: "calm" });
  });

  it("sets the original UNTIL to just before the split point", () => {
    const event = makeEvent();
    const { original } = splitThisAndFuture(event, fromOccurrenceMs, {});

    expect(original.id).toBe("evt-1");
    expect(original.recurrenceEndsAt).toBe(fromOccurrenceMs - 1000);

    // Parse the original rrule and confirm UNTIL === fromOccurrenceMs - 1000.
    expect(original.rrule).not.toBeNull();
    const parsed = RRule.parseString(original.rrule as string);
    expect(parsed.until).toBeInstanceOf(Date);
    expect((parsed.until as Date).getTime()).toBe(fromOccurrenceMs - 1000);
    // FREQ retained on the original.
    expect(parsed.freq).toBe(RRule.WEEKLY);
  });

  it("creates a new series starting at the split point that retains FREQ", () => {
    const event = makeEvent();
    const { newSeries } = splitThisAndFuture(event, fromOccurrenceMs, {});

    expect(newSeries.start).toBe(fromOccurrenceMs);
    // duration preserved (1h)
    expect(newSeries.end - newSeries.start).toBe(baseEnd - baseStart);

    expect(newSeries.rrule).not.toBeNull();
    const parsed = RRule.parseString(newSeries.rrule as string);
    expect(parsed.freq).toBe(RRule.WEEKLY);
    // new series is open-ended: no UNTIL / COUNT carried over
    expect(parsed.until ?? null).toBeNull();
    expect(parsed.count ?? null).toBeNull();
    expect(newSeries.recurrenceEndsAt).toBeNull();

    // inherits privacy / owner / timeZone
    expect(newSeries.isPrivate).toBe(event.isPrivate);
    expect(newSeries.ownerId).toBe(event.ownerId);
    expect(newSeries.timeZone).toBe(event.timeZone);
    expect(newSeries.workspaceId).toBe(event.workspaceId);
  });

  it("preserves kind and Context membership on the split new series", () => {
    const ctx = makeEvent({ kind: "context" });
    expect(splitThisAndFuture(ctx, fromOccurrenceMs, {}).newSeries.kind).toBe("context");

    const child = makeEvent({ categoryId: "cat-1" });
    expect(splitThisAndFuture(child, fromOccurrenceMs, {}).newSeries.categoryId).toBe("cat-1");
  });

  it("inherits the inactive flag from the master, and lets the patch override it", () => {
    const inactiveEvent = makeEvent({ inactive: true });
    expect(
      splitThisAndFuture(inactiveEvent, fromOccurrenceMs, {}).newSeries.inactive,
    ).toBe(true);
    expect(
      splitThisAndFuture(inactiveEvent, fromOccurrenceMs, { inactive: false }).newSeries.inactive,
    ).toBe(false);
  });

  it("does not include id/createdAt/updatedAt on the new series", () => {
    const event = makeEvent();
    const { newSeries } = splitThisAndFuture(event, fromOccurrenceMs, {});
    expect("id" in newSeries).toBe(false);
    expect("createdAt" in newSeries).toBe(false);
    expect("updatedAt" in newSeries).toBe(false);
  });

  it("applies patch.start to the new series and shifts end to preserve duration", () => {
    const event = makeEvent();
    const patchedStart = fromOccurrenceMs + 30 * 60 * 1000;
    const { newSeries } = splitThisAndFuture(event, fromOccurrenceMs, {
      start: patchedStart,
    });
    expect(newSeries.start).toBe(patchedStart);
    expect(newSeries.end - newSeries.start).toBe(baseEnd - baseStart);
  });

  it("uses explicit patch.end when given", () => {
    const event = makeEvent();
    const patchedStart = fromOccurrenceMs + 30 * 60 * 1000;
    const patchedEnd = fromOccurrenceMs + 4 * 60 * 60 * 1000;
    const { newSeries } = splitThisAndFuture(event, fromOccurrenceMs, {
      start: patchedStart,
      end: patchedEnd,
    });
    expect(newSeries.start).toBe(patchedStart);
    expect(newSeries.end).toBe(patchedEnd);
  });

  it("applies non-time patch fields to the new series", () => {
    const event = makeEvent();
    const { newSeries } = splitThisAndFuture(event, fromOccurrenceMs, {
      title: "Reorganized standup",
      location: null,
      categoryId: "cat-2",
    });
    expect(newSeries.title).toBe("Reorganized standup");
    expect(newSeries.location).toBeNull();
    expect(newSeries.categoryId).toBe("cat-2");
    // untouched fields inherited
    expect(newSeries.description).toBe(event.description);
  });

  it("drops a prior COUNT from the original when applying UNTIL", () => {
    const event = makeEvent({ rrule: "FREQ=DAILY;COUNT=20" });
    const { original } = splitThisAndFuture(event, fromOccurrenceMs, {});
    const parsed = RRule.parseString(original.rrule as string);
    expect(parsed.count ?? null).toBeNull();
    expect((parsed.until as Date).getTime()).toBe(fromOccurrenceMs - 1000);
    expect(parsed.freq).toBe(RRule.DAILY);
  });

  it("handles a master with no rrule (single event) gracefully", () => {
    const event = makeEvent({ rrule: null });
    const { original, newSeries } = splitThisAndFuture(
      event,
      fromOccurrenceMs,
      {},
    );
    expect(original.rrule).toBeNull();
    expect(original.recurrenceEndsAt).toBe(fromOccurrenceMs - 1000);
    expect(newSeries.rrule).toBeNull();
    expect(newSeries.start).toBe(fromOccurrenceMs);
  });

  // Core correctness property: expanding the two resulting series must
  // partition occurrences at the split point with no overlap and no gap.
  // The original series must EXCLUDE the split occurrence (half-open);
  // the new series must START exactly at it.
  it("partitions occurrences at the split: original excludes, new includes", () => {
    const event = makeEvent();

    const { original, newSeries } = splitThisAndFuture(
      event,
      fromOccurrenceMs,
      {},
    );

    // Expand the ORIGINAL series with its DTSTART = master start.
    const origOpts = RRule.parseString(original.rrule as string);
    origOpts.dtstart = new Date(event.start);
    const origDates = new RRule(origOpts).all().map((d) => d.getTime());

    expect(origDates).not.toContain(fromOccurrenceMs);
    // Every original occurrence is strictly before the split.
    expect(origDates.every((t) => t < fromOccurrenceMs)).toBe(true);
    // And the last original occurrence is the one just before the split
    // (2026-01-28 10:00Z for this Mon/Wed schedule).
    expect(origDates[origDates.length - 1]).toBe(
      Date.UTC(2026, 0, 28, 10, 0, 0),
    );

    // Expand the NEW series with DTSTART = newSeries.start.
    const newOpts = RRule.parseString(newSeries.rrule as string);
    newOpts.dtstart = new Date(newSeries.start);
    const firstNew = new RRule(newOpts).all((_, i) => i < 1)[0].getTime();
    expect(firstNew).toBe(fromOccurrenceMs);
  });

  it("retains BYDAY (weekday mapping) on both series", () => {
    const event = makeEvent(); // BYDAY=MO,WE
    const { original, newSeries } = splitThisAndFuture(
      event,
      fromOccurrenceMs,
      {},
    );
    // rrule weekday indices: MO=0, WE=2
    const origWd = RRule.parseString(original.rrule as string).byweekday;
    const newWd = RRule.parseString(newSeries.rrule as string).byweekday;
    const norm = (wd: unknown) =>
      (wd as Array<number | { weekday: number }>)
        .map((w) => (typeof w === "number" ? w : w.weekday))
        .sort((a, b) => a - b);
    expect(norm(origWd)).toEqual([0, 2]);
    expect(norm(newWd)).toEqual([0, 2]);
  });

  it("does not mutate the input event", () => {
    const event = makeEvent();
    const snapshot = JSON.parse(JSON.stringify(event));
    splitThisAndFuture(event, fromOccurrenceMs, {
      title: "Changed",
      start: fromOccurrenceMs + 1000,
    });
    expect(event).toEqual(snapshot);
  });
});
