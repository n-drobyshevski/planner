"use client";

import { Crossfade } from "@/components/crossfade";

/**
 * Crossfade on top-level route changes (e.g. a surface ↔ /settings). Surface ↔
 * surface navigation no longer remounts this template — all three surfaces live
 * under the (surfaces) route group, so the root's child segment doesn't change;
 * their content fade lives in app/(surfaces)/template.tsx instead, below the
 * persistent surface header.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <Crossfade>{children}</Crossfade>;
}
