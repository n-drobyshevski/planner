import { describe, it, expect } from "vitest";
import { eventFillStyle } from "@/lib/theme/appearance";

describe("eventFillStyle", () => {
  // A known accent hex (teal is in the ACCENTS catalog) maps to its palette var
  // so it re-tints with Catppuccin flavors.
  const TEAL = "#0f766e";

  it("filled (my / shared events): solid swatch, matching ink, no border", () => {
    expect(eventFillStyle(TEAL, false)).toEqual({
      backgroundColor: "var(--swatch-teal)",
      borderColor: "transparent",
      color: "var(--swatch-ink-teal, var(--swatch-ink))",
    });
  });

  it("outlined (other member's read-only event): solid calendar-background fill, colored border, theme ink", () => {
    expect(eventFillStyle(TEAL, true)).toEqual({
      // Opaque fill matching the calendar background, so it reads as a hollow
      // card rather than a see-through wash.
      backgroundColor: "var(--background)",
      borderColor: "var(--swatch-teal)",
      // Theme foreground (not white-on-fill) keeps outlined blocks legible in
      // both light and dark mode.
      color: "var(--foreground)",
    });
  });

  it("passes unknown/custom hexes through unchanged (still background-filled when outlined)", () => {
    const CUSTOM = "#123456";
    expect(eventFillStyle(CUSTOM, false)).toMatchObject({
      backgroundColor: "#123456",
      borderColor: "transparent",
      color: "var(--swatch-ink)",
    });
    expect(eventFillStyle(CUSTOM, true)).toMatchObject({
      backgroundColor: "var(--background)",
      borderColor: "#123456",
      color: "var(--foreground)",
    });
  });
});
