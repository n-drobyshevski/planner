// Content-Security-Policy construction. Imported only by next.config.ts.
//
// Approach (decided after empirical testing — see the security-hardening plan):
// the app keeps its Cache-Components STATIC shell for FCP, so a nonce-based CSP
// (which forces dynamic rendering) is off the table, and a hash-based strict
// policy is impossible because React streams ~18 DYNAMIC inline scripts per page
// at runtime (`self.__next_f.push(...)`, Suspense `$RC(...)` boundary reveals)
// that can't be hashed and that SRI does not cover. So script-src uses
// `'unsafe-inline'`: it still blocks ALL external/third-party script origins (the
// common XSS injection of `<script src=evil>`), and the rest of the policy is
// strict — `object-src 'none'`, `base-uri`/`form-action 'self'`, and
// `frame-ancestors 'none'` (clickjacking, notably for the public /share page).

const isDev = process.env.NODE_ENV === "development";

/** Build the CSP header value applied to every route by next.config `headers()`. */
export function contentSecurityPolicy(): string {
  // Dev needs 'unsafe-eval' (React Refresh) and websocket/http to localhost (HMR
  // + the error overlay); prod needs neither.
  const connectExtra = isDev ? " ws://localhost:* http://localhost:*" : "";
  const scriptExtra = isDev ? " 'unsafe-eval'" : "";

  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline'${scriptExtra}`,
    // Inline style attributes (e.g. --pink-base) + Recharts' injected <style>.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    // Supabase REST + realtime (wss); Vercel Analytics/Speed-Insights beacons.
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.vercel-insights.com https://vitals.vercel-insights.com${connectExtra}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    `upgrade-insecure-requests`,
  ];

  return directives.join("; ");
}
