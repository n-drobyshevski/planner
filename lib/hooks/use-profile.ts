"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { updateMember, updateMemberPin } from "@/lib/supabase/mutations";
import { useWorkspace, type WorkspaceData } from "@/lib/hooks/use-workspace";
import { qk } from "@/lib/supabase/query-keys";
import { sha256Hex } from "@/lib/auth/pin";
import type { Member } from "@/lib/types";

/** Patch the cached workspace bundle so the current member updates everywhere at once. */
function patchCachedMember(
  data: WorkspaceData | undefined,
  memberId: string,
  patch: Partial<Member>,
): WorkspaceData | undefined {
  if (!data) return data;
  const apply = (m: Member): Member => (m.id === memberId ? { ...m, ...patch } : m);
  return {
    ...data,
    members: data.members.map(apply),
    currentMember: data.currentMember ? apply(data.currentMember) : null,
  };
}

/**
 * Profile edits for the signed-in member: display name and the 4-digit PIN
 * "UX gate". The member row in Supabase is the source of truth; changes patch
 * the query cache optimistically and roll back on failure (mirrors
 * usePreferences). PIN values are hashed (sha256Hex) before they leave the
 * client; only `pin_hash` is ever written.
 */
export function useProfile() {
  const workspace = useWorkspace();
  const member = workspace.data?.currentMember ?? null;
  const qc = useQueryClient();

  const optimistic = useCallback(
    async (patch: Partial<Member>, run: () => Promise<void>, okMsg: string) => {
      if (!member) return false;
      const prev = qc.getQueryData<WorkspaceData>(qk.workspace);
      qc.setQueryData<WorkspaceData>(qk.workspace, (d) =>
        patchCachedMember(d, member.id, patch),
      );
      try {
        await run();
        toast.success(okMsg);
        return true;
      } catch (e) {
        if (prev) qc.setQueryData(qk.workspace, prev); // roll back
        toast.error(e instanceof Error ? e.message : "Something went wrong");
        return false;
      }
    },
    [member, qc],
  );

  const saveName = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!member || !trimmed) return Promise.resolve(false);
      return optimistic(
        { name: trimmed },
        () => updateMember(createClient(), member.id, { name: trimmed }),
        "Name updated",
      );
    },
    [member, optimistic],
  );

  /** Compare a candidate PIN against the stored hash (re-selected; not cached). */
  const verifyCurrentPin = useCallback(
    async (pin: string): Promise<boolean> => {
      if (!member) return false;
      const { data, error } = await createClient()
        .from("members")
        .select("pin_hash")
        .eq("id", member.id)
        .single();
      if (error || !data?.pin_hash) return false;
      return (await sha256Hex(pin)) === data.pin_hash;
    },
    [member],
  );

  /** Set a new PIN (string) or clear it (null). */
  const savePin = useCallback(
    async (pin: string | null) => {
      if (!member) return false;
      const hash = pin ? await sha256Hex(pin) : null;
      return optimistic(
        { hasPin: pin != null },
        () => updateMemberPin(createClient(), member.id, hash),
        pin ? "PIN updated" : "PIN removed",
      );
    },
    [member, optimistic],
  );

  return {
    member,
    /** false until the signed-in member is resolved (controls disabled meanwhile). */
    isReady: member != null,
    saveName,
    verifyCurrentPin,
    savePin,
  };
}
