"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { fetchPublicShares } from "@/lib/supabase/queries";
import { mapPublicShare } from "@/lib/supabase/mappers";
import { qk } from "@/lib/supabase/query-keys";
import type { PublicShareRow } from "@/lib/types";

/**
 * The owner's public calendar share links (Phase 4). RLS is owner-only and
 * auto-scoped, so the read is just "all rows in this workspace"; every write
 * invalidates the list so the UI reflects the server truth (tokens, timestamps).
 *
 * These hooks talk to `public_calendar_shares` directly rather than through a
 * shared mutation module — the surface is small and owned entirely by Settings.
 */

/** Fields the owner sets when minting a link; token + timestamps are DB-side. */
export interface CreateShareInput {
  label: string | null;
  mode: PublicShareRow["mode"];
  /** category allow-list; null = all categories */
  categoryIds: string[] | null;
  /** show inactive (sleep/blocked) time as a shaded "Unavailable" band */
  showInactive: boolean;
  /** epoch ms; null = never expires */
  expiresAt: number | null;
}

/** Mutable fields on an existing link. */
export type UpdateSharePatch = Partial<CreateShareInput>;

export function usePublicShares(workspaceId: string | undefined): {
  shares: PublicShareRow[];
  isLoading: boolean;
  isError: boolean;
} {
  const sb = createClient();
  const query = useQuery({
    queryKey: workspaceId
      ? qk.publicShares(workspaceId)
      : ["public-shares", "disabled"],
    enabled: Boolean(workspaceId),
    queryFn: () => fetchPublicShares(sb, workspaceId as string),
  });
  return {
    shares: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/**
 * Create a new share link. The DB fills the token and timestamps; we only set
 * the owner's choices plus the RLS-required workspace_id + owner_id. Returns the
 * persisted row. On failure the error toasts and re-throws so the caller's
 * submit handler can keep the dialog open.
 */
export function useCreateShare(
  workspaceId: string | undefined,
  memberId: string | undefined,
): (input: CreateShareInput) => Promise<PublicShareRow | undefined> {
  const qc = useQueryClient();

  return useCallback(
    async (input) => {
      if (!workspaceId || !memberId) return undefined;
      try {
        const { data, error } = await createClient()
          .from("public_calendar_shares")
          .insert({
            workspace_id: workspaceId,
            owner_id: memberId,
            label: input.label,
            mode: input.mode,
            category_ids: input.categoryIds,
            show_inactive: input.showInactive,
            expires_at:
              input.expiresAt == null
                ? null
                : new Date(input.expiresAt).toISOString(),
          })
          .select()
          .single();
        if (error) throw error;
        const saved = mapPublicShare(data);
        await qc.invalidateQueries({ queryKey: qk.publicShares(workspaceId) });
        return saved;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't create the link");
        throw e;
      }
    },
    [workspaceId, memberId, qc],
  );
}

/** Patch an existing link's label, mode, scope, or expiry. */
export function useUpdateShare(
  workspaceId: string | undefined,
): (id: string, patch: UpdateSharePatch) => Promise<void> {
  const qc = useQueryClient();

  return useCallback(
    async (id, patch) => {
      if (!workspaceId) return;
      const row: Record<string, unknown> = {};
      if ("label" in patch) row.label = patch.label;
      if ("mode" in patch) row.mode = patch.mode;
      if ("categoryIds" in patch) row.category_ids = patch.categoryIds;
      if ("showInactive" in patch) row.show_inactive = patch.showInactive;
      if ("expiresAt" in patch) {
        row.expires_at =
          patch.expiresAt == null
            ? null
            : new Date(patch.expiresAt).toISOString();
      }
      try {
        const { error } = await createClient()
          .from("public_calendar_shares")
          .update(row)
          .eq("id", id);
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: qk.publicShares(workspaceId) });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't update the link");
        throw e;
      }
    },
    [workspaceId, qc],
  );
}

/** Permanently disable a link (stamps revoked_at); the URL stops resolving. */
export function useRevokeShare(
  workspaceId: string | undefined,
): (id: string) => Promise<void> {
  const qc = useQueryClient();

  return useCallback(
    async (id) => {
      if (!workspaceId) return;
      try {
        const { error } = await createClient()
          .from("public_calendar_shares")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: qk.publicShares(workspaceId) });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't revoke the link");
        throw e;
      }
    },
    [workspaceId, qc],
  );
}

/** Re-enable a revoked link (clears revoked_at). */
export function useUnrevokeShare(
  workspaceId: string | undefined,
): (id: string) => Promise<void> {
  const qc = useQueryClient();

  return useCallback(
    async (id) => {
      if (!workspaceId) return;
      try {
        const { error } = await createClient()
          .from("public_calendar_shares")
          .update({ revoked_at: null })
          .eq("id", id);
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: qk.publicShares(workspaceId) });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't restore the link");
        throw e;
      }
    },
    [workspaceId, qc],
  );
}

/** Delete a link for good (it disappears from the list). */
export function useDeleteShare(
  workspaceId: string | undefined,
): (id: string) => Promise<void> {
  const qc = useQueryClient();

  return useCallback(
    async (id) => {
      if (!workspaceId) return;
      const key = qk.publicShares(workspaceId);
      const prev = qc.getQueryData<PublicShareRow[]>(key);
      qc.setQueryData<PublicShareRow[]>(key, (old) =>
        (old ?? []).filter((s) => s.id !== id),
      );
      try {
        const { error } = await createClient()
          .from("public_calendar_shares")
          .delete()
          .eq("id", id);
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: key });
      } catch (e) {
        if (prev) qc.setQueryData(key, prev);
        toast.error(e instanceof Error ? e.message : "Couldn't delete the link");
        throw e;
      }
    },
    [workspaceId, qc],
  );
}
