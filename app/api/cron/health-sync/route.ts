import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { syncMember } from "@/lib/health/sync";
import { withHealthSyncLock } from "@/lib/health/lock";

/**
 * GET /api/cron/health-sync — the scheduled Fitbit Air sync (vercel.json's
 * `crons`). Gated by `CRON_SECRET`: Vercel calls cron routes with
 * `Authorization: Bearer <CRON_SECRET>`, so any other caller (including a
 * guessed URL) gets a 401 with no work done.
 *
 * Hobby plan allows exactly one cron run/day — this iterates every active
 * connection once per invocation; the 30-min sync-on-read path
 * (`syncMemberIfStale`, called from the Sleep tab and the MCP tools) is what
 * actually keeps data fresh through the rest of the day.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: connections, error } = await admin
    .from("health_connections")
    .select("member_id")
    .eq("status", "active");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = await Promise.allSettled(
    (connections ?? []).map(({ member_id }) =>
      withHealthSyncLock(member_id as string, () => syncMember(admin, member_id as string)),
    ),
  );

  const synced = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - synced;
  return NextResponse.json({ members: results.length, synced, failed });
}
