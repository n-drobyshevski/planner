"use client";

import { useEffect, useState } from "react";
import type { MemberFilter } from "@/lib/insights/filters";

// Insights filters are a personal lens, so they persist per viewer per device
// (localStorage), not in the URL — a shared insights link should never carry
// the sender's "me" slice or their hidden-category ids to the recipient.
const STORAGE_PREFIX = "planner:insights:filters:v1:";

const MEMBER_VALUES: MemberFilter[] = ["me", "partner", "both"];

interface StoredFilters {
  member: MemberFilter;
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
      member: MEMBER_VALUES.includes(p.member as MemberFilter)
        ? (p.member as MemberFilter)
        : "both",
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
  const [memberFilter, setMemberFilter] = useState<MemberFilter>("both");
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<Set<string>>(new Set());
  const [includeInactive, setIncludeInactive] = useState(false);

  const storageKey = viewerId ? `${STORAGE_PREFIX}${viewerId}` : null;

  useEffect(() => {
    if (!storageKey) return;
    const stored = readFilters(storageKey);
    if (!stored) return;
    setMemberFilter(stored.member);
    setHiddenCategoryIds(new Set(stored.hidden));
    setIncludeInactive(stored.includeInactive);
  }, [storageKey]);

  function persist(patch: Partial<StoredFilters>) {
    if (!storageKey) return;
    writeFilters(storageKey, {
      member: memberFilter,
      hidden: [...hiddenCategoryIds],
      includeInactive,
      ...patch,
    });
  }

  return {
    memberFilter,
    hiddenCategoryIds,
    includeInactive,
    setMemberFilter: (m: MemberFilter) => {
      setMemberFilter(m);
      persist({ member: m });
    },
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
