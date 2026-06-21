import type { AccentId, Palette, SurfaceTone } from "@/lib/types";
import {
  APPEARANCE_COOKIE,
  ERROR_THEME_INIT_SCRIPT_DOCUMENT,
  ERROR_THEME_INIT_SCRIPT_PARENT,
} from "./appearance-scripts";

/**
 * Cookie-backed appearance so the root layout can stay a static (prerenderable)
 * shell under Cache Components. Instead of reading the member row server-side
 * and stamping per-user attributes onto <html> (which forces request-time
 * rendering of the whole document), we persist accent/tone/palette in a cookie
 * and re-apply them client-side before paint via a tiny blocking script — the
 * same no-flash trick next-themes uses for the `.dark` class.
 *
 * The inline-script bodies live in the dependency-free `./appearance-scripts` so
 * `next.config.ts` can hash them for the CSP; re-exported here for callers.
 */
export { APPEARANCE_COOKIE, APPEARANCE_INIT_SCRIPT } from "./appearance-scripts";

/** Serialize as a `~`-delimited tuple `accent~tone~palette~pinkBase`; none of the
 *  ids contain `~`. The 4th slot is the `pink` palette's base hex, empty when
 *  null (= default pink). Older 3-field cookies stay readable (the reader keys on
 *  `>= 3`). The `#` in a hex is cookie-safe, so it's written verbatim. */
export function serializeAppearance(
  accent: AccentId,
  tone: SurfaceTone,
  palette: Palette,
  pinkBase: string | null,
): string {
  return `${accent}~${tone}~${palette}~${pinkBase ?? ""}`;
}

/** Persist the current appearance to the cookie (client-only). 1-year expiry. */
export function writeAppearanceCookie(
  accent: AccentId,
  tone: SurfaceTone,
  palette: Palette,
  pinkBase: string | null,
): void {
  if (typeof document === "undefined") return;
  document.cookie =
    `${APPEARANCE_COOKIE}=${serializeAppearance(accent, tone, palette, pinkBase)}` +
    `; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Combined appearance + dark pre-paint script for the error pages that render
 * OUTSIDE the app providers (the root `not-found.tsx` and `global-error.tsx`).
 * The two emitted variants are precomputed constants in `./appearance-scripts`
 * (so they're hashable for the CSP); this just selects one by where it applies:
 * `"documentElement"` for global-error (owns `<html>`, runs from `<head>`), or
 * `"parent"` for the root not-found (renders as the first child of a themed
 * wrapper `<div>`, so it targets `document.currentScript.parentElement`).
 */
export function errorThemeInitScript(target: "documentElement" | "parent"): string {
  return target === "documentElement"
    ? ERROR_THEME_INIT_SCRIPT_DOCUMENT
    : ERROR_THEME_INIT_SCRIPT_PARENT;
}
