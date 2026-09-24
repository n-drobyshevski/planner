import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { mapSleepLog } from "@/lib/supabase/mappers";
import { healthDailyInputToRow, sleepLogAutoFillToRow } from "@/lib/supabase/mappers";
import { allDayDateKey } from "@/lib/datetime/local";
import type { SleepLogSource } from "@/lib/types";
import {
  refreshAccessToken,
  fetchDay,
  GoogleOAuthError,
  type HealthDayData,
} from "@/lib/health/google";
import { encryptToken, decryptToken, bufferToPgBytea, pgByteaToBuffer } from "@/lib/health/crypto";
import { withHealthSyncLock } from "@/lib/health/lock";

const DAY_MS = 86_400_000;

// --- pure decision logic (unit-tested directly) -----------------------------

export interface ExistingSleepLog {
  bedtimeAt: number | null;
  wokeAt: number | null;
  quality: number | null;
  fatigue: number | null;
  note: string | null;
  source: SleepLogSource;
}

export interface AutoFillDecision {
  shouldWrite: boolean;
  /** The source the row should carry if `shouldWrite`. */
  source: Extract<SleepLogSource, "fitbit" | "fitbit+manual">;
}

/**
 * Whether — and how — the sync's auto-fill may write a night's bedtime/wake
 * times. Never touches quality/fatigue/note (the caller's row builder,
 * `sleepLogAutoFillToRow`, structurally can't carry them at all).
 *
 * Writes when there's no existing row, the existing row has no times yet, or
 * the existing times were themselves written by a PRIOR sync (source
 * 'fitbit'/'fitbit+manual' — so a resync with fresher data may still update
 * them). Never overwrites a member's own manually-entered times. The
 * resulting source keeps '+manual' once a quality/fatigue/note rating exists,
 * so a later read never loses the "this night has a check-in too" signal.
 */
export function resolveSleepAutoFill(existing: ExistingSleepLog | null): AutoFillDecision {
  const timesEmpty = existing === null || (existing.bedtimeAt === null && existing.wokeAt === null);
  const previouslySynced = existing?.source === "fitbit" || existing?.source === "fitbit+manual";
  const shouldWrite = timesEmpty || previouslySynced;
  const hasManualRating =
    existing !== null &&
    (existing.quality !== null || existing.fatigue !== null || existing.note !== null);
  return { shouldWrite, source: hasManualRating ? "fitbit+manual" : "fitbit" };
}

// --- syncMember --------------------------------------------------------------

export interface SyncResult {
  synced: boolean;
  reason?: "not_connected" | "revoked" | "error";
  daysSynced?: number;
}

async function markConnection(
  admin: SupabaseClient,
  memberId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await admin
    .from("health_connections")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("member_id", memberId);
}

async function autoFillSleepLog(
  admin: SupabaseClient,
  params: {
    workspaceId: string;
    memberId: string;
    date: string;
    bedtimeAt: number;
    wokeAt: number;
  },
): Promise<void> {
  // Explicit member_id filter — the admin client bypasses RLS, so this scope
  // has to come from the query itself, not the database's row policies.
  const { data: existingRow, error } = await admin
    .from("sleep_logs")
    .select("*")
    .eq("member_id", params.memberId)
    .eq("date", params.date)
    .maybeSingle();
  if (error) throw error;

  const existing: ExistingSleepLog | null = existingRow
    ? (() => {
        const mapped = mapSleepLog(existingRow);
        return {
          bedtimeAt: mapped.bedtimeAt,
          wokeAt: mapped.wokeAt,
          quality: mapped.quality,
          fatigue: mapped.fatigue,
          note: mapped.note,
          source: mapped.source ?? "manual",
        };
      })()
    : null;

  const decision = resolveSleepAutoFill(existing);
  if (!decision.shouldWrite) return;

  const row = sleepLogAutoFillToRow({
    workspaceId: params.workspaceId,
    memberId: params.memberId,
    date: params.date,
    bedtimeAt: params.bedtimeAt,
    wokeAt: params.wokeAt,
    source: decision.source,
  });
  const { error: upsertErr } = await admin
    .from("sleep_logs")
    .upsert(row, { onConflict: "member_id,date" });
  if (upsertErr) throw upsertErr;
}

/**
 * Sync one member's last `days` of Google Health data: refresh the access
 * token (rotating + re-encrypting the refresh token when Google issues a new
 * one), fetch, upsert `health_daily`, and auto-fill `sleep_logs`. Every query
 * against member-private tables filters on `member_id` explicitly — `admin`
 * bypasses RLS, so that filter is the only thing scoping these reads/writes.
 *
 * Never throws for "expected" outcomes (not connected, revoked); those come
 * back as a `SyncResult`. Unexpected failures (network, decrypt, DB) DO
 * throw, after recording `status: 'error'` on the connection — callers that
 * must never fail (MCP tools, sync-on-read) go through `syncMemberIfStale`,
 * which catches everything.
 */
export async function syncMember(
  admin: SupabaseClient,
  memberId: string,
  opts: { days?: number } = {},
): Promise<SyncResult> {
  const days = opts.days ?? 3;

  const { data: conn, error: connErr } = await admin
    .from("health_connections")
    .select("*")
    .eq("member_id", memberId)
    .maybeSingle();
  if (connErr) throw connErr;
  if (!conn || conn.status === "revoked" || !conn.refresh_token_enc) {
    return { synced: false, reason: conn?.status === "revoked" ? "revoked" : "not_connected" };
  }
  const workspaceId = conn.workspace_id as string;

  let refreshToken: string;
  try {
    refreshToken = decryptToken(pgByteaToBuffer(conn.refresh_token_enc as string));
  } catch (err) {
    await markConnection(admin, memberId, {
      status: "error",
      last_error: "Couldn't decrypt the stored token.",
    });
    throw err;
  }

  let tokens;
  try {
    tokens = await refreshAccessToken(refreshToken);
  } catch (err) {
    if (err instanceof GoogleOAuthError && err.code === "invalid_grant") {
      await markConnection(admin, memberId, {
        status: "revoked",
        last_error: "Google revoked this connection. Reconnect in Settings to resume syncing.",
      });
      return { synced: false, reason: "revoked" };
    }
    await markConnection(admin, memberId, {
      status: "error",
      last_error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  // Google doesn't always rotate the refresh token on a plain refresh_token
  // grant — only store + re-encrypt it when one comes back.
  if (tokens.refreshToken) {
    await admin
      .from("health_connections")
      .update({
        refresh_token_enc: bufferToPgBytea(encryptToken(tokens.refreshToken)),
        updated_at: new Date().toISOString(),
      })
      .eq("member_id", memberId);
  }

  const endDate = allDayDateKey(Date.now());
  const startDate = allDayDateKey(Date.now() - (days - 1) * DAY_MS);

  let entries: HealthDayData[];
  try {
    entries = await fetchDay(tokens.accessToken, { startDate, endDate });
  } catch (err) {
    await markConnection(admin, memberId, {
      status: "error",
      last_error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  for (const entry of entries) {
    const { error } = await admin.from("health_daily").upsert(
      healthDailyInputToRow({
        workspaceId,
        memberId,
        date: entry.date,
        sleepStart: entry.sleepStart ? Date.parse(entry.sleepStart) : null,
        sleepEnd: entry.sleepEnd ? Date.parse(entry.sleepEnd) : null,
        minutesAsleep: entry.minutesAsleep,
        minutesDeep: entry.minutesDeep,
        minutesLight: entry.minutesLight,
        minutesRem: entry.minutesRem,
        minutesAwake: entry.minutesAwake,
        efficiency: entry.efficiency,
        hrvMs: entry.hrvMs,
        restingHr: entry.restingHr,
        spo2Avg: entry.spo2Avg,
        steps: entry.steps,
        activeZoneMinutes: entry.activeZoneMinutes,
        exerciseMinutes: entry.exerciseMinutes,
      }),
      { onConflict: "member_id,date" },
    );
    if (error) throw error;

    if (entry.sleepStart && entry.sleepEnd) {
      await autoFillSleepLog(admin, {
        workspaceId,
        memberId,
        date: entry.date,
        bedtimeAt: Date.parse(entry.sleepStart),
        wokeAt: Date.parse(entry.sleepEnd),
      });
    }
  }

  await markConnection(admin, memberId, {
    status: "active",
    last_synced_at: new Date().toISOString(),
    last_error: null,
  });

  return { synced: true, daysSynced: entries.length };
}

/**
 * Sync-on-read: refresh `memberId`'s health data if it's older than
 * `staleMinutes` (default 30), otherwise no-op. Used from the Insights →
 * Sleep tab open and the `get_sleep_summary`/`get_health` MCP tools. NEVER
 * throws — every failure (no connection, revoked, network, Google 5xx) is
 * caught and logged, so a caller that "must never fail the tool" can call
 * this unconditionally and just read whatever's already stored afterward.
 */
export async function syncMemberIfStale(
  memberId: string,
  opts: { staleMinutes?: number; days?: number } = {},
): Promise<void> {
  const staleMinutes = opts.staleMinutes ?? 30;
  try {
    const admin = createAdminClient();
    const { data: conn } = await admin
      .from("health_connections")
      .select("status, last_synced_at")
      .eq("member_id", memberId)
      .maybeSingle();
    if (!conn || conn.status !== "active") return;
    const lastSyncedAt = conn.last_synced_at
      ? new Date(conn.last_synced_at as string).getTime()
      : 0;
    if (Date.now() - lastSyncedAt < staleMinutes * 60_000) return;

    await withHealthSyncLock(memberId, () =>
      syncMember(admin, memberId, opts.days !== undefined ? { days: opts.days } : undefined),
    );
  } catch (err) {
    console.warn(`[planner] health sync-on-read failed for member ${memberId}:`, err);
  }
}
