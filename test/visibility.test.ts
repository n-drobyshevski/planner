import { describe, it, expect } from "vitest";
import {
  canSee,
  canEdit,
  layerOf,
  filterVisible,
  publicVisible,
  redactForPublic,
  filterPublic,
  MAX_PUBLIC_CONFIG,
  PUBLIC_BUSY_LABEL,
  type PublicShareConfig,
} from "@/lib/scope/visibility";
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
    status: "confirmed",
    title: "t",
    description: null,
    location: null,
    categoryId: null,
    color: null,
    kind: "event",
    ownerId: OWNER,
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

describe("canSee", () => {
  it("the owner always sees their own item, private or not", () => {
    expect(canSee({ isPrivate: true, ownerId: OWNER, isShared: false }, OWNER)).toBe(true);
    expect(canSee({ isPrivate: false, ownerId: OWNER, isShared: false }, OWNER)).toBe(true);
  });

  it("others see a shared (non-private) item", () => {
    expect(canSee({ isPrivate: false, ownerId: OWNER, isShared: false }, OTHER)).toBe(true);
  });

  it("others cannot see another member's private item", () => {
    expect(canSee({ isPrivate: true, ownerId: OWNER, isShared: false }, OTHER)).toBe(false);
  });
});

describe("canEdit", () => {
  it("only the owner can edit", () => {
    expect(canEdit({ ownerId: OWNER, isShared: false }, OWNER)).toBe(true);
    expect(canEdit({ ownerId: OWNER, isShared: false }, OTHER)).toBe(false);
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
      filterVisible([o], { viewerId: OWNER, overlayMemberIds: none, hiddenCategoryIds: none, selfHidden: false }),
    ).toEqual([o]);
  });

  it("hides another member's items until their calendar is overlaid", () => {
    const o = occ({ ownerId: OTHER });
    expect(
      filterVisible([o], { viewerId: OWNER, overlayMemberIds: none, hiddenCategoryIds: none, selfHidden: false }),
    ).toEqual([]);
    expect(
      filterVisible([o], {
        viewerId: OWNER,
        overlayMemberIds: new Set([OTHER]),
        hiddenCategoryIds: none,
        selfHidden: false,
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
        selfHidden: false,
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
        selfHidden: false,
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
        selfHidden: false,
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
        selfHidden: false,
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
      selfHidden: false,
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
      selfHidden: false,
    });
    expect(out).toEqual([a, b, c]);
    expect(out[0]).toBe(a);
    expect(out[2]).toBe(c);
  });

  it("hides the viewer's own personal items when selfHidden is set", () => {
    const mine = occ({ ownerId: OWNER });
    expect(
      filterVisible([mine], {
        viewerId: OWNER,
        overlayMemberIds: none,
        hiddenCategoryIds: none,
        selfHidden: true,
      }),
    ).toEqual([]);
  });

  it("still shows the viewer's own JOINT items when selfHidden is set", () => {
    const mineJoint = occ({ ownerId: OWNER, isShared: true });
    expect(
      filterVisible([mineJoint], {
        viewerId: OWNER,
        overlayMemberIds: none,
        hiddenCategoryIds: none,
        selfHidden: true,
      }),
    ).toEqual([mineJoint]);
  });

  it("selfHidden leaves overlaid members' items visible (only my own layer hides)", () => {
    const mine = occ({ key: "a:1", eventId: "a", ownerId: OWNER });
    const theirs = occ({ key: "b:1", eventId: "b", ownerId: OTHER });
    expect(
      filterVisible([mine, theirs], {
        viewerId: OWNER,
        overlayMemberIds: new Set([OTHER]),
        hiddenCategoryIds: none,
        selfHidden: true,
      }),
    ).toEqual([theirs]);
  });

  it("returns empty for empty input", () => {
    expect(
      filterVisible([], { viewerId: OWNER, overlayMemberIds: none, hiddenCategoryIds: none, selfHidden: false }),
    ).toEqual([]);
  });

  it("does not mutate the input array or its arguments", () => {
    const a = occ({ key: "a:1", eventId: "a", ownerId: OWNER });
    const b = occ({ key: "b:1", eventId: "b", ownerId: OTHER });
    const input = [a, b];
    const overlayMemberIds = new Set<string>([OTHER]);
    const hiddenCategoryIds = new Set<string>(["cat-x"]);
    filterVisible(input, { viewerId: OWNER, overlayMemberIds, hiddenCategoryIds, selfHidden: false });
    expect(input).toEqual([a, b]);
    expect(overlayMemberIds).toEqual(new Set([OTHER]));
    expect(hiddenCategoryIds).toEqual(new Set(["cat-x"]));
  });
});

describe("joint events (filed under a Shared context)", () => {
  const none = new Set<string>();

  it("canSee: the other member sees a joint event even if it is marked private", () => {
    expect(canSee({ isPrivate: true, ownerId: OWNER, isShared: true }, OTHER)).toBe(true);
  });

  it("canEdit: the other member can edit a joint event", () => {
    expect(canEdit({ ownerId: OWNER, isShared: true }, OTHER)).toBe(true);
  });

  it("canEdit: a non-shared item is still owner-only", () => {
    expect(canEdit({ ownerId: OWNER, isShared: false }, OTHER)).toBe(false);
  });

  it("filterVisible: keeps another member's joint event WITHOUT overlaying their calendar", () => {
    const o = occ({ ownerId: OTHER, isShared: true });
    expect(
      filterVisible([o], { viewerId: OWNER, overlayMemberIds: none, hiddenCategoryIds: none, selfHidden: false }),
    ).toEqual([o]);
  });

  it("filterVisible: still hides a joint event when its shared context is hidden", () => {
    const o = occ({ ownerId: OTHER, isShared: true, categoryId: "cat-x" });
    expect(
      filterVisible([o], {
        viewerId: OWNER,
        overlayMemberIds: none,
        hiddenCategoryIds: new Set(["cat-x"]),
        selfHidden: false,
      }),
    ).toEqual([]);
  });
});

// --- Phase 4: the PUBLIC rung ----------------------------------------------

const DETAILS_ALL: PublicShareConfig = { mode: "details", categoryIds: null };
const BUSY_ALL: PublicShareConfig = { mode: "busy", categoryIds: null };

describe("publicVisible", () => {
  it("a private item is NEVER public, under any config", () => {
    const e = { isPrivate: true, hiddenFromPublic: false, inactive: false, categoryId: null };
    expect(publicVisible(e, DETAILS_ALL)).toBe(false);
    expect(publicVisible(e, BUSY_ALL)).toBe(false);
    expect(publicVisible({ ...e, categoryId: "cat-x" }, { mode: "details", categoryIds: ["cat-x"] })).toBe(false);
  });

  it("a hidden-from-public item is NEVER public, even when non-private", () => {
    const e = { isPrivate: false, hiddenFromPublic: true, inactive: false, categoryId: "cat-x" };
    expect(publicVisible(e, DETAILS_ALL)).toBe(false);
    expect(publicVisible(e, { mode: "details", categoryIds: ["cat-x"] })).toBe(false);
  });

  it("an inactive block (sleep/holds) is never public", () => {
    const e = { isPrivate: false, hiddenFromPublic: false, inactive: true, categoryId: null };
    expect(publicVisible(e, DETAILS_ALL)).toBe(false);
  });

  it("a plain non-private item is public when categoryIds is null (all)", () => {
    expect(
      publicVisible({ isPrivate: false, hiddenFromPublic: false, inactive: false, categoryId: null }, DETAILS_ALL),
    ).toBe(true);
    expect(
      publicVisible({ isPrivate: false, hiddenFromPublic: false, inactive: false, categoryId: "cat-x" }, DETAILS_ALL),
    ).toBe(true);
  });

  it("a category allow-list shows only listed categories", () => {
    const base = { isPrivate: false, hiddenFromPublic: false, inactive: false };
    const cfg: PublicShareConfig = { mode: "details", categoryIds: ["cat-ok"] };
    expect(publicVisible({ ...base, categoryId: "cat-ok" }, cfg)).toBe(true);
    expect(publicVisible({ ...base, categoryId: "cat-no" }, cfg)).toBe(false);
  });

  it("an allow-list excludes uncategorized (null category) items", () => {
    expect(
      publicVisible(
        { isPrivate: false, hiddenFromPublic: false, inactive: false, categoryId: null },
        { mode: "details", categoryIds: ["cat-ok"] },
      ),
    ).toBe(false);
  });
});

describe("redactForPublic", () => {
  it("details mode returns the occurrence unchanged (same reference)", () => {
    const o = occ({ title: "Dentist", description: "molar", location: "Clinic" });
    expect(redactForPublic(o, DETAILS_ALL)).toBe(o);
  });

  it("busy mode redacts title to the generic label and strips description/location", () => {
    const o = occ({ title: "Dentist", description: "molar", location: "Clinic" });
    const r = redactForPublic(o, BUSY_ALL);
    expect(r.title).toBe(PUBLIC_BUSY_LABEL);
    expect(r.description).toBeNull();
    expect(r.location).toBeNull();
    // time/identity preserved so the block still renders where it should
    expect(r.start).toBe(o.start);
    expect(r.end).toBe(o.end);
    expect(r.key).toBe(o.key);
  });
});

describe("filterPublic (present-mode parity)", () => {
  it("drops private/hidden/inactive and keeps the rest, redacting per mode", () => {
    const list = [
      occ({ key: "a:1", eventId: "a", title: "Standup", isPrivate: true }),
      occ({ key: "b:1", eventId: "b", title: "Lunch", hiddenFromPublic: true }),
      occ({ key: "c:1", eventId: "c", title: "Sleep", inactive: true }),
      occ({ key: "d:1", eventId: "d", title: "Gym" }),
    ];
    const details = filterPublic(list, DETAILS_ALL);
    expect(details.map((o) => o.title)).toEqual(["Gym"]);

    const busy = filterPublic(list, BUSY_ALL);
    expect(busy.map((o) => o.title)).toEqual([PUBLIC_BUSY_LABEL]);
  });

  it("present mode (filterPublic with MAX_PUBLIC_CONFIG) equals the publicVisible filter", () => {
    // Present mode and the public link must agree on what's exposed. Build a mixed
    // list and assert the present-mode slice == the raw publicVisible predicate.
    const list = [
      occ({ key: "a:1", eventId: "a", isPrivate: true }),
      occ({ key: "b:1", eventId: "b", hiddenFromPublic: true }),
      occ({ key: "c:1", eventId: "c", inactive: true }),
      occ({ key: "d:1", eventId: "d", categoryId: "work" }),
      occ({ key: "e:1", eventId: "e", categoryId: null }),
    ];
    const present = filterPublic(list, MAX_PUBLIC_CONFIG).map((o) => o.key);
    const expected = list.filter((o) => publicVisible(o, MAX_PUBLIC_CONFIG)).map((o) => o.key);
    expect(present).toEqual(expected);
    expect(present).toEqual(["d:1", "e:1"]);
  });
});
