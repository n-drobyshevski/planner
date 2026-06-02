import { describe, it, expect } from "vitest";
import {
  overlaps,
  contextOccurrences,
  enclosingContext,
  categoryIdForRange,
} from "@/lib/calendar/contexts";
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
    taskId: null,
    isRecurring: false,
    isException: false,
    ...over,
  };
}

const H = 3_600_000;

describe("overlaps", () => {
  it("is true for intersecting half-open ranges", () => {
    expect(overlaps({ start: 0, end: 10 }, { start: 5, end: 15 })).toBe(true);
  });
  it("is false for touching endpoints", () => {
    expect(overlaps({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false);
  });
});

describe("contextOccurrences", () => {
  it("keeps only kind === context", () => {
    const list = [
      occ({ start: 0, end: H }),
      occ({ start: 0, end: 8 * H, kind: "context", eventId: "ctx" }),
    ];
    const ctx = contextOccurrences(list);
    expect(ctx).toHaveLength(1);
    expect(ctx[0].eventId).toBe("ctx");
  });
});

describe("enclosingContext", () => {
  const work = occ({ start: 9 * H, end: 17 * H, kind: "context", eventId: "work" });
  const meeting = occ({ start: 10 * H, end: 11 * H, kind: "context", eventId: "meeting" });

  it("returns null when t is inside no context", () => {
    expect(enclosingContext([work], 8 * H)).toBeNull();
  });

  it("returns the context whose range encloses t", () => {
    expect(enclosingContext([work], 12 * H)?.eventId).toBe("work");
  });

  it("excludes the end instant (half-open)", () => {
    expect(enclosingContext([work], 17 * H)).toBeNull();
  });

  it("prefers the tightest context when several overlap", () => {
    expect(enclosingContext([work, meeting], 10.5 * H)?.eventId).toBe("meeting");
  });
});

describe("categoryIdForRange", () => {
  const work = occ({
    start: 9 * H,
    end: 17 * H,
    kind: "context",
    eventId: "work",
    categoryId: "cat-work",
  });

  it("returns the enclosing context's painted category, anchored on start", () => {
    expect(categoryIdForRange([work], 9 * H)).toBe("cat-work");
  });

  it("returns null when the start falls outside every context", () => {
    expect(categoryIdForRange([work], 18 * H)).toBeNull();
  });

  it("returns null for an unlabeled context window (null category)", () => {
    const blank = occ({ start: 9 * H, end: 17 * H, kind: "context", eventId: "blank" });
    expect(categoryIdForRange([blank], 10 * H)).toBeNull();
  });
});
