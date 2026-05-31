import { describe, it, expect } from "vitest";
import {
  canSee,
  canEdit,
  layerOf,
  filterVisible,
} from "@/lib/scope/visibility";
import type { Occurrence, Scope, Visibility } from "@/lib/types";

const OWNER = "owner-1";
const OTHER = "other-2";

const scopes: Scope[] = ["shared", "personal"];
const visibilities: Visibility[] = ["private", "shared"];

function occ(over: Partial<Occurrence>): Occurrence {
  return {
    key: "e1:1000",
    eventId: "e1",
    occurrenceDate: 1000,
    start: 1000,
    end: 2000,
    allDay: false,
    title: "t",
    description: null,
    location: null,
    categoryId: null,
    ownerId: OWNER,
    scope: "shared",
    visibility: "shared",
    taskId: null,
    isRecurring: false,
    isException: false,
    ...over,
  };
}

describe("canSee", () => {
  // Full truth table: scope x visibility x {owner, other}
  it("matches the expected truth table", () => {
    const expected: Record<string, boolean> = {
      // scope|visibility|viewer -> canSee
      "shared|private|owner": true,
      "shared|private|other": true,
      "shared|shared|owner": true,
      "shared|shared|other": true,
      "personal|private|owner": true,
      "personal|private|other": false,
      "personal|shared|owner": true,
      "personal|shared|other": true,
    };

    for (const scope of scopes) {
      for (const visibility of visibilities) {
        for (const [who, viewerId] of [
          ["owner", OWNER],
          ["other", OTHER],
        ] as const) {
          const e = { scope, visibility, ownerId: OWNER };
          const got = canSee(e, viewerId);
          const want = expected[`${scope}|${visibility}|${who}`];
          expect(got, `${scope}|${visibility}|${who}`).toBe(want);
        }
      }
    }
  });

  it("shared scope is always visible regardless of visibility/viewer", () => {
    expect(canSee({ scope: "shared", visibility: "private", ownerId: OWNER }, OTHER)).toBe(true);
    expect(canSee({ scope: "shared", visibility: "shared", ownerId: OWNER }, OTHER)).toBe(true);
  });

  it("owner always sees own personal event even when private", () => {
    expect(canSee({ scope: "personal", visibility: "private", ownerId: OWNER }, OWNER)).toBe(true);
  });

  it("other cannot see another member's private personal event", () => {
    expect(canSee({ scope: "personal", visibility: "private", ownerId: OWNER }, OTHER)).toBe(false);
  });

  it("personal shared event is visible to others", () => {
    expect(canSee({ scope: "personal", visibility: "shared", ownerId: OWNER }, OTHER)).toBe(true);
  });
});

describe("canEdit", () => {
  // Full truth table: scope x {owner, other} (visibility irrelevant)
  it("matches the expected truth table", () => {
    const expected: Record<string, boolean> = {
      "shared|owner": true,
      "shared|other": true,
      "personal|owner": true,
      "personal|other": false,
    };

    for (const scope of scopes) {
      for (const visibility of visibilities) {
        for (const [who, viewerId] of [
          ["owner", OWNER],
          ["other", OTHER],
        ] as const) {
          const e = { scope, ownerId: OWNER };
          const got = canEdit(e, viewerId);
          const want = expected[`${scope}|${who}`];
          expect(got, `${scope}|${who} (vis=${visibility})`).toBe(want);
        }
      }
    }
  });

  it("anyone can edit a shared-scope event", () => {
    expect(canEdit({ scope: "shared", ownerId: OWNER }, OTHER)).toBe(true);
  });

  it("only the owner can edit a personal event", () => {
    expect(canEdit({ scope: "personal", ownerId: OWNER }, OWNER)).toBe(true);
    expect(canEdit({ scope: "personal", ownerId: OWNER }, OTHER)).toBe(false);
  });
});

describe("layerOf", () => {
  it("returns 'shared' for shared-scope items", () => {
    expect(layerOf({ scope: "shared", ownerId: OWNER })).toBe("shared");
    expect(layerOf({ scope: "shared", ownerId: OTHER })).toBe("shared");
  });

  it("returns the ownerId for personal-scope items", () => {
    expect(layerOf({ scope: "personal", ownerId: OWNER })).toBe(OWNER);
    expect(layerOf({ scope: "personal", ownerId: OTHER })).toBe(OTHER);
  });
});

describe("filterVisible", () => {
  it("keeps a shared event when nothing is hidden", () => {
    const o = occ({ scope: "shared", visibility: "private", ownerId: OWNER });
    const out = filterVisible([o], {
      viewerId: OTHER,
      hiddenCategoryIds: new Set(),
      hiddenLayers: new Set(),
    });
    expect(out).toEqual([o]);
  });

  it("hides by layer (shared layer hidden)", () => {
    const o = occ({ scope: "shared", ownerId: OWNER });
    const out = filterVisible([o], {
      viewerId: OTHER,
      hiddenCategoryIds: new Set(),
      hiddenLayers: new Set(["shared"]),
    });
    expect(out).toEqual([]);
  });

  it("hides by layer (member layer hidden)", () => {
    const o = occ({ scope: "personal", visibility: "shared", ownerId: OWNER });
    const out = filterVisible([o], {
      viewerId: OTHER,
      hiddenCategoryIds: new Set(),
      hiddenLayers: new Set([OWNER]),
    });
    expect(out).toEqual([]);
  });

  it("hides by category", () => {
    const o = occ({ scope: "shared", ownerId: OWNER, categoryId: "cat-x" });
    const out = filterVisible([o], {
      viewerId: OTHER,
      hiddenCategoryIds: new Set(["cat-x"]),
      hiddenLayers: new Set(),
    });
    expect(out).toEqual([]);
  });

  it("does not hide items with null categoryId even if some categories are hidden", () => {
    const o = occ({ scope: "shared", ownerId: OWNER, categoryId: null });
    const out = filterVisible([o], {
      viewerId: OTHER,
      hiddenCategoryIds: new Set(["cat-x"]),
      hiddenLayers: new Set(),
    });
    expect(out).toEqual([o]);
  });

  it("drops another member's private personal event (canSee=false)", () => {
    const o = occ({ scope: "personal", visibility: "private", ownerId: OWNER });
    const out = filterVisible([o], {
      viewerId: OTHER,
      hiddenCategoryIds: new Set(),
      hiddenLayers: new Set(),
    });
    expect(out).toEqual([]);
  });

  it("keeps the owner's own private personal event", () => {
    const o = occ({ scope: "personal", visibility: "private", ownerId: OWNER });
    const out = filterVisible([o], {
      viewerId: OWNER,
      hiddenCategoryIds: new Set(),
      hiddenLayers: new Set(),
    });
    expect(out).toEqual([o]);
  });

  it("applies all rules together over a mixed list", () => {
    const sharedVisible = occ({ key: "a:1", eventId: "a", scope: "shared", ownerId: OWNER, categoryId: "cat-ok" });
    const sharedHiddenCat = occ({ key: "b:1", eventId: "b", scope: "shared", ownerId: OWNER, categoryId: "cat-hidden" });
    const ownerLayerHidden = occ({ key: "c:1", eventId: "c", scope: "personal", visibility: "shared", ownerId: OWNER });
    const othersPrivate = occ({ key: "d:1", eventId: "d", scope: "personal", visibility: "private", ownerId: "member-3" });
    const myPersonal = occ({ key: "e:1", eventId: "e", scope: "personal", visibility: "private", ownerId: OTHER });

    const out = filterVisible(
      [sharedVisible, sharedHiddenCat, ownerLayerHidden, othersPrivate, myPersonal],
      {
        viewerId: OTHER,
        hiddenCategoryIds: new Set(["cat-hidden"]),
        hiddenLayers: new Set([OWNER]),
      },
    );

    // sharedVisible kept; sharedHiddenCat dropped (category); ownerLayerHidden
    // dropped (layer); othersPrivate dropped (canSee=false); myPersonal kept.
    expect(out).toEqual([sharedVisible, myPersonal]);
  });

  it("returns empty for empty input", () => {
    expect(
      filterVisible([], {
        viewerId: OTHER,
        hiddenCategoryIds: new Set(),
        hiddenLayers: new Set(),
      }),
    ).toEqual([]);
  });

  it("preserves input order and identity of kept occurrences", () => {
    const a = occ({ key: "a:1", eventId: "a", scope: "shared", ownerId: OWNER });
    const b = occ({ key: "b:1", eventId: "b", scope: "shared", ownerId: OWNER });
    const c = occ({ key: "c:1", eventId: "c", scope: "shared", ownerId: OWNER });
    const out = filterVisible([a, b, c], {
      viewerId: OTHER,
      hiddenCategoryIds: new Set(),
      hiddenLayers: new Set(),
    });
    expect(out).toEqual([a, b, c]);
    // same references, not clones
    expect(out[0]).toBe(a);
    expect(out[2]).toBe(c);
  });

  it("hides the viewer's OWN personal item when its (own) layer is hidden", () => {
    // canSee is true (owner), but the member layer is toggled off in the UI.
    const o = occ({ scope: "personal", visibility: "private", ownerId: OWNER });
    const out = filterVisible([o], {
      viewerId: OWNER,
      hiddenCategoryIds: new Set(),
      hiddenLayers: new Set([OWNER]),
    });
    expect(out).toEqual([]);
  });

  it("category hiding only affects the matching category, not others or null", () => {
    const hidden = occ({ key: "h:1", eventId: "h", scope: "shared", ownerId: OWNER, categoryId: "cat-hidden" });
    const otherCat = occ({ key: "o:1", eventId: "o", scope: "shared", ownerId: OWNER, categoryId: "cat-other" });
    const noCat = occ({ key: "n:1", eventId: "n", scope: "shared", ownerId: OWNER, categoryId: null });
    const out = filterVisible([hidden, otherCat, noCat], {
      viewerId: OTHER,
      hiddenCategoryIds: new Set(["cat-hidden"]),
      hiddenLayers: new Set(),
    });
    expect(out).toEqual([otherCat, noCat]);
  });

  it("a personal-shared item is visible to others but still subject to its member layer", () => {
    // canSee true (personal + shared), and layer is the owner's id, NOT 'shared'.
    const o = occ({ scope: "personal", visibility: "shared", ownerId: OWNER });
    // not hidden when only the 'shared' layer is toggled off
    expect(
      filterVisible([o], {
        viewerId: OTHER,
        hiddenCategoryIds: new Set(),
        hiddenLayers: new Set(["shared"]),
      }),
    ).toEqual([o]);
    // hidden when the owner's member layer is toggled off
    expect(
      filterVisible([o], {
        viewerId: OTHER,
        hiddenCategoryIds: new Set(),
        hiddenLayers: new Set([OWNER]),
      }),
    ).toEqual([]);
  });

  it("does not mutate the input array or its arguments", () => {
    const a = occ({ key: "a:1", eventId: "a", scope: "shared", ownerId: OWNER });
    const b = occ({ key: "b:1", eventId: "b", scope: "personal", visibility: "private", ownerId: "member-9" });
    const input = [a, b];
    const hiddenCategoryIds = new Set<string>(["cat-x"]);
    const hiddenLayers = new Set<string>(["shared"]);
    filterVisible(input, { viewerId: OTHER, hiddenCategoryIds, hiddenLayers });
    expect(input).toEqual([a, b]);
    expect(hiddenCategoryIds).toEqual(new Set(["cat-x"]));
    expect(hiddenLayers).toEqual(new Set(["shared"]));
  });
});
