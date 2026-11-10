import { describe, expect, it } from "vitest";
import { collectTags, normalizeTag, normalizeTags, MAX_TAGS, MAX_TAG_LENGTH } from "@/lib/tasks/tags";

describe("normalizeTag", () => {
  it("lowercases, trims, drops leading hashes and joins words", () => {
    expect(normalizeTag("  #Диплом ")).toBe("диплом");
    expect(normalizeTag("Deep Work")).toBe("deep-work");
    expect(normalizeTag("##x")).toBe("x");
  });

  it("never leaves a leading hash, comma or space behind", () => {
    for (const raw of ["# #work", ",#work", " , # work", "#,#work"]) {
      expect(normalizeTag(raw)).toBe("work");
    }
    expect(normalizeTag("a,b")).toBe("a-b");
  });

  it("returns null when nothing is left, and for non-strings", () => {
    for (const raw of ["", "  ", "#", "# ,", 5, null, undefined]) {
      expect(normalizeTag(raw)).toBeNull();
    }
  });

  it("clips to the length the database accepts", () => {
    expect(normalizeTag("x".repeat(100))).toHaveLength(MAX_TAG_LENGTH);
  });
});

describe("normalizeTags", () => {
  it("dedupes after normalising, keeps order and caps the count", () => {
    expect(normalizeTags(["#A", "a", "b", 3, ""])).toEqual(["a", "b"]);
    expect(normalizeTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(MAX_TAGS);
  });
});

describe("collectTags", () => {
  it("orders by use, then alphabetically", () => {
    expect(collectTags([{ tags: ["b", "a"] }, { tags: ["b"] }, { tags: ["c"] }])).toEqual(["b", "a", "c"]);
  });
});
