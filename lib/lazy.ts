"use client";

import { useEffect } from "react";

/**
 * Warm one or more lazy chunks during browser idle time so the *first* open of a
 * deferred overlay (e.g. the event/task dialog) is still instant.
 *
 * The shells `next/dynamic`-load their heavy dialogs to keep the initial route
 * JS light, but the most-used dialogs would then pay a fetch on first open. The
 * module cache means warming a loader and the later `dynamic()` open share one
 * network fetch, so an idle prefetch removes that penalty without bloating first
 * paint. Falls back to a short timeout where `requestIdleCallback` is missing
 * (Safari). Runs once on mount; the loaders are module-scoped constants.
 */
export function useIdlePreload(loaders: Array<() => Promise<unknown>>) {
  useEffect(() => {
    const run = () => {
      for (const load of loaders) void load();
    };
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run);
      return () => window.cancelIdleCallback?.(id);
    }
    const t = setTimeout(run, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- module-scoped loaders, warm once
  }, []);
}
