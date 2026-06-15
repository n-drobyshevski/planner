"use client";

import type { QueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/supabase/query-keys";
import type { WorkspaceData } from "@/lib/hooks/use-workspace";
import type { Collection, Category, Member } from "@/lib/types";

// Optimistic patches for the cached workspace bundle (qk.workspace). The mirror
// of patchEventWindows in use-event-mutations: a mutation applies the patch
// before the server round-trip so the change shows instantly, and calls the
// returned rollback if the write throws. The success-path invalidate — plus
// realtime — reconciles the cache with server truth afterwards.

/**
 * Apply `mutate` to the cached workspace bundle and return a rollback that
 * restores the pre-patch snapshot. No-op (rollback does nothing) when the
 * bundle isn't cached yet.
 */
export function patchWorkspace(
  qc: QueryClient,
  mutate: (data: WorkspaceData) => WorkspaceData,
): () => void {
  const prev = qc.getQueryData<WorkspaceData>(qk.workspace);
  if (!prev) return () => {};
  qc.setQueryData<WorkspaceData>(qk.workspace, (d) => (d ? mutate(d) : d));
  return () => qc.setQueryData(qk.workspace, prev);
}

export const patchCollectionById =
  (id: string, patch: Partial<Collection>) =>
  (d: WorkspaceData): WorkspaceData => ({
    ...d,
    collections: d.collections.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  });

export const removeCollectionById =
  (id: string) =>
  (d: WorkspaceData): WorkspaceData => ({
    ...d,
    collections: d.collections.filter((c) => c.id !== id),
  });

export const patchCategoryById =
  (id: string, patch: Partial<Category>) =>
  (d: WorkspaceData): WorkspaceData => ({
    ...d,
    categories: d.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  });

export const removeCategoryById =
  (id: string) =>
  (d: WorkspaceData): WorkspaceData => ({
    ...d,
    categories: d.categories.filter((c) => c.id !== id),
  });

/** Patch a member by id, keeping the separate `currentMember` reference in sync. */
export const patchMemberById =
  (id: string, patch: Partial<Member>) =>
  (d: WorkspaceData): WorkspaceData => ({
    ...d,
    members: d.members.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    currentMember:
      d.currentMember?.id === id
        ? { ...d.currentMember, ...patch }
        : d.currentMember,
  });
