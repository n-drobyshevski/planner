import { NextResponse } from "next/server";

import { currentMember } from "@/lib/health/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncMember } from "@/lib/health/sync";
import { withHealthSyncLock } from "@/lib/health/lock";

/**
 * POST /api/health/sync — the settings "Sync now" button. Unlike
 * `syncMemberIfStale`, this ignores the 30-minute staleness window (the
 * member explicitly asked), but still goes through the same lock so it can't
 * race a concurrent cron/sync-on-read run for the same member.
 */
export async function POST(): Promise<Response> {
  const member = await currentMember();
  if (!member) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  try {
    const result = await withHealthSyncLock(member.memberId, () =>
      syncMember(admin, member.memberId, { days: 14 }),
    );
    if ("skipped" in result) {
      return NextResponse.json({ synced: false, reason: "sync_in_progress" });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { synced: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
