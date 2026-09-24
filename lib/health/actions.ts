"use server";

import { currentMember } from "@/lib/health/session";
import { syncMemberIfStale } from "@/lib/health/sync";

/**
 * Sync-on-read for the Insights → Sleep tab: called once when the tab opens
 * (see components/insights/sleep-tab.tsx). Resolves the member from the
 * session itself — never a client-supplied id — and never throws
 * (`syncMemberIfStale` already swallows every failure), so the tab always
 * renders from whatever's stored either way.
 */
export async function syncHealthOnSleepTabOpen(): Promise<void> {
  const member = await currentMember();
  if (!member) return;
  await syncMemberIfStale(member.memberId, { days: 3 });
}
