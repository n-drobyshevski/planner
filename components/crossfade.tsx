"use client";

import { m } from "motion/react";
import { tween } from "@/lib/motion";

// Shared by every <Crossfade> in the tree (the root + (surfaces) templates) and
// persists across client navigations within a session (module scope); a full
// reload resets it. It gates the enter animation so the very first paint of a
// session never animates — animating the initial load would be a page-load
// sequence, which the product bans (users load straight into a task; they don't
// want to watch it appear).
//
// It flips on the first real route change (reported by the navigation watcher in
// app/providers), NOT on mount. Mounting also happens during initial hydration,
// and the (surfaces) segment hydrates late inside a React <Activity>, so a
// mount-time flip let the root template's effect set the flag before the nested
// template hydrated — which then rendered an enter wrapper the server never
// emitted, i.e. a hydration mismatch. Flipping only on navigation keeps the flag
// false for the entire initial load, so server and client agree.
let navigated = false;

/** Reported by the navigation watcher (app/providers) on the first route change. */
export function markNavigated() {
  navigated = true;
}

/**
 * A subtle crossfade on route navigation, rendered by the route templates
 * (app/template.tsx and app/(surfaces)/template.tsx). App Router unmounts the
 * old route before an exit could play, so this is enter-only: opacity only (no
 * transform) to avoid any full-height scroll shift. `reducedMotion="user"`
 * (MotionConfig in app/providers.tsx) drops it for users who ask for it. React
 * Query's cache (staleTime 5min) means the per-nav re-mount doesn't trigger
 * refetches.
 */
export function Crossfade({ children }: { children: React.ReactNode }) {
  if (!navigated) return <>{children}</>;

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: tween }}
      className="h-full"
    >
      {children}
    </m.div>
  );
}
