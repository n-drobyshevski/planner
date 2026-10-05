import { DEFAULT_ANDROID_PACKAGE_NAME } from "@/lib/android/asset-links";

/**
 * "Open Planr" for the OAuth callback fallback page (`/app/auth/callback`).
 *
 * The App Link normally hands the callback to the app before the page loads.
 * When the browser won't — Firefox keeps links in the browser unless "Open
 * links in apps" is on, and Android may not have verified the link yet — the
 * page offers a button whose `intent://` URL carries the same callback to the
 * app explicitly. A tap is a user gesture, which every browser honours.
 *
 * Safe to forward: the intent names the package, so only Planr receives it, and
 * the code is redeemable only with the PKCE verifier held by the Planr install
 * that started this sign-in.
 */

/** Callback parameters the app understands; anything else is dropped. */
const FORWARDED_PARAMS = ["code", "state", "error", "error_description"] as const;

/** Same shape the asset-links builder accepts (`applicationId`). */
const PACKAGE_NAME = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

/**
 * The `intent://` URL that re-delivers this callback to the app, or null when
 * the query carries neither a `code` nor an `error` (nothing to finish).
 *
 * @param host        the page's host (`location.host`), e.g. auth.planr.page
 * @param pathname    the page's path (`location.pathname`)
 * @param search      the page's query (`location.search`)
 * @param packageName the app's package; invalid or empty → page.planr.android
 */
export function buildCallbackIntentUrl(
  host: string,
  pathname: string,
  search: string,
  packageName?: string,
): string | null {
  const incoming = new URLSearchParams(search);
  if (!incoming.get("code") && !incoming.get("error")) return null;

  const forwarded = new URLSearchParams();
  for (const key of FORWARDED_PARAMS) {
    const value = incoming.get(key);
    if (value !== null) forwarded.set(key, value);
  }

  const pkg =
    packageName && PACKAGE_NAME.test(packageName.trim())
      ? packageName.trim()
      : DEFAULT_ANDROID_PACKAGE_NAME;

  // URLSearchParams percent-encodes `#` and `;`, so a value can't end the URL
  // early or smuggle extra `#Intent;` fields.
  return `intent://${host}${pathname}?${forwarded}#Intent;scheme=https;package=${pkg};end`;
}
