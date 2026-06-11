import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (PPR + "use cache" + dynamicIO, unified). Pages are dynamic
  // by default; cached scopes ("use cache") and Suspense boundaries define what
  // gets prerendered into the static shell. The root layout is fully static
  // (per-user appearance is applied client-side from a cookie), so the shell —
  // app chrome — can prerender even on auth-gated routes.
  cacheComponents: true,
  // "/" → /calendar at the routing layer (was app/page.tsx calling redirect()),
  // so the home route costs no render. Not permanent: the default surface may
  // change, and 308s get cached by browsers. Middleware still sends
  // unauthenticated users to /login first.
  async redirects() {
    return [{ source: "/", destination: "/calendar", permanent: false }];
  },
  // React Compiler (stable in Next 16) auto-memoizes the client tree, so the
  // heavy calendar/task components don't need hand-written React.memo/useCallback.
  // Next applies the Babel pass only to relevant files via an SWC pre-pass, so
  // the build-time cost stays small. Do NOT add blanket manual memoization on top.
  reactCompiler: true,
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

export default nextConfig;
