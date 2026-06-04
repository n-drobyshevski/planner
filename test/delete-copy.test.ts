import { describe, it, expect } from "vitest";
import { sharedRemovalNote } from "@/lib/calendar/delete-copy";

describe("sharedRemovalNote", () => {
  it("personal event -> no extra note", () => {
    expect(sharedRemovalNote(false, "Sam")).toBeUndefined();
    expect(sharedRemovalNote(false, null)).toBeUndefined();
  });

  it("joint event -> names the partner whose calendar it also leaves", () => {
    expect(sharedRemovalNote(true, "Sam")).toBe(
      "Also removed from Sam's calendar.",
    );
  });

  it("joint event with no known partner -> generic shared-calendar copy", () => {
    expect(sharedRemovalNote(true, null)).toBe(
      "Also removed from the shared calendar.",
    );
  });
});
