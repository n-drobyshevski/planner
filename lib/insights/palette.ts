// Insights chart palette helpers. The actual series colors live in
// app/globals.css as --chart-1..5 per palette flavor (default light/dark and
// the four Catppuccin flavors each define their own set, ordered for neighbor
// contrast); here we expose them as an ORDERED sequence plus the shared
// comparison ("previous period") treatment, and the WCAG contrast math the
// palette unit test uses to enforce the ≥3:1 fill-vs-card floor on every
// flavor (IBM Carbon / UK Analysis Function guidance).
//
// Category series are NOT colored from this palette — they keep the user's
// chosen category colors via seriesMeta() in components/insights/series.ts.
// SERIES_PALETTE is for non-category multi-series charts (metrics, overlays).

/** Ordered categorical palette for non-category series. Index 0 is the focal
 *  series; pick colors in order so adjacent series stay distinguishable. */
export const SERIES_PALETTE: readonly string[] = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

/**
 * The "context" color for de-emphasized data: previous-period ghosts,
 * baselines, reference tracks. Grey-for-context / accent-for-focus — the
 * comparison series must never compete with the current one. Render it with
 * COMPARISON_OPACITY (fillOpacity/strokeOpacity) so it reads as a ghost.
 */
export const COMPARISON_COLOR = "var(--muted-foreground)";
export const COMPARISON_OPACITY = 0.4;

/** sRGB channel (0-255) → linearized value, per WCAG 2.x relative luminance. */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of a #rrggbb hex color. */
export function relativeLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`relativeLuminance: not a 6-digit hex color: ${hex}`);
  const v = parseInt(m[1], 16);
  const r = linearize((v >> 16) & 0xff);
  const g = linearize((v >> 8) & 0xff);
  const b = linearize(v & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio (≥1) between two #rrggbb hex colors. */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The floor every chart fill must clear against the card background. */
export const MIN_FILL_CONTRAST = 3;
