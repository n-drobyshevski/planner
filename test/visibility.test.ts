import { describe, it, expect } from "vitest";
import { canSee, canEdit, layerOf, filterVisible } from "@/lib/scope/visibility";
import type { Occurrence } from "@/lib/types";

const OWNER = "owner-1";
const OTHER = "other-2";

function occ(over: Partial<Occurrence>): Occurrence {
  return {
    key: "e1:1000",
    eventId: "e1",
    occurrenceDate: 1000,
    start: 1000,
    end: 2000,
    allDay: false,
    inactive: false,
    title: "t",
    description: null,
    location: null,
    categoryId: null,
    color: null,
    kind: "event",
    ownerId: OWNER,
    isPrivate: false,
    taskId: null,
    isRecurring: false,
    isException: false,
    ...over,
  };
}

describe("canSee", () => {
  it("the owner always sees their own item, private or not", () => {
    expect(canSee({ isPrivate: true, ownerId: OWNER }, OWNER)).toBe(true);
    expect(canSee({ isPrivate: false, ownerId: OWNER }, OWNER)).toBe(true);
  });

  it("others see a shared (non-private) item", () => {
    expect(canSee({ isPrivate: false, ownerId: OWNER }, OTHER)).toBe(true);
  });

  it("others cannot see another member's private item", () => {
    expect(canSee({ isPrivate: true, ownerId: OWNER }, OTHER)).toBe(false);
  });
});

describe("canEdit", () => {
  it("only the owner can edit", () => {
    expect(canEdit({ ownerId: OWNER }, OWNER)).toBe(true);
    expect(canEdit({ ownerId: OWNER }, OTHER)).toBe(false);
  });
});

describe("layerOf", () => {
  it("is always the owner's id (no shared layer)", () => {
    expect(layerOf({ ownerId: OWNER })).toBe(OWNER);
    expect(layerOf({ ownerId: OTHER })).toBe(OTHER);
  });
});

describe("filterVisible", () => {
  const none = new Set<string>();

  it("keeps the viewer's own items without overlaying anyone", () => {
    const o = occ({ ownerId: OWNER });
    expect(
      filterVisible([o], { viewerId: OWNER, overlayMemberIds: none, hiddenCategoryIds: none }),
    ).toEqual([o]);
  });

  it("hides another member's items until their calendar is overlaid", () => {
    const o = occ({ ownerId: OTHER });
    expect(
      filterVisible([o], { viewerId: OWNER, overlayMemberIds: none, hiddenCategoryIds: none }),
    ).toEqual([]);
    expect(
      filterVisible([o], {
        viewerId: OWNER,
        overlayMemberIds: new Set([OTHER]),
        hiddenCategoryIds: none,
      }),
    ).toEqual([o]);
  });

  it("hides by category for own items too", () => {
    const o = occ({ ownerId: OWNER, categoryId: "cat-x" });
    expect(
      filterVisible([o], {
        viewerId: OWNER,
        overlayMemberIds: none,
        hiddenCategoryIds: new Set(["cat-x"]),
      }),
    ).toEqual([]);
  });

  it("never hides items with a null categoryId", () => {
    const o = occ({ ownerId: OWNER, categoryId: null });
    expect(
      filterVisible([o], {
        viewerId: OWNER,
        overlayMemberIds: none,
        hiddenCategoryIds: new Set(["cat-x"]),
      }),
    ).toEqual([o]);
  });

  it("hides a context-window backdrop when its painted Context is hidden", () => {
    const window = occ({ ownerId: OWNER, kind: "context", categoryId: "cat-x" });
    expect(
      filterVisible([window], {
        viewerId: OWNER,
        overlayMemberIds: none,
        hiddenCategoryIds: new Set(["cat-x"]),
      }),
    ).toEqual([]);
  });

  it("never hides an unlabeled context window (null categoryId)", () => {
    const window = occ({ ownerId: OWNER, kind: "context", categoryId: null });
    expect(
      filterVisible([window], {
        viewerId: OWNER,
        overlayMemberIds: none,
        hiddenCategoryIds: new Set(["cat-x"]),
      }),
    ).toEqual([window]);
  });

  it("applies all rules together over a mixed list", () => {
    const mineOk = occ({ key: "a:1", eventId: "a", ownerId: OWNER, categoryId: "cat-ok" });
    const mineHiddenCat = occ({ key: "b:1", eventId: "b", ownerId: OWNER, categoryId: "cat-hidden" });
    const otherOverlaid = occ({ key: "c:1", eventId: "c", ownerId: OTHER });
    const otherNotOverlaid = occ({ key: "d:1", eventId: "d", ownerId: "member-3" });

    const out = filterVisible([mineOk, mineHiddenCat, otherOverlaid, otherNotOverlaid], {
      viewerId: OWNER,
      overlayMemberIds: new Set([OTHER]),
      hiddenCategoryIds: new Set(["cat-hidden"]),
    });

    // mine kept; mine-hidden-cat dropped; OTHER overlaid kept; member-3 not overlaid dropped.
    expect(out).toEqual([mineOk, otherOverlaid]);
  });

  it("preserves input order and identity of kept occurrences", () => {
    const a = occ({ key: "a:1", eventId: "a", ownerId: OWNER });
    const b = occ({ key: "b:1", eventId: "b", ownerId: OWNER });
    const c = occ({ key: "c:1", eventId: "c", ownerId: OWNER });
    const out = filterVisible([a, b, c], {
      viewerId: OWNER,
      overlayMemberIds: none,
      hiddenCategoryIds: none,
    });
    expect(out).toEqual([a, b, c]);
    expect(out[0]).toBe(a);
    expect(out[2]).toBe(c);
  });

  it("returns empty for empty input", () => {
    expect(
      filterVisible([], { viewerId: OWNER, overlayMemberIds: none, hiddenCategoryIds: none }),
    ).toEqual([]);
  });

  it("does not mutate the input array or its arguments", () => {
    const a = occ({ key: "a:1", eventId: "a", ownerId: OWNER });
    const b = occ({ key: "b:1", eventId: "b", ownerId: OTHER });
    const input = [a, b];
    const overlayMemberIds = new Set<string>([OTHER]);
    const hiddenCategoryIds = new Set<string>(["cat-x"]);
    filterVisible(input, { viewerId: OWNER, overlayMemberIds, hiddenCategoryIds });
    expect(input).toEqual([a, b]);
    expect(overlayMemberIds).toEqual(new Set([OTHER]));
    expect(hiddenCategoryIds).toEqual(new Set(["cat-x"]));
  });
});
