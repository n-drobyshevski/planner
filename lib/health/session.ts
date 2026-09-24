import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface CurrentMember {
  memberId: string;
  workspaceId: string;
}

/**
 * Resolve the signed-in member from the request's cookie session — the same
 * claims -> `members` lookup app/api/insights/digest/route.ts and
 * app/api/oauth/decision/route.ts already use. `null` when there's no valid
 * session or it maps to no member.
 */
export async function currentMember(): Promise<CurrentMember | null> {
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;
  const { data: member } = await sb
    .from("members")
    .select("id, workspace_id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!member) return null;
  return { memberId: member.id as string, workspaceId: member.workspace_id as string };
}
