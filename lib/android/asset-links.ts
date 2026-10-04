/**
 * Digital Asset Links statement for the Android app, served at
 * `/.well-known/assetlinks.json`. It proves planr.page vouches for the app, which:
 *
 * - verifies the `https://<origin>/app/auth/callback` App Link, so the OAuth
 *   redirect opens the app directly (`common.handle_all_urls`), and
 * - lets Android Credential Manager offer this site's passkeys/passwords to the
 *   app (`common.get_login_creds`).
 *
 * Pure (env values in, JSON out) so it is unit-testable; the route reads env.
 * See docs/android.md for how to obtain the signing-certificate fingerprints.
 */

/** Package name of the Android app (`applicationId`). */
export const DEFAULT_ANDROID_PACKAGE_NAME = "page.planr.android";

export interface AssetLinkStatement {
  relation: string[];
  target: {
    namespace: "android_app";
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}

const RELATIONS = [
  "delegate_permission/common.handle_all_urls",
  "delegate_permission/common.get_login_creds",
];

/** Reverse-DNS Java package name: dot-separated identifiers, at least two. */
const PACKAGE_NAME = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

/**
 * Normalize one SHA-256 certificate fingerprint to the colon-separated uppercase
 * form Android expects (`AB:CD:…`, 32 bytes). Accepts the bare 64-hex form too
 * (as printed by some tools). Returns null for anything else.
 */
export function normalizeFingerprint(raw: string): string | null {
  const hex = raw.trim().replace(/:/g, "").toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(hex)) return null;
  return hex.match(/.{2}/g)!.join(":");
}

/**
 * Build the statement list. Returns `[]` (a valid, empty statement list) when no
 * usable fingerprint is configured, so an unconfigured deploy serves nothing
 * that could verify a foreign app.
 *
 * @param certSha256 `ANDROID_CERT_SHA256` — comma-separated fingerprints (e.g.
 *   the upload key and the Play app-signing key, or a debug key on staging).
 * @param packageName `ANDROID_PACKAGE_NAME` — defaults to page.planr.android.
 */
export function buildAssetLinks(
  certSha256: string | undefined,
  packageName: string | undefined,
): AssetLinkStatement[] {
  const fingerprints = [
    ...new Set(
      (certSha256 ?? "")
        .split(",")
        .map(normalizeFingerprint)
        .filter((f): f is string => f !== null),
    ),
  ];
  if (fingerprints.length === 0) return [];

  const pkg = packageName?.trim() || DEFAULT_ANDROID_PACKAGE_NAME;
  if (!PACKAGE_NAME.test(pkg)) return [];

  return [
    {
      relation: RELATIONS,
      target: {
        namespace: "android_app",
        package_name: pkg,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}
