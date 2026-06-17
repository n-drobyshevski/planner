"use client";

import { useEffect, useState } from "react";

// Insights filters are a personal lens, so they persist per viewer per device
// (localStorage), not in the URL — a shared insights link should never carry
// the sender's hidden-category ids to the recipient.
const STORAGE_PREFIX = "planner:insights:filters:v1:";

interface StoredFilters {
  hidden: string[];
  includeInactive: boolean;
}

function readFilters(storageKey: string): StoredFilters | null {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const p = parsed as Partial<StoredFilters>;
    return {
      hidden: Array.isArray(p.hidden)
        ? p.hidden.filter((id): id is string => typeof id === "string")
        : [],
      includeInactive: p.includeInactive === true,
    };
  } catch {
    /* private mode / corrupt entry — fall back to defaults */
  }
  return null;
}

function writeFilters(storageKey: string, next: StoredFilters) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    /* private mode — filters still apply for this mount via state */
  }
}

/**
 * The shell's insights-local filters, remembered per viewer per device.
 * State starts at the defaults and is reconciled from localStorage once the
 * viewer id arrives (post-mount, via the workspace query), so there's no
 * hydration mismatch — same pattern as `useSidebarWidth`. Setters write
 * through so the next visit starts where this one left off.
 */
export function useInsightsFilters(viewerId: string | undefined) {
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<Set<string>>(new Set());
  const [includeInactive, setIncludeInactive] = useState(false);

  const storageKey = viewerId ? `${STORAGE_PREFIX}${viewerId}` : null;

  useEffect(() => {
    if (!storageKey) return;
    const stored = readFilters(storageKey);
    if (!stored) return;
    setHiddenCategoryIds(new Set(stored.hidden));
    setIncludeInactive(stored.includeInactive);
  }, [storageKey]);

  function persist(patch: Partial<StoredFilters>) {
    if (!storageKey) return;
    writeFilters(storageKey, {
      hidden: [...hiddenCategoryIds],
      includeInactive,
      ...patch,
    });
  }

  return {
    hiddenCategoryIds,
    includeInactive,
    setHiddenCategoryIds: (ids: Set<string>) => {
      setHiddenCategoryIds(ids);
      persist({ hidden: [...ids] });
    },
    setIncludeInactive: (v: boolean) => {
      setIncludeInactive(v);
      persist({ includeInactive: v });
    },
  };
}
