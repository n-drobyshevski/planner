"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { updateMember } from "@/lib/supabase/mutations";
import { useWorkspace, type WorkspaceData } from "@/lib/hooks/use-workspace";
import { qk } from "@/lib/supabase/query-keys";
import {
  setPassphrase,
  removePassphrase,
  verifyCurrentSecret,
} from "@/app/[locale]/login/actions";
import { useNotify } from "@/lib/hooks/use-notify";
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
 * Profile edits for the signed-in member: display name and the 8-digit PIN
 * "UX gate". The member row in Supabase is the source of truth; changes patch
 * the query cache optimistically and roll back on failure (mirrors
 * usePreferences). PIN values are hashed (sha256Hex) before they leave the
 * client; only `pin_hash` is ever written.
 */
export function useProfile() {
  const workspace = useWorkspace();
  const member = workspace.data?.currentMember ?? null;
  const qc = useQueryClient();
  const { success: notifySuccess } = useNotify();

  const optimistic = useCallback(
    async (patch: Partial<Member>, run: () => Promise<void>, okMsg: string) => {
      if (!member) return false;
      const prev = qc.getQueryData<WorkspaceData>(qk.workspace);
      qc.setQueryData<WorkspaceData>(qk.workspace, (d) =>
        patchCachedMember(d, member.id, patch),
      );
      try {
        await run();
        notifySuccess(okMsg);
        return true;
      } catch (e) {
        if (prev) qc.setQueryData(qk.workspace, prev); // roll back
        toast.error(e instanceof Error ? e.message : "Something went wrong");
        return false;
      }
    },
    [member, qc, notifySuccess],
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

  const saveColor = useCallback(
    (color: string) => {
      if (!member) return Promise.resolve(false);
      return optimistic(
        { color },
        () => updateMember(createClient(), member.id, { color }),
        "Profile color updated",
      );
    },
    [member, optimistic],
  );

  /** Compare a candidate PIN against the stored secret (verified server-side, scrypt). */
  const verifyCurrentPin = useCallback(
    (pin: string): Promise<boolean> => verifyCurrentSecret(pin),
    [],
  );

  /** Set a new PIN (string) or clear it (null). Hashed with salted scrypt server-side. */
  const savePin = useCallback(
    async (pin: string | null) => {
      if (!member) return false;
      return optimistic(
        { hasPin: pin != null },
        async () => {
          const res = pin ? await setPassphrase(pin) : await removePassphrase();
          if ("error" in res) throw new Error(res.error);
        },
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
    saveColor,
    verifyCurrentPin,
    savePin,
  };
}
