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

/** Serialize as a `~`-delimited triple; none of the ids contain `~`. */
export function serializeAppearance(
  accent: AccentId,
  tone: SurfaceTone,
  palette: Palette,
): string {
  return `${accent}~${tone}~${palette}`;
}

/** Persist the current appearance to the cookie (client-only). 1-year expiry. */
export function writeAppearanceCookie(
  accent: AccentId,
  tone: SurfaceTone,
  palette: Palette,
): void {
  if (typeof document === "undefined") return;
  document.cookie =
    `${APPEARANCE_COOKIE}=${serializeAppearance(accent, tone, palette)}` +
    `; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Blocking inline script for the document <head>: reads the appearance cookie
 * and sets the <html> data attributes before first paint, mirroring the
 * `data-tone` rule (a Catppuccin flavor owns its surfaces, so only the default
 * palette honors the chosen tone). Unknown/missing cookie leaves the static
 * defaults already rendered on <html>. Kept tiny and dependency-free.
 */
export const APPEARANCE_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${APPEARANCE_COOKIE}=([^;]*)/);if(!m)return;var p=m[1].split("~");if(p.length!==3)return;var a=p[0],t=p[1],pal=p[2],el=document.documentElement;if(a)el.dataset.accent=a;if(pal)el.dataset.palette=pal;el.dataset.tone=pal==="default"?t:"warm";}catch(e){}})();`;
