import { describe, it, expect } from "vitest";
import { eventFillStyle } from "@/lib/theme/appearance";

describe("eventFillStyle", () => {
  // A known accent hex (teal is in the ACCENTS catalog) maps to its palette var
  // so it re-tints with Catppuccin flavors.
  const TEAL = "#0f766e";

  it("filled (my / shared events): chroma-trimmed swatch, matching ink, no border", () => {
    expect(eventFillStyle(TEAL, false)).toEqual({
      // Chroma trimmed ~15% (lightness held) to calm saturation without changing
      // the ink contrast; still re-tints with Catppuccin via the swatch var.
      backgroundColor: "oklch(from var(--swatch-teal) l calc(c * 0.85) h)",
      borderColor: "transparent",
      color: "var(--swatch-ink-teal, var(--swatch-ink))",
    });
  });

  it("inactive (sleep / blocked hours): faint wash, hairline tint border, ink text, flat", () => {
    expect(eventFillStyle(TEAL, false, true)).toEqual({
      backgroundColor: "color-mix(in oklab, var(--swatch-teal) 18%, var(--card))",
      borderColor: "color-mix(in oklab, var(--swatch-teal) 36%, var(--border))",
      color: "var(--foreground)",
      boxShadow: "none",
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
      backgroundColor: "oklch(from #123456 l calc(c * 0.85) h)",
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
