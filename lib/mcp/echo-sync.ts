import "server-only";

import { getEchoBoardSyncUrl } from "./env";

/**
 * The `sync_boards` tool's work: ask Echo (the user's Telegram companion) to
 * run one board-sync pass now, so the Obsidian task boards and the planner are
 * brought in step. Echo's `POST /planner/board-sync` takes the member's own
 * planner token as its bearer and checks it with Supabase itself, then that it
 * is the planner account Echo is linked to; there is no shared secret.
 *
 * Counts only travel back, never a board's or a task's name. Nothing here logs
 * the token or the answer.
 */

/** Echo waits up to 20 s for the pass; this leaves it room to answer. */
export const ECHO_SYNC_TIMEOUT_MS = 25_000;

/** The numbers Echo reports per board (Echo's `Counts`, snake_case as sent). */
export const SYNC_COUNT_FIELDS = [
  "cards_added",
  "cards_changed",
  "cards_tagged",
  "cards_removed",
  "tasks_created",
  "tasks_changed",
  "tasks_untagged",
  "paired",
  "conflicts",
  "skipped",
  "waiting",
  "held",
  "subs_added",
  "subs_changed",
  "subs_removed",
  "subs_created",
  "subs_detached",
  "deps_changed",
  "subs_paired",
] as const;

export type SyncCountField = (typeof SYNC_COUNT_FIELDS)[number];
export type SyncBoardOut = { outcome: string } & Record<SyncCountField, number>;

export type SyncBoardsOut =
  | { status: "done"; outcome: string; boards: SyncBoardOut[] }
  | { status: "queued" }
  | { status: "already_queued" }
  | { status: "failed" };

export type SyncBoardsResult = { ok: true; data: SyncBoardsOut } | { ok: false; message: string };

export const SYNC_MESSAGES = {
  notConfigured: "Sync with Obsidian is not configured on this planner (ECHO_BOARD_SYNC_URL).",
  rejected: "Echo did not accept this account. Link the same planner account in Echo (/planner_link).",
  off: "Board sync is off in Echo.",
  noAnswer: "Echo did not answer.",
  busy: "Echo is busy; try again in a minute.",
  broken: "Echo could not run the sync.",
} as const;

function board(raw: unknown): SyncBoardOut {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const out = { outcome: typeof r.outcome === "string" ? r.outcome : "unknown" } as SyncBoardOut;
  for (const name of SYNC_COUNT_FIELDS) {
    const v = r[name];
    out[name] = typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  }
  return out;
}

/** Echo's 200/202 body, narrowed to what the view may show. */
export function parseSyncBody(status: number, body: unknown): SyncBoardsOut | null {
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (status === 202) return { status: "queued" };
  if (b.status === "already_queued") return { status: "already_queued" };
  if (b.status === "failed") return { status: "failed" };
  if (b.status === "done") {
    return {
      status: "done",
      outcome: typeof b.outcome === "string" ? b.outcome : "unknown",
      boards: Array.isArray(b.boards) ? b.boards.map(board) : [],
    };
  }
  return null;
}

/** One request to Echo with the member's token. Never throws. */
export async function requestBoardSync(token: string): Promise<SyncBoardsResult> {
  const url = getEchoBoardSyncUrl();
  if (!url) return { ok: false, message: SYNC_MESSAGES.notConfigured };
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(ECHO_SYNC_TIMEOUT_MS),
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    return { ok: false, message: SYNC_MESSAGES.noAnswer };
  }
  if (response.status === 401 || response.status === 403) return { ok: false, message: SYNC_MESSAGES.rejected };
  if (response.status === 404) return { ok: false, message: SYNC_MESSAGES.off };
  if (response.status === 429) return { ok: false, message: SYNC_MESSAGES.busy };
  if (response.status !== 200 && response.status !== 202) return { ok: false, message: SYNC_MESSAGES.broken };
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    if (response.status !== 202) return { ok: false, message: SYNC_MESSAGES.broken };
  }
  const data = parseSyncBody(response.status, body);
  return data ? { ok: true, data } : { ok: false, message: SYNC_MESSAGES.broken };
}
