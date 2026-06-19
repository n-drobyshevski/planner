/**
 * Locale resolution for the PUBLIC share surface (`/share/[token]`), which lives
 * OUTSIDE `app/[locale]` and so never goes through next-intl's middleware. The
 * share view defaults to Russian (its most common audience), but honours an
 * explicit viewer choice and, failing that, the recipient's own browser.
 *
 * Precedence: `share_locale` cookie → `Accept-Language` (en|ru) → "ru".
 *
 * Pure (cookie string + header string in, locale out) so it's unit-testable and
 * callable from both the page render and `generateMetadata`.
 */

export type ShareLocale = "en" | "ru";

/** The share surface falls back to Russian, not the app's `defaultLocale`. */
export const SHARE_FALLBACK_LOCALE: ShareLocale = "ru";

/**
 * Dedicated cookie for the viewer's explicit share-language choice. Deliberately
 * NOT next-intl's `NEXT_LOCALE` — that cookie feeds the authed app's locale
 * detection, and an anonymous share viewer must never perturb it.
 */
export const SHARE_LOCALE_COOKIE = "share_locale";

function isShareLocale(value: string | undefined | null): value is ShareLocale {
  return value === "en" || value === "ru";
}

/**
 * Pick the first supported locale from a quality-ordered `Accept-Language`
 * header, matching by primary subtag (so `en-GB` → `en`, `ru-RU` → `ru`).
 * Returns null when the browser prefers neither.
 */
function negotiateFromHeader(acceptLanguage: string | null | undefined): ShareLocale | null {
  if (!acceptLanguage) return null;
  const tags = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="));
      const quality = q ? Number.parseFloat(q.slice(2)) : 1;
      return { primary: tag.trim().toLowerCase().split("-")[0], quality };
    })
    .filter((t) => t.primary && Number.isFinite(t.quality) && t.quality > 0)
    // Stable sort by descending quality (Array#sort is stable in modern JS, so
    // equal-quality tags keep their header order).
    .sort((a, b) => b.quality - a.quality);

  for (const { primary } of tags) {
    if (isShareLocale(primary)) return primary;
  }
  return null;
}

export function resolveShareLocale(
  cookieValue: string | undefined | null,
  acceptLanguage: string | null | undefined,
): ShareLocale {
  if (isShareLocale(cookieValue)) return cookieValue;
  return negotiateFromHeader(acceptLanguage) ?? SHARE_FALLBACK_LOCALE;
}
