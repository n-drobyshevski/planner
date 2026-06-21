// The exact inline `<script>` bodies that are stamped into the document before
// paint (the no-flash appearance/theme trick), plus the cookie name they read.
//
// Kept as a small DEPENDENCY-FREE module and the single source of truth for these
// scripts. `errorThemeInitScript` (in ./appearance-cookie) selects between the two
// precomputed error-page variants below rather than interpolating caller input
// into the script string — so no dynamic value can ever reach the emitted JS.

/** Non-httpOnly cookie holding `accent~tone~palette~pinkBase`. */
export const APPEARANCE_COOKIE = "planner-appearance";

/**
 * Blocking inline script for the document <head>: reads the appearance cookie and
 * stamps the <html> data attributes (and, for the `pink` palette, the
 * `--pink-base` inline style) before first paint. Tolerates the legacy 3-field
 * cookie; an unknown/missing cookie leaves the static defaults already on <html>.
 */
export const APPEARANCE_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${APPEARANCE_COOKIE}=([^;]*)/);if(!m)return;var p=m[1].split("~");if(p.length<3)return;var a=p[0],t=p[1],pal=p[2],pb=p[3]||"",el=document.documentElement;if(a)el.dataset.accent=a;if(pal)el.dataset.palette=pal;el.dataset.tone=pal==="default"?t:"warm";if(pal==="pink"&&/^#[0-9A-Fa-f]{6}$/.test(pb))el.style.setProperty("--pink-base",pb);else el.style.removeProperty("--pink-base");}catch(e){}})();`;

/**
 * Combined appearance + dark pre-paint script for the error pages that render
 * OUTSIDE the app providers (root `not-found.tsx`, `global-error.tsx`). Mirrors
 * APPEARANCE_INIT_SCRIPT AND resolves the next-themes `.dark` class itself (those
 * pages aren't inside ThemeProvider). `elExpr` is interpolated only from the two
 * hardcoded literals below — never from caller input — so the emitted strings are
 * fully static constants (hashable for the CSP, no injection seam).
 */
function buildErrorThemeInitScript(elExpr: string): string {
  return (
    `(function(){try{var el=${elExpr};` +
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

/** For `global-error.tsx`, which owns <html> and runs this from <head>. */
export const ERROR_THEME_INIT_SCRIPT_DOCUMENT = buildErrorThemeInitScript(
  "document.documentElement",
);

/** For the root `not-found.tsx`, which can't own <html> (Next's DefaultLayout does)
 *  and renders this as the first child of a themed wrapper <div>. */
export const ERROR_THEME_INIT_SCRIPT_PARENT = buildErrorThemeInitScript(
  "document.currentScript.parentElement",
);
