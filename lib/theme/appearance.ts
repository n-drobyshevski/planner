// Appearance preset catalogs — the single source of truth the Settings UI and
// the server layout share. The actual color values live in app/globals.css as
// [data-accent="…"] / [data-tone="…"] overrides; here we keep only the ids,
// human labels, and a representative swatch for the picker dots.

import type { AccentId, SurfaceTone, ThemePreference } from "@/lib/types";

export const DEFAULT_THEME: ThemePreference = "system";
export const DEFAULT_ACCENT: AccentId = "terracotta";
export const DEFAULT_TONE: SurfaceTone = "warm";

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

const ACCENT_IDS = new Set<string>(ACCENTS.map((a) => a.id));
const TONE_IDS = new Set<string>(TONES.map((t) => t.id));

/** Coerce an unknown string to a valid accent id, falling back to the default. */
export function normalizeAccent(value: string | null | undefined): AccentId {
  return value && ACCENT_IDS.has(value) ? (value as AccentId) : DEFAULT_ACCENT;
}

/** Coerce an unknown string to a valid surface tone, falling back to the default. */
export function normalizeTone(value: string | null | undefined): SurfaceTone {
  return value && TONE_IDS.has(value) ? (value as SurfaceTone) : DEFAULT_TONE;
}
