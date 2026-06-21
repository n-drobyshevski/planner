import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { contentSecurityPolicy } from "./lib/security/csp";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Security response headers applied to every route. The CSP keeps the static
// FCP shell, so script-src allows 'unsafe-inline' (React streams unhashable
// inline scripts at runtime; nonces would force dynamic rendering) but still
// blocks all external script origins; the rest of the policy is strict. See
// lib/security/csp.ts. `frame-ancestors`/X-Frame-Options block clickjacking
// (notably the public /share page); HSTS applies only over HTTPS.
const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Drop powerful features the app never uses; keep WebAuthn (passkeys) working.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  // Cache Components (PPR + "use cache" + dynamicIO, unified). Pages are dynamic
  // by default; cached scopes ("use cache") and Suspense boundaries define what
  // gets prerendered into the static shell. The root layout is fully static
  // (per-user appearance is applied client-side from a cookie), so the shell —
  // app chrome — can prerender even on auth-gated routes.
  cacheComponents: true,
  // "/" → the calendar surface is handled per-locale inside the routing layer
  // (app/[locale]/page.tsx) now that next-intl owns the locale segment — a flat
  // next.config redirect can't be locale-aware (it would strip /ru). The proxy
  // still sends unauthenticated users to /login first.
  // React Compiler (stable in Next 16) auto-memoizes the client tree, so the
  // heavy calendar/task components don't need hand-written React.memo/useCallback.
  // Next applies the Babel pass only to relevant files via an SWC pre-pass, so
  // the build-time cost stays small. Do NOT add blanket manual memoization on top.
  reactCompiler: true,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  experimental: {
    // Tree-shake barrel imports for heavy packages. lucide-react and date-fns are
    // already optimized by Next's defaults; the calendar's timezone helper and the
    // `radix-ui` umbrella package (every components/ui/* primitive imports from it,
    // and it's NOT in Next's default list) are added here. recharts is NOT in the
    // default list (and that flag wouldn't lazy-load it anyway) — it's code-split
    // via next/dynamic instead, in components/tasks/task-backlog-rail.tsx (the
    // right rail's "Insights" tab).
    optimizePackageImports: ["@date-fns/tz", "radix-ui"],
    // Dev-only DevTools panel to inspect what renders instantly vs streams.
    instantNavigationDevToolsToggle: true,
  },
};

export default withNextIntl(nextConfig);
