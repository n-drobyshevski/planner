// Appearance preset catalogs — the single source of truth the Settings UI and
// the server layout share. The actual color values live in app/globals.css as
// [data-accent="…"] / [data-tone="…"] overrides; here we keep only the ids,
// human labels, and a representative swatch for the picker dots.

import type {
  AccentId,
  ContextLabel,
  EventStatus,
  Palette,
  SurfaceTone,
  ThemePreference,
} from "@/lib/types";

export const DEFAULT_THEME: ThemePreference = "system";
export const DEFAULT_ACCENT: AccentId = "stone";
export const DEFAULT_TONE: SurfaceTone = "warm";
export const DEFAULT_PALETTE: Palette = "default";
export const DEFAULT_CONTEXT_LABEL: ContextLabel = "bar";

/** The fallback base hue for the `pink` palette when the member hasn't picked a
 *  custom one. Mirrors the `var(--pink-base, …)` fallback in app/globals.css. */
export const DEFAULT_PINK_BASE = "#ec4899";

export interface AccentPreset {
  id: AccentId;
  label: string;
  /** The canonical default-palette hex for this accent — the lightened value the
   *  `--swatch-<id>` var paints (see app/globals.css) and the hex new picks store.
   *  Pre-lightening hexes still resolve via LEGACY_ACCENT_HEX. Catppuccin flavors
   *  remap the var, not this hex. */
  swatch: string;
}

/**
 * The accent picker: warm `stone` (the warm-neutral brand default, not a
 * Catppuccin hue) followed by the 14 Catppuccin accent colors (Catppuccin's
 * canonical order). `swatch` is the lightened default-palette hex each renders as;
 * `stone` is the default and lives in :root, `peach` (the former brand terracotta)
 * gets a restore block. The literal Catppuccin hex per flavor lives in the
 * [data-palette="catppuccin-*"] --swatch-* blocks in app/globals.css.
 */
export const ACCENTS: readonly AccentPreset[] = [
  { id: "stone", label: "Stone", swatch: "#65615c" },
  { id: "rosewater", label: "Rosewater", swatch: "#ab6056" },
  { id: "flamingo", label: "Flamingo", swatch: "#b75556" },
  { id: "pink", label: "Pink", swatch: "#d02f6b" },
  { id: "mauve", label: "Mauve", swatch: "#8749fb" },
  { id: "red", label: "Red", swatch: "#d43834" },
  { id: "maroon", label: "Maroon", swatch: "#b34958" },
  { id: "peach", label: "Peach", swatch: "#c54e2f" },
  { id: "yellow", label: "Yellow", swatch: "#b95813" },
  { id: "green", label: "Green", swatch: "#1f8643" },
  { id: "teal", label: "Teal", swatch: "#23827a" },
  { id: "sky", label: "Sky", swatch: "#217e9b" },
  { id: "sapphire", label: "Sapphire", swatch: "#2a77b8" },
  { id: "blue", label: "Blue", swatch: "#2078b1" },
  { id: "lavender", label: "Lavender", swatch: "#7162db" },
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
    swatches: ["#faf8f5", "#f2ede7", "#57534e", "#292524"],
  },
  {
    id: "pink",
    label: "Pink",
    description: "Soft blossom, your hue",
    swatches: ["#fdf2f6", "#fbe3ec", "#ec4899", "#4a1f33"],
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

/** Quick-pick base hues for the `pink` palette (Settings → Appearance → Base
 *  pink), alongside the free custom color picker. `value` seeds `--pink-base`;
 *  the rest of the palette derives from it in OKLCH (see app/globals.css), so
 *  these only set the hue/chroma — surface lightness stays fixed for AAA. */
export interface PinkPreset {
  id: string;
  label: string;
  value: string;
}
export const PINK_PRESETS: readonly PinkPreset[] = [
  { id: "blossom", label: "Blossom", value: "#f9a8d4" },
  { id: "rose", label: "Rose", value: "#ec4899" },
  { id: "bubblegum", label: "Bubblegum", value: "#f472b6" },
  { id: "fuchsia", label: "Fuchsia", value: "#d946ef" },
  { id: "orchid", label: "Orchid", value: "#c084fc" },
] as const;

const ACCENT_IDS = new Set<string>(ACCENTS.map((a) => a.id));
const TONE_IDS = new Set<string>(TONES.map((t) => t.id));
const PALETTE_IDS = new Set<string>(PALETTES.map((p) => p.id));

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * The pre-lightening swatch hexes (before the default palette was lightened on
 * 2026-06-21). New picks store the lightened `ACCENTS[].swatch`, but items
 * coloured before that change still hold these — both must resolve to the same
 * accent token so old items keep re-tinting (and highlighting in the picker).
 * Kept indefinitely as a cheap compatibility shim, which is why the lightening
 * needed no data migration.
 */
const LEGACY_ACCENT_HEX: Record<AccentId, string> = {
  stone: "#57534e", rosewater: "#b0645a", flamingo: "#bf5d5d", pink: "#be185d",
  mauve: "#7c3aed", red: "#c62828", maroon: "#a23a4a", peach: "#c0492a",
  yellow: "#b45309", green: "#15803d", teal: "#0f766e", sky: "#0e7490",
  sapphire: "#1668a8", blue: "#0369a1", lavender: "#6d5dd6",
};

/** Accent hex (current lightened OR legacy) → token. Every pickable color comes
 *  from ACCENTS; the legacy entries cover items stored before the palette was
 *  lightened, so this covers all stored item/category/member colors. */
const TOKEN_BY_HEX = new Map<string, AccentId>([
  ...ACCENTS.map((a) => [a.swatch.toLowerCase(), a.id] as const),
  ...Object.entries(LEGACY_ACCENT_HEX).map(
    ([id, hex]) => [hex.toLowerCase(), id as AccentId] as const,
  ),
]);

/** The accent token a stored item hex maps to (current or legacy), or undefined
 *  for custom colors. Lets the pickers highlight the right swatch and ColorField
 *  resolve its label regardless of when the item was coloured. */
export function accentIdForHex(
  hex: string | null | undefined,
): AccentId | undefined {
  return hex ? TOKEN_BY_HEX.get(hex.toLowerCase()) : undefined;
}

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
  const token = accentIdForHex(hex);
  return token ? `var(--swatch-${token})` : hex;
}

/**
 * A theme-mapped color tuned for thin strokes and small marks on a surface — the
 * Flows timeline (trunks, branches, status/milestone nodes, checkpoints) and the
 * gutter color dots. It maps the hex to its palette swatch like `toPaletteColor`,
 * then re-lights it to a stroke-legible shade where the active palette declares
 * one via `--flow-stroke-l` / `--flow-stroke-c`. Light pastel palettes (pink) set
 * these so a hairline stays ≥3:1 on the near-white card; the default warm palette
 * and the dark palettes leave them unset, so the swatch's own `l`/`c` pass through
 * unchanged (an identity round-trip through oklch, the same pattern
 * `eventFillStyle` already uses). The result is a CSS color string usable as a
 * fill/background or directly as an SVG `stroke`/`fill` attribute.
 */
export function toPaletteStroke(hex: string): string {
  return `oklch(from ${toPaletteColor(hex) ?? hex} var(--flow-stroke-l, l) var(--flow-stroke-c, c) h)`;
}

/**
 * The legible text/icon color to overlay on a filled swatch of `hex`. Catppuccin
 * Latte (a light theme with wide-lightness accents) sets per-accent inks; every
 * other palette falls back to its single `--swatch-ink` (white / dark `crust`),
 * so this is a no-op there. Unknown hexes use the palette default ink.
 */
export function toPaletteInk(hex: string | null | undefined): string {
  const token = accentIdForHex(hex);
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
  /** Set to "none" for inactive events so they sit flat (no lifted-card shadow);
   *  omitted otherwise so the block's default `shadow-soft` class applies. */
  boxShadow?: string;
}
export function eventFillStyle(
  color: string,
  outlined: boolean,
  inactive = false,
): EventFill {
  const tint = toPaletteColor(color);
  // Inactive events (sleep, blocked hours) recede into the grid instead of
  // reading as solid slabs: a faint wash of their own colour over the surface,
  // a hairline tint border, and full ink text (so they stay legible — AAA on the
  // card — while the block itself quiets down) with the shadow dropped flat.
  if (inactive) {
    return {
      backgroundColor: tint
        ? `color-mix(in oklab, ${tint} 18%, var(--card))`
        : "var(--card)",
      borderColor: tint
        ? `color-mix(in oklab, ${tint} 36%, var(--border))`
        : "var(--border)",
      color: "var(--foreground)",
      boxShadow: "none",
    };
  }
  return outlined
    ? {
        backgroundColor: tint ? "var(--background)" : undefined,
        borderColor: tint ?? "transparent",
        color: "var(--foreground)",
      }
    : {
        // Trim chroma ~15% (holding lightness, so the ink contrast is unchanged)
        // to calm the saturation of the colour-coded fills — the category colour
        // still reads, it just stops competing with the schedule.
        backgroundColor: tint
          ? `oklch(from ${tint} l calc(c * 0.85) h)`
          : undefined,
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

/** Coerce an unknown string to a `#rrggbb` pink base, or null (= default pink).
 *  Guards the cookie/DB against junk before it reaches the `--pink-base` var. */
export function normalizePinkBase(value: string | null | undefined): string | null {
  return value && HEX_COLOR.test(value) ? value.toLowerCase() : null;
}

/**
 * The light/dark mode a palette dictates, or `null` when the palette defers to
 * the member's own themePreference. `default` and `pink` are both light/dark-
 * aware (they return null). Among the Catppuccin flavors, Latte is light and the
 * other three are dark. Used to drive next-themes so the `.dark` class — and any
 * `dark:` utilities — stay consistent with a mode-owning flavor.
 */
export function paletteMode(palette: Palette): "light" | "dark" | null {
  if (palette === "default" || palette === "pink") return null;
  return palette === "catppuccin-latte" ? "light" : "dark";
}
