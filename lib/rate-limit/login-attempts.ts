import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Durable login throttle, backing the per-instance in-memory bucket in the
 * login actions. Failed attempts are recorded in public.login_attempts
 * (service-role only) and counted over a sliding window, so the budget holds
 * across serverless instances and cold starts. Two axes: per-IP (distributed
 * name guessing) and per-member (a targeted attack on one account from
 * rotating IPs).
 */
export const LOGIN_WINDOW_MS = 15 * 60_000;
export const MAX_FAILURES_PER_IP = 10;
export const MAX_FAILURES_PER_MEMBER = 10;
const PRUNE_AFTER_MS = 24 * 3_600_000;

/** Pure budget decision — exported for unit tests. */
export function loginBlocked(ipFailures: number, memberFailures: number): boolean {
  return (
    ipFailures >= MAX_FAILURES_PER_IP || memberFailures >= MAX_FAILURES_PER_MEMBER
  );
}

/**
 * True when this caller has exhausted the durable failure budget. Counts are
 * head-only queries on the two indexed axes. A query error counts as zero
 * (fail open) — the in-memory bucket still applies, and login must not brick
 * on a transient DB hiccup.
 */
export async function loginThrottledDb(
  ip: string,
  memberId: string | null,
): Promise<boolean> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
  const [ipRes, memberRes] = await Promise.all([
    admin
      .from("login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", since),
    memberId
      ? admin
          .from("login_attempts")
          .select("id", { count: "exact", head: true })
          .eq("member_id", memberId)
          .gte("created_at", since)
      : Promise.resolve(null),
  ]);
  return loginBlocked(ipRes.count ?? 0, memberRes?.count ?? 0);
}

/** Record a failed attempt and opportunistically prune this IP's stale rows. */
export async function recordLoginFailure(
  ip: string,
  memberId: string | null,
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("login_attempts").insert({ ip, member_id: memberId });
  // Bounded TTL prune, mirroring the timeslot-request pattern: piggyback on
  // writes instead of a scheduled job, and touch only this IP's rows.
  await admin
    .from("login_attempts")
    .delete()
    .eq("ip", ip)
    .lt("created_at", new Date(Date.now() - PRUNE_AFTER_MS).toISOString());
}
