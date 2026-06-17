import { describe, it, expect } from "vitest";
import { filterForInsights } from "@/lib/insights/filters";
import type { Occurrence } from "@/lib/types";

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 5, 1);

function occ(over: Partial<Occurrence>): Occurrence {
  return {
    key: "e:0",
    eventId: "e",
    occurrenceDate: 0,
    start: T0 + 9 * HOUR,
    end: T0 + 10 * HOUR,
    allDay: false,
    inactive: false,
    status: "confirmed",
    title: "t",
    description: null,
    location: null,
    categoryId: null,
    color: null,
    kind: "event",
    ownerId: "me",
    isPrivate: false,
    isShared: false,
    taskId: null,
    attributes: {},
    isRecurring: false,
    isException: false,
    ...over,
  };
}

function filter(
  occs: Occurrence[],
  over: Partial<{
    hiddenCategoryIds: Set<string>;
    includeInactive: boolean;
  }> = {},
) {
  return filterForInsights(occs, {
    viewerId: "me",
    hiddenCategoryIds: new Set(),
    includeInactive: false,
    ...over,
  });
}

describe("filterForInsights", () => {
  it("drops untracked occurrences (all-day, context, inactive)", () => {
    const kept = filter([
      occ({ key: "a" }),
      occ({ key: "b", allDay: true }),
      occ({ key: "c", kind: "context" }),
      occ({ key: "d", inactive: true }),
    ]);
    expect(kept.map((o) => o.key)).toEqual(["a"]);
  });

  it("keeps inactive blocks when includeInactive is set", () => {
    const kept = filter(
      [occ({ key: "a", inactive: true }), occ({ key: "b", allDay: true })],
      { includeInactive: true },
    );
    expect(kept.map((o) => o.key)).toEqual(["a"]);
  });

  it("keeps the viewer's own and joint items, dropping the partner's solo events", () => {
    const occs = [
      occ({ key: "mine" }),
      occ({ key: "theirs", ownerId: "you" }),
      occ({ key: "joint", ownerId: "you", isShared: true }),
    ];
    expect(filter(occs).map((o) => o.key)).toEqual(["mine", "joint"]);
  });

  it("drops hidden categories but never uncategorized items", () => {
    const kept = filter(
      [
        occ({ key: "a", categoryId: "work" }),
        occ({ key: "b", categoryId: "gym" }),
        occ({ key: "c", categoryId: null }),
      ],
      { hiddenCategoryIds: new Set(["work"]) },
    );
    expect(kept.map((o) => o.key)).toEqual(["b", "c"]);
  });

  it("applies all filters in one pass", () => {
    const kept = filter(
      [
        occ({ key: "a", inactive: true, categoryId: "sleep" }),
        occ({ key: "b", inactive: true, categoryId: "hidden" }),
        occ({ key: "c", ownerId: "you" }),
        occ({ key: "d", ownerId: "you", isShared: true, categoryId: "work" }),
      ],
      {
        includeInactive: true,
        hiddenCategoryIds: new Set(["hidden"]),
      },
    );
    // a: viewer-owned inactive (kept). b: hidden category (dropped).
    // c: partner solo (dropped). d: joint, visible category (kept).
    expect(kept.map((o) => o.key)).toEqual(["a", "d"]);
  });
});
