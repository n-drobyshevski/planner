import type { AccentId, Palette, SurfaceTone } from "@/lib/types";

/**
 * Cookie-backed appearance so the root layout can stay a static (prerenderable)
 * shell under Cache Components. Instead of reading the member row server-side
 * and stamping per-user attributes onto <html> (which forces request-time
 * rendering of the whole document), we persist accent/tone/palette in a cookie
 * and re-apply them client-side before paint via a tiny blocking script — the
 * same no-flash trick next-themes uses for the `.dark` class.
 */
export const APPEARANCE_COOKIE = "planner-appearance";

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
 * Blocking inline script for the document <head>: reads the appearance cookie
 * and sets the <html> data attributes (and, for the `pink` palette, the
 * `--pink-base` inline style) before first paint, mirroring the `data-tone` rule
 * (a non-default palette owns its surfaces, so only the default palette honors
 * the chosen tone). Tolerates the legacy 3-field cookie. Unknown/missing cookie
 * leaves the static defaults already rendered on <html>. Kept tiny and
 * dependency-free.
 */
export const APPEARANCE_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${APPEARANCE_COOKIE}=([^;]*)/);if(!m)return;var p=m[1].split("~");if(p.length<3)return;var a=p[0],t=p[1],pal=p[2],pb=p[3]||"",el=document.documentElement;if(a)el.dataset.accent=a;if(pal)el.dataset.palette=pal;el.dataset.tone=pal==="default"?t:"warm";if(pal==="pink"&&/^#[0-9A-Fa-f]{6}$/.test(pb))el.style.setProperty("--pink-base",pb);else el.style.removeProperty("--pink-base");}catch(e){}})();`;

/**
 * Combined appearance + dark pre-paint script for the error pages that render
 * OUTSIDE the app providers (the root `not-found.tsx` and `global-error.tsx`). It
 * mirrors APPEARANCE_INIT_SCRIPT (reads `planner-appearance` and stamps
 * `data-accent`/`data-palette`/`data-tone` + `--pink-base`) AND resolves the
 * next-themes `.dark` class itself — those pages aren't inside ThemeProvider, so
 * nothing else applies it. Dark follows next-themes' own rule: the `theme` key in
 * localStorage, falling back to the system `prefers-color-scheme`.
 *
 * `target` is where to apply it: `"documentElement"` for global-error, which owns
 * `<html>` and runs this from `<head>`; or `"parent"` for the root not-found, which
 * can't own `<html>` (Next's DefaultLayout does) and renders this as the first child
 * of a themed wrapper `<div>` — `document.currentScript.parentElement` is that
 * wrapper. Tiny and dependency-free; any failure degrades to the base (light) theme.
 */
export function errorThemeInitScript(target: "documentElement" | "parent"): string {
  const el =
    target === "documentElement"
      ? "document.documentElement"
      : "document.currentScript.parentElement";
  return (
    `(function(){try{var el=${el};` +
    `var m=document.cookie.match(/(?:^|; )${APPEARANCE_COOKIE}=([^;]*)/);` +
    `if(m){var p=m[1].split("~");if(p.length>=3){var a=p[0],t=p[1],pal=p[2],pb=p[3]||"";` +
    `if(a)el.dataset.accent=a;if(pal)el.dataset.palette=pal;` +
    `el.dataset.tone=pal==="default"?t:"warm";` +
    `if(pal==="pink"&&/^#[0-9A-Fa-f]{6}$/.test(pb))el.style.setProperty("--pink-base",pb);}}` +
    `var th=localStorage.getItem("theme");` +
    `if(th==="dark"||((!th||th==="system")&&matchMedia("(prefers-color-scheme: dark)").matches))el.classList.add("dark");` +
    `}catch(e){}})();`
  );
}
