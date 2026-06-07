"use client";

import { useEffect } from "react";
import { m } from "motion/react";
import { tween } from "@/lib/motion";

// Persists across client navigations within a session (module scope), but resets
// on a full reload. We use it to skip the transition on the very first paint:
// animating the initial load would be a page-load sequence (the product bans
// that — users load into a task, they don't want to watch it appear). On every
// subsequent in-app navigation the template re-mounts and the fade plays.
let navigated = false;

/**
 * A subtle crossfade on route navigation (Calendar ↔ Tasks, Settings, ...).
 * App Router unmounts the old route before an exit could play, so this is
 * enter-only: opacity only (no transform) to avoid any full-height scroll shift.
 * `reducedMotion="user"` (MotionConfig in app/providers.tsx) drops it for users
 * who ask for it. React Query's cache (staleTime 5min) means the per-nav
 * re-mount doesn't trigger refetches.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const animate = navigated;
  useEffect(() => {
    navigated = true;
  }, []);

  if (!animate) return <>{children}</>;

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
