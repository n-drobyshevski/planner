"use client";

import { Crossfade } from "@/components/crossfade";

/**
 * Crossfade for surface↔surface navigation (Calendar ↔ Tasks ↔ Insights).
 * Lives below the (surfaces) layout, so the shared header stays put while the
 * content fades. The root app/template.tsx no longer remounts for these
 * navigations — its child segment is `(surfaces)` for all three routes.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <Crossfade>{children}</Crossfade>;
}
