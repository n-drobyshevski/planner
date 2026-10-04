import { buildAssetLinks } from "@/lib/android/asset-links";

/**
 * Digital Asset Links for the Android app (App Link verification + credential
 * sharing). Like the sibling oauth-protected-resource route, the dot in the path
 * keeps it out of the proxy matcher, so it is served unauthenticated and without
 * a locale prefix — Android's verifier fetches it anonymously and won't follow
 * redirects.
 *
 * Under Cache Components a GET handler that reads no request data is prerendered
 * at build time, so this is a static file in practice: changing
 * ANDROID_CERT_SHA256 / ANDROID_PACKAGE_NAME needs a redeploy (as any env change
 * on Vercel does).
 */
export function GET(): Response {
  return Response.json(
    buildAssetLinks(process.env.ANDROID_CERT_SHA256, process.env.ANDROID_PACKAGE_NAME),
  );
}
