import "server-only";
import { randomUUID } from "node:crypto";
import { createClient as createRedisClient, type RedisClientType } from "redis";

/**
 * A short-lived per-member Redis lock so a cron run, sync-on-read, and a
 * manual "Sync now" click can never refresh/upsert the same member's health
 * data concurrently. Reuses the same Redis connection string mcp-handler
 * already needs (lib/mcp/env.ts's REDIS_URL/KV_URL) rather than adding a
 * second Redis dependency to the deployment.
 *
 * Degrades to running unlocked (not to failing) when no Redis URL is
 * configured — health sync must keep working in local dev / on Hobby without
 * the MCP feature turned on; the lock is a safety net for concurrent
 * triggers, not a correctness requirement of a single sync.
 */

const LOCK_TTL_MS = 60_000;

function getRedisUrl(): string | undefined {
  return process.env.REDIS_URL || process.env.KV_URL;
}

let clientPromise: Promise<RedisClientType> | null = null;

async function getClient(): Promise<RedisClientType | null> {
  const url = getRedisUrl();
  if (!url) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = createRedisClient({ url });
      // Without a listener, a dropped connection crashes the process (node-redis
      // emits 'error' on the EventEmitter) — swallow it, callers already treat a
      // failed getClient() as "no lock available".
      client.on("error", () => {});
      await client.connect();
      return client as RedisClientType;
    })();
  }
  try {
    return await clientPromise;
  } catch {
    clientPromise = null; // let the next call retry the connection
    return null;
  }
}

/**
 * Run `fn` while holding `health-sync-lock:<memberId>`. Returns `{ skipped:
 * true }` (without calling `fn`) when another sync already holds the lock;
 * otherwise returns `fn`'s result. The lock's TTL is the real backstop against
 * a crashed holder — release is best-effort and only when we still own it.
 */
export async function withHealthSyncLock<T>(
  memberId: string,
  fn: () => Promise<T>,
): Promise<T | { skipped: true }> {
  const redis = await getClient();
  if (!redis) return fn();

  const key = `health-sync-lock:${memberId}`;
  const token = randomUUID();
  const acquired = await redis.set(key, token, { NX: true, PX: LOCK_TTL_MS }).catch(() => null);
  if (!acquired) return { skipped: true };

  try {
    return await fn();
  } finally {
    const current = await redis.get(key).catch(() => null);
    if (current === token) await redis.del(key).catch(() => {});
  }
}
