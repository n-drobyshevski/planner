import { describe, expect, it } from "vitest";

import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_META,
  attributesEqual,
  hasAnyAttribute,
  itemAttributesSchema,
  parseAttributes,
  setAttribute,
  type ItemAttributes,
} from "@/lib/attributes/schema";

describe("parseAttributes", () => {
  it("returns {} for non-object values", () => {
    expect(parseAttributes(null)).toEqual({});
    expect(parseAttributes(undefined)).toEqual({});
    expect(parseAttributes("nope")).toEqual({});
    expect(parseAttributes(42)).toEqual({});
    expect(parseAttributes([1, 2])).toEqual({});
  });

  it("round-trips a full valid set", () => {
    const full = {
      energy: 2,
      flexibility: "movable",
      focus: "deep",
      satisfaction: 4,
    };
    expect(parseAttributes(full)).toEqual(full);
  });

  it("drops an invalid known key but keeps valid siblings and unknown keys", () => {
    const parsed = parseAttributes({
      energy: 5, // invalid (1..4)
      flexibility: "rigid", // invalid enum
      focus: "deep",
      mood: "calm", // unknown key from a future client
    });
    expect(parsed).toEqual({ focus: "deep", mood: "calm" });
  });

  it("drops known keys of the wrong type", () => {
    expect(parseAttributes({ satisfaction: "5", energy: 1.5 })).toEqual({});
  });
});

describe("setAttribute", () => {
  it("sets a key without mutating the input", () => {
    const before: ItemAttributes = { focus: "deep" };
    const after = setAttribute(before, "energy", 3);
    expect(after).toEqual({ focus: "deep", energy: 3 });
    expect(before).toEqual({ focus: "deep" });
  });

  it("overwrites an existing value", () => {
    expect(setAttribute({ energy: 1 }, "energy", 2)).toEqual({ energy: 2 });
  });

  it("clears with undefined by deleting the key (never null)", () => {
    const cleared = setAttribute({ energy: 2, focus: "deep" }, "energy", undefined);
    expect(cleared).toEqual({ focus: "deep" });
    expect("energy" in cleared).toBe(false);
  });

  it("preserves unknown keys", () => {
    const next = setAttribute({ mood: "calm" } as ItemAttributes, "satisfaction", 4);
    expect(next).toEqual({ mood: "calm", satisfaction: 4 });
  });
});

describe("hasAnyAttribute", () => {
  it("is false for empty and unknown-only objects", () => {
    expect(hasAnyAttribute({})).toBe(false);
    expect(hasAnyAttribute({ mood: "calm" } as ItemAttributes)).toBe(false);
  });

  it("is true when any known key is set", () => {
    expect(hasAnyAttribute({ focus: "shallow" })).toBe(true);
    expect(hasAnyAttribute({ satisfaction: 1 })).toBe(true);
  });
});

describe("attributesEqual", () => {
  it("compares known keys regardless of order and ignores unknown keys", () => {
    expect(attributesEqual({ energy: 2, focus: "deep" }, { focus: "deep", energy: 2 })).toBe(true);
    expect(
      attributesEqual({ energy: 2, mood: "calm" } as ItemAttributes, { energy: 2 }),
    ).toBe(true);
  });

  it("detects differences and missing keys", () => {
    expect(attributesEqual({ energy: 2 }, { energy: 3 })).toBe(false);
    expect(attributesEqual({ energy: 2 }, {})).toBe(false);
    expect(attributesEqual({}, { satisfaction: 4 })).toBe(false);
  });
});

describe("itemAttributesSchema (write side)", () => {
  it("accepts empty objects and unknown keys", () => {
    expect(itemAttributesSchema.safeParse({}).success).toBe(true);
    const result = itemAttributesSchema.safeParse({ mood: "calm" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ mood: "calm" });
  });

  it("rejects invalid known values", () => {
    expect(itemAttributesSchema.safeParse({ energy: 0 }).success).toBe(false);
    expect(itemAttributesSchema.safeParse({ flexibility: "rigid" }).success).toBe(false);
    expect(itemAttributesSchema.safeParse({ satisfaction: 6 }).success).toBe(false);
  });

  it("keeps unknown keys through a full edit round-trip", () => {
    const fromDb = parseAttributes({ mood: "calm", energy: 1 });
    const edited = setAttribute(fromDb, "energy", 3);
    const written = itemAttributesSchema.parse(edited);
    expect(written).toEqual({ mood: "calm", energy: 3 });
  });
});

describe("ATTRIBUTE_META", () => {
  it("covers every key in display order with decodable options", () => {
    expect(ATTRIBUTE_META.map((m) => m.key)).toEqual([...ATTRIBUTE_KEYS]);
    for (const meta of ATTRIBUTE_META) {
      expect(meta.options.length).toBeGreaterThanOrEqual(2);
      for (const opt of meta.options) {
        const decoded = meta.decode(opt.value);
        // decoding an option then writing it must be valid
        expect(
          itemAttributesSchema.safeParse({ [meta.key]: decoded }).success,
        ).toBe(true);
        // and the string round-trips
        expect(String(decoded)).toBe(opt.value);
      }
    }
  });
});
