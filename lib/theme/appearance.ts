// Appearance preset catalogs — the single source of truth the Settings UI and
// the server layout share. The actual color values live in app/globals.css as
// [data-accent="…"] / [data-tone="…"] overrides; here we keep only the ids,
// human labels, and a representative swatch for the picker dots.

import type {
  AccentId,
  Palette,
  SurfaceTone,
  ThemePreference,
} from "@/lib/types";

export const DEFAULT_THEME: ThemePreference = "system";
export const DEFAULT_ACCENT: AccentId = "terracotta";
export const DEFAULT_TONE: SurfaceTone = "warm";
export const DEFAULT_PALETTE: Palette = "default";

export interface AccentPreset {
  id: AccentId;
  label: string;
  /** Light-mode --primary hex, used for the picker swatch. */
  swatch: string;
}

/** Order mirrors the in-app category palette. `terracotta` is the default. */
export const ACCENTS: readonly AccentPreset[] = [
  { id: "terracotta", label: "Terracotta", swatch: "#c0492a" },
  { id: "amber", label: "Amber", swatch: "#b45309" },
  { id: "rose", label: "Rose", swatch: "#be185d" },
  { id: "violet", label: "Violet", swatch: "#7c3aed" },
  { id: "blue", label: "Blue", swatch: "#0369a1" },
  { id: "teal", label: "Teal", swatch: "#0f766e" },
  { id: "green", label: "Green", swatch: "#15803d" },
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
