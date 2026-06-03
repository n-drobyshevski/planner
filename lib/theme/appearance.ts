// Appearance preset catalogs — the single source of truth the Settings UI and
// the server layout share. The actual color values live in app/globals.css as
// [data-accent="…"] / [data-tone="…"] overrides; here we keep only the ids,
// human labels, and a representative swatch for the picker dots.

import type {
  AccentId,
  EventStatus,
  Palette,
  SurfaceTone,
  ThemePreference,
} from "@/lib/types";

export const DEFAULT_THEME: ThemePreference = "system";
export const DEFAULT_ACCENT: AccentId = "peach";
export const DEFAULT_TONE: SurfaceTone = "warm";
export const DEFAULT_PALETTE: Palette = "default";

export interface AccentPreset {
  id: AccentId;
  label: string;
  /** The default-(warm)-palette light hex — the picker dot's color in the default
   *  palette and the reverse-map key for adapting stored item colors. Catppuccin
   *  flavors remap it via the --swatch-* vars in globals.css. */
  swatch: string;
}

/**
 * The 14 Catppuccin accent colors (Catppuccin's canonical order). `swatch` is the
 * warm default-palette interpretation of each; `peach` (the brand terracotta) is
 * the default and lives in :root. The literal Catppuccin hex per flavor lives in
 * the [data-palette="catppuccin-*"] --swatch-* blocks in app/globals.css.
 */
export const ACCENTS: readonly AccentPreset[] = [
  { id: "rosewater", label: "Rosewater", swatch: "#b0645a" },
  { id: "flamingo", label: "Flamingo", swatch: "#bf5d5d" },
  { id: "pink", label: "Pink", swatch: "#be185d" },
  { id: "mauve", label: "Mauve", swatch: "#7c3aed" },
  { id: "red", label: "Red", swatch: "#c62828" },
  { id: "maroon", label: "Maroon", swatch: "#a23a4a" },
  { id: "peach", label: "Peach", swatch: "#c0492a" },
  { id: "yellow", label: "Yellow", swatch: "#b45309" },
  { id: "green", label: "Green", swatch: "#15803d" },
  { id: "teal", label: "Teal", swatch: "#0f766e" },
  { id: "sky", label: "Sky", swatch: "#0e7490" },
  { id: "sapphire", label: "Sapphire", swatch: "#1668a8" },
  { id: "blue", label: "Blue", swatch: "#0369a1" },
  { id: "lavender", label: "Lavender", swatch: "#6d5dd6" },
] as const;

export interface TonePreset {
  id: SurfaceTone;
  label: string;
  description: string;
  /** A distinct mid-tone for the picker swatch (the surfaces themselves are near-neutral). */
  swatch: string;
}

export const TONES: readonly TonePreset[] = [
  { id: "warm", label: "Warm", description: "Paper & stone", swatch: "#e7d9c8" },
  { id: "neutral", label: "Neutral", description: "True grays", swatch: "#d4d4d8" },
  { id: "cool", label: "Cool", description: "Slate & ice", swatch: "#cbd5e1" },
] as const;

export interface PalettePreset {
  id: Palette;
  label: string;
  /** Short tagline shown under the label in the picker card. */
  description: string;
  /** 4 representative hexes [surface, raised surface, accent, text] for the card. */
  swatches: readonly [string, string, string, string];
}

/**
 * Full-palette presets. `default` is the native warm system; the four
 * Catppuccin flavors override every surface/accent/text token (see the
 * [data-palette="…"] blocks in app/globals.css). Order: default, then light →
 * dark, matching Catppuccin's own ordering.
 */
export const PALETTES: readonly PalettePreset[] = [
  {
    id: "default",
    label: "Default",
    description: "Warm paper & stone",
    swatches: ["#faf8f5", "#f2ede7", "#c0492a", "#292524"],
  },
  {
    id: "catppuccin-latte",
    label: "Latte",
    description: "Catppuccin · light",
    swatches: ["#eff1f5", "#ccd0da", "#8839ef", "#4c4f69"],
  },
  {
    id: "catppuccin-frappe",
    label: "Frappé",
    description: "Catppuccin · dark",
    swatches: ["#303446", "#414559", "#ca9ee6", "#c6d0f5"],
  },
  {
    id: "catppuccin-macchiato",
    label: "Macchiato",
    description: "Catppuccin · dark",
    swatches: ["#24273a", "#363a4f", "#c6a0f6", "#cad3f5"],
  },
  {
    id: "catppuccin-mocha",
    label: "Mocha",
    description: "Catppuccin · dark",
    swatches: ["#1e1e2e", "#313244", "#cba6f7", "#cdd6f4"],
  },
] as const;

const ACCENT_IDS = new Set<string>(ACCENTS.map((a) => a.id));
const TONE_IDS = new Set<string>(TONES.map((t) => t.id));
const PALETTE_IDS = new Set<string>(PALETTES.map((p) => p.id));

/** Default-palette hex → accent token. Every pickable color comes from ACCENTS
 *  (the swatch picker derives from it, seeds use these hexes), so this covers
 *  all stored item/category/member colors. */
const TOKEN_BY_HEX = new Map<string, AccentId>(
  ACCENTS.map((a) => [a.swatch.toLowerCase(), a.id]),
);

/**
 * Map a stored accent hex to its palette-aware CSS var so the color re-tints with
 * the active Catppuccin flavor (in the default palette the var resolves to the
 * same hex, so rendering is unchanged). Unknown/custom hexes pass through
 * unchanged; nullish input returns undefined (lets `style` omit the property).
 */
export function toPaletteColor(
  hex: string | null | undefined,
): string | undefined {
  if (!hex) return undefined;
  const token = TOKEN_BY_HEX.get(hex.toLowerCase());
  return token ? `var(--swatch-${token})` : hex;
}

/**
 * The legible text/icon color to overlay on a filled swatch of `hex`. Catppuccin
 * Latte (a light theme with wide-lightness accents) sets per-accent inks; every
 * other palette falls back to its single `--swatch-ink` (white / dark `crust`),
 * so this is a no-op there. Unknown hexes use the palette default ink.
 */
export function toPaletteInk(hex: string | null | undefined): string {
  const token = hex ? TOKEN_BY_HEX.get(hex.toLowerCase()) : undefined;
  return token
    ? `var(--swatch-ink-${token}, var(--swatch-ink))`
    : "var(--swatch-ink)";
}

/** The fill/border/text triplet for an event block. `outlined` (another
 *  member's read-only overlay) renders a solid fill matching the calendar
 *  background (`var(--background)`), a colored border in the event's color, and
 *  theme-ink text — so it reads as a hollow card "not mine, look don't touch"
 *  rather than a see-through wash. Filled (mine + shared) keeps the solid swatch
 *  with its matching ink and a transparent border (so geometry matches the
 *  outlined box). All colors go through `toPaletteColor` so they re-tint with
 *  Catppuccin. */
export interface EventFill {
  backgroundColor: string | undefined;
  borderColor: string;
  color: string;
}
export function eventFillStyle(color: string, outlined: boolean): EventFill {
  const tint = toPaletteColor(color);
  return outlined
    ? {
        backgroundColor: tint ? "var(--background)" : undefined,
        borderColor: tint ?? "transparent",
        color: "var(--foreground)",
      }
    : {
        backgroundColor: tint,
        borderColor: "transparent",
        color: toPaletteInk(color),
      };
}

/**
 * The CSS class that paints an occurrence's lifecycle status on the calendar:
 * 'cancelled' => diagonal grayed stripes (`evt-cancelled`), 'planned' => dotted
 * outline (`evt-planned`), 'confirmed' => plain fill (no class). The classes
 * live in app/globals.css; they overlay the inline backgroundColor already set
 * on the block. Pass the result through `cn(...)` alongside the other modifiers.
 */
export function eventStatusClass(status: EventStatus): string {
  return status === "cancelled"
    ? "evt-cancelled"
    : status === "planned"
      ? "evt-planned"
      : "";
}

/** Coerce an unknown string to a valid accent id, falling back to the default. */
export function normalizeAccent(value: string | null | undefined): AccentId {
  return value && ACCENT_IDS.has(value) ? (value as AccentId) : DEFAULT_ACCENT;
}

/** Coerce an unknown string to a valid surface tone, falling back to the default. */
export function normalizeTone(value: string | null | undefined): SurfaceTone {
  return value && TONE_IDS.has(value) ? (value as SurfaceTone) : DEFAULT_TONE;
}

/** Coerce an unknown string to a valid palette, falling back to the default. */
export function normalizePalette(value: string | null | undefined): Palette {
  return value && PALETTE_IDS.has(value) ? (value as Palette) : DEFAULT_PALETTE;
}

/**
 * The light/dark mode a palette dictates, or `null` for `default` (which defers
 * to the member's own themePreference). Catppuccin Latte is light; the other
 * three flavors are dark. Used to drive next-themes so the `.dark` class — and
 * any `dark:` utilities — stay consistent with the active flavor.
 */
export function paletteMode(palette: Palette): "light" | "dark" | null {
  if (palette === "default") return null;
  return palette === "catppuccin-latte" ? "light" : "dark";
}
