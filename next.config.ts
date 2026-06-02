import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (PPR + "use cache" + dynamicIO, unified). Pages are dynamic
  // by default; cached scopes ("use cache") and Suspense boundaries define what
  // gets prerendered into the static shell. The root layout is fully static
  // (per-user appearance is applied client-side from a cookie), so the shell —
  // app chrome — can prerender even on auth-gated routes.
  cacheComponents: true,
  experimental: {
    // Tree-shake barrel imports for heavy packages. lucide-react, date-fns and
    // recharts are already optimized by Next's defaults, so only the calendar's
    // timezone helper needs adding here.
    optimizePackageImports: ["@date-fns/tz"],
    // Dev-only DevTools panel to inspect what renders instantly vs streams.
    instantNavigationDevToolsToggle: true,
  },
};

export default nextConfig;
