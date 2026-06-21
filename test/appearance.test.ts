import { describe, it, expect } from "vitest";
import {
  accentIdForHex,
  eventFillStyle,
  normalizePalette,
  normalizePinkBase,
  paletteMode,
  toPaletteStroke,
  PALETTES,
  PINK_PRESETS,
  DEFAULT_PINK_BASE,
} from "@/lib/theme/appearance";
import {
  serializeAppearance,
  APPEARANCE_INIT_SCRIPT,
} from "@/lib/theme/appearance-cookie";

describe("toPaletteStroke", () => {
  // Flows strokes: map to the swatch var, then defer lightness/chroma to the
  // palette's --flow-stroke-l/-c (unset = identity via the `l`/`c` keywords).
  it("wraps a known accent in its swatch var, re-lit by the flow-stroke vars", () => {
    expect(toPaletteStroke("#0f766e")).toBe(
      "oklch(from var(--swatch-teal) var(--flow-stroke-l, l) var(--flow-stroke-c, c) h)",
    );
  });

  it("passes a custom (non-accent) hex straight through, still re-littable", () => {
    expect(toPaletteStroke("#123456")).toBe(
      "oklch(from #123456 var(--flow-stroke-l, l) var(--flow-stroke-c, c) h)",
    );
  });
});

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

describe("accentIdForHex", () => {
  it("resolves the current (lightened) swatch hex to its token", () => {
    expect(accentIdForHex("#23827a")).toBe("teal"); // current teal
    expect(accentIdForHex("#c54e2f")).toBe("peach"); // current peach
  });

  it("still resolves the pre-lightening (legacy) hex to the same token", () => {
    expect(accentIdForHex("#0f766e")).toBe("teal"); // legacy teal
    expect(accentIdForHex("#c0492a")).toBe("peach"); // legacy peach
  });

  it("is case-insensitive and returns undefined for custom/empty colors", () => {
    expect(accentIdForHex("#C0492A")).toBe("peach");
    expect(accentIdForHex("#123456")).toBeUndefined();
    expect(accentIdForHex(null)).toBeUndefined();
    expect(accentIdForHex(undefined)).toBeUndefined();
  });
});

describe("pink palette", () => {
  it("is a registered palette and normalizes from a string", () => {
    expect(PALETTES.some((p) => p.id === "pink")).toBe(true);
    expect(normalizePalette("pink")).toBe("pink");
    expect(normalizePalette("nope")).toBe("default");
  });

  it("defers light/dark to the member (paletteMode === null), unlike Catppuccin", () => {
    expect(paletteMode("pink")).toBeNull();
    expect(paletteMode("default")).toBeNull();
    expect(paletteMode("catppuccin-latte")).toBe("light");
    expect(paletteMode("catppuccin-mocha")).toBe("dark");
  });

  it("normalizePinkBase accepts #rrggbb (lowercased), rejects junk → null", () => {
    expect(normalizePinkBase("#EC4899")).toBe("#ec4899");
    expect(normalizePinkBase("#abc")).toBeNull(); // shorthand not allowed
    expect(normalizePinkBase("ec4899")).toBeNull(); // missing #
    expect(normalizePinkBase("red")).toBeNull();
    expect(normalizePinkBase(null)).toBeNull();
    expect(normalizePinkBase(undefined)).toBeNull();
  });

  it("every preset value is a valid base and the default matches a preset", () => {
    for (const p of PINK_PRESETS) expect(normalizePinkBase(p.value)).toBe(p.value);
    expect(PINK_PRESETS.some((p) => p.value === DEFAULT_PINK_BASE)).toBe(true);
  });
});

describe("appearance cookie", () => {
  it("serializes a 4-field tuple, empty 4th slot when pinkBase is null", () => {
    expect(serializeAppearance("stone", "warm", "default", null)).toBe(
      "stone~warm~default~",
    );
    expect(serializeAppearance("stone", "warm", "pink", "#ec4899")).toBe(
      "stone~warm~pink~#ec4899",
    );
  });

  it("init script reads a 4th field and only paints --pink-base under the pink palette", () => {
    // Pink palette + a valid base → sets the var; the regex/hex guard is inline.
    expect(APPEARANCE_INIT_SCRIPT).toContain('pal==="pink"');
    expect(APPEARANCE_INIT_SCRIPT).toContain("setProperty(\"--pink-base\"");
    // Tolerates the legacy 3-field cookie (no hard length===3 check).
    expect(APPEARANCE_INIT_SCRIPT).toContain("p.length<3");
  });
});
