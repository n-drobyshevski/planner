import { NextResponse } from "next/server";

import { currentMember } from "@/lib/health/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { revokeToken } from "@/lib/health/google";
import { decryptToken, pgByteaToBuffer } from "@/lib/health/crypto";

/**
 * POST /api/health/disconnect — revoke the token at Google (best-effort; it
 * must succeed locally even if Google is unreachable) and delete the
 * member's `health_connections` row and every `health_daily` row. Sleep-log
 * nights the sync auto-filled are left as-is (they're the member's calendar
 * data now, not "Google's"); only the connection and the raw synced metrics
 * go away.
 */
export async function POST(): Promise<Response> {
  const member = await currentMember();
  if (!member) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: conn } = await admin
    .from("health_connections")
    .select("refresh_token_enc")
    .eq("member_id", member.memberId)
    .maybeSingle();

  if (conn?.refresh_token_enc) {
    try {
      const refreshToken = decryptToken(pgByteaToBuffer(conn.refresh_token_enc as string));
      await revokeToken(refreshToken);
    } catch (err) {
      console.warn("[planner] Couldn't revoke Google Health token (continuing):", err);
    }
  }

  await admin.from("health_daily").delete().eq("member_id", member.memberId);
  const { error } = await admin
    .from("health_connections")
    .delete()
    .eq("member_id", member.memberId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ disconnected: true });
}
