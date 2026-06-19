// Scope/visibility + client overlay/category filtering (pure).
// Times are epoch milliseconds (UTC); intervals are half-open [start,end).
//
// The visibility LADDER has four rungs (most → least restricted):
//   1. private  — `isPrivate`; only the owner sees it. Never leaves the household.
//   2. visible  — the default; both members see it (overlaid read-only on the
//                 owner's layer), only the owner edits.
//   3. shared   — JOINT (`isShared`, i.e. a Shared context): both members see it
//                 without overlaying the owner, and both may edit ("we both attend").
//   4. public   — exposed by a share link to anonymous viewers (Phase 4). See
//                 `publicVisible` / `redactForPublic` below.
// RLS enforces rungs 1–3 server-side for authenticated members; rung 4 is enforced
// by a strict server-side filter (a SECURITY DEFINER RPC) because the anon path has
// NO member RLS context — see lib/supabase/queries.ts#fetchWindowPublic.

import type { Occurrence } from "@/lib/types";

/**
 * Whether a viewer may SEE an item: a joint item is visible to both members; the
 * owner always sees their own; others see it only if it isn't private.
 */
export function canSee(
  e: { isPrivate: boolean; ownerId: string; isShared: boolean },
  viewerId: string,
): boolean {
  return e.isShared || e.ownerId === viewerId || !e.isPrivate;
}

/** Whether a viewer may EDIT an item: its owner, or either member if it's joint. */
export function canEdit(
  e: { ownerId: string; isShared: boolean },
  viewerId: string,
): boolean {
  return e.isShared || e.ownerId === viewerId;
}

/** The display layer (calendar) an item belongs to: always its owner. */
export function layerOf(e: { ownerId: string }): string {
  return e.ownerId;
}

/**
 * Filter occurrences for the calendar view. Keep `o` iff it is joint (a Shared
 * context — always shown to both), or belongs to the viewer's own calendar, or
 * to an explicitly-overlaid member's calendar — and its category (when set)
 * isn't hidden. The viewer's own calendar is shown by default; setting
 * `selfHidden` hides the viewer's own personal items (joint/Shared items still
 * show). Other members appear only when toggled on in the sidebar. Hiding a
 * context still hides its joint items (the hidden-category clause applies to
 * everything).
 */
export function filterVisible(
  occ: Occurrence[],
  args: {
    viewerId: string;
    overlayMemberIds: Set<string>;
    hiddenCategoryIds: Set<string>;
    selfHidden: boolean;
  },
): Occurrence[] {
  const { viewerId, overlayMemberIds, hiddenCategoryIds, selfHidden } = args;
  return occ.filter(
    (o) =>
      ((!selfHidden && o.ownerId === viewerId) ||
        o.isShared ||
        overlayMemberIds.has(o.ownerId)) &&
      !(o.categoryId !== null && hiddenCategoryIds.has(o.categoryId)),
  );
}

// --- Public tier (rung 4) ---------------------------------------------------
//
// A share link exposes a read-only slice of the workspace's calendar to anonymous
// viewers. `publicVisible` is the SINGLE SOURCE OF TRUTH for "may an anonymous
// viewer see this item." Three things consume the SAME rule and MUST stay in
// lockstep (the parity is unit-tested):
//   • the SQL SECURITY DEFINER RPC `public_calendar_events` (the anon read path);
//   • `fetchWindowPublic` (server, mirrors the window prune);
//   • present mode (Shift+P), which redacts the authed calendar to the public view.

/** What a single share link exposes. */
export interface PublicShareConfig {
  /** 'details' shows real titles; 'busy' redacts every block to a generic label. */
  mode: "details" | "busy";
  /** Category allow-list; null = every (non-private, non-hidden) category, incl.
   *  uncategorized. A non-null list shows ONLY those categories (uncategorized
   *  items — `categoryId === null` — are then excluded). */
  categoryIds: string[] | null;
}

/** The generic placeholder a busy-mode block shows instead of its real title. The
 *  SQL RPC emits the same literal so a direct call can't read titles. */
export const PUBLIC_BUSY_LABEL = "Busy";

/** The most-permissive public view: all categories, real titles. Present mode uses
 *  this so the owner previews the maximum any public link could expose. */
export const MAX_PUBLIC_CONFIG: PublicShareConfig = {
  mode: "details",
  categoryIds: null,
};

/**
 * Whether an anonymous public viewer may SEE an item under a share config. NEVER
 * true for a private item, a hidden-from-public item, or an inactive block
 * (sleep/holds never surface publicly); a non-null `categoryIds` further narrows
 * to the allow-list. Mirrors the SQL filter in `public_calendar_events` exactly.
 */
export function publicVisible(
  e: {
    isPrivate: boolean;
    hiddenFromPublic: boolean;
    inactive: boolean;
    categoryId: string | null;
  },
  cfg: PublicShareConfig,
): boolean {
  if (e.isPrivate || e.hiddenFromPublic || e.inactive) return false;
  if (cfg.categoryIds === null) return true;
  return e.categoryId !== null && cfg.categoryIds.includes(e.categoryId);
}

/**
 * Redact an occurrence for the public view. In 'busy' mode the title collapses to
 * the generic label and description/location are stripped (the SQL RPC does the
 * same, so a direct RPC call can't leak them); 'details' mode returns the
 * occurrence unchanged. Apply ONLY to occurrences that already passed
 * `publicVisible`.
 */
export function redactForPublic(
  o: Occurrence,
  cfg: PublicShareConfig,
): Occurrence {
  if (cfg.mode !== "busy") return o;
  return { ...o, title: PUBLIC_BUSY_LABEL, description: null, location: null };
}

/**
 * The public slice of an expanded occurrence list: keep only publicly-visible
 * occurrences, then redact per the config. Used by present mode; the anon read
 * path applies the same logic server-side (SQL) + at expansion. Pure.
 */
export function filterPublic(
  occ: Occurrence[],
  cfg: PublicShareConfig,
): Occurrence[] {
  const out: Occurrence[] = [];
  for (const o of occ) {
    if (publicVisible(o, cfg)) out.push(redactForPublic(o, cfg));
  }
  return out;
}
