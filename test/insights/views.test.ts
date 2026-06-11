import { describe, it, expect } from "vitest";
import {
  encodeViewConfig,
  parseViewConfig,
  type SavedViewConfig,
} from "@/lib/insights/views";

const FULL: SavedViewConfig = {
  preset: "custom",
  customFrom: Date.UTC(2026, 4, 1),
  customTo: Date.UTC(2026, 4, 31),
  granularity: "week",
  member: "me",
  hiddenCategoryIds: ["a", "b"],
  includeInactive: true,
};

describe("parseViewConfig — lenient read", () => {
  it("round-trips an encoded config", () => {
    expect(parseViewConfig(encodeViewConfig(FULL))).toEqual(FULL);
  });

  it("defaults missing optional fields", () => {
    const parsed = parseViewConfig({ preset: "this-week", granularity: "day" });
    expect(parsed).toEqual({
      preset: "this-week",
      granularity: "day",
      member: "both",
      hiddenCategoryIds: [],
      includeInactive: false,
    });
  });

  it("degrades junk optional fields to defaults instead of failing", () => {
    const parsed = parseViewConfig({
      preset: "last-30d",
      granularity: "week",
      member: "everyone", // unknown → default
      hiddenCategoryIds: "nope", // junk → []
      includeInactive: "yes", // junk → false
      customFrom: "March", // junk → dropped
    });
    expect(parsed).toEqual({
      preset: "last-30d",
      granularity: "week",
      member: "both",
      hiddenCategoryIds: [],
      includeInactive: false,
    });
  });

  it("returns null for unusable configs (unknown preset/granularity, non-objects)", () => {
    expect(parseViewConfig({ preset: "next-week", granularity: "day" })).toBeNull();
    expect(parseViewConfig({ preset: "this-week", granularity: "hour" })).toBeNull();
    expect(parseViewConfig(null)).toBeNull();
    expect(parseViewConfig("view")).toBeNull();
    expect(parseViewConfig(42)).toBeNull();
  });

  it("drops custom-range fields for non-custom presets", () => {
    const parsed = parseViewConfig({
      preset: "this-month",
      granularity: "day",
      customFrom: Date.UTC(2026, 0, 1),
      customTo: Date.UTC(2026, 0, 31),
    });
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty("customFrom");
    expect(parsed).not.toHaveProperty("customTo");
  });
});

describe("encodeViewConfig — canonical write", () => {
  it("strips custom-range fields when preset is not custom", () => {
    const encoded = encodeViewConfig({ ...FULL, preset: "last-90d" });
    expect(encoded).not.toHaveProperty("customFrom");
    expect(encoded).not.toHaveProperty("customTo");
  });

  it("copies hiddenCategoryIds (no shared references into the store)", () => {
    const encoded = encodeViewConfig(FULL);
    expect(encoded.hiddenCategoryIds).toEqual(FULL.hiddenCategoryIds);
    expect(encoded.hiddenCategoryIds).not.toBe(FULL.hiddenCategoryIds);
  });
});
