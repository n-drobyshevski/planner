// The digest endpoint's decision core, separated from HTTP and SDK plumbing
// so cache-hit / no-key / rate-limit / generate branches unit-test with
// injected fakes (the route wires real Supabase + Anthropic implementations).

import {
  digestPayloadHash,
  type DigestPayload,
} from "@/lib/insights/digest-payload";
import { digestSchema, type Digest } from "@/lib/insights/digest-schema";

/** Generations allowed per member per UTC day (cache hits don't count). */
export const DIGEST_DAILY_LIMIT = 10;

export interface DigestDeps {
  /** false ⇒ the feature is unconfigured and hides itself client-side */
  hasApiKey: boolean;
  /** stored digest jsonb for this member + hash, or null */
  findCached(hash: string): Promise<unknown | null>;
  /** rows this member generated today (the rate-limit ledger) */
  countToday(): Promise<number>;
  /** one model call; implementations throw on transport errors */
  generate(payload: DigestPayload): Promise<Digest>;
  /** upsert the cache row (member + hash unique) */
  save(hash: string, digest: Digest): Promise<void>;
}

export type DigestResult =
  | { status: "ok"; digest: Digest; cached: boolean; hash: string }
  | { status: "none"; hash: string } // cached-only probe, nothing stored
  | { status: "unavailable" }
  | { status: "rate-limited" };

/**
 * Resolve one digest request: cache first (a stored row that no longer
 * parses against the schema counts as missing, so junk regenerates), then
 * availability, then the daily limit, then one generation + save.
 * `cachedOnly` never generates — it's the mount-time "is there one already?"
 * probe, so opening the tab can show an existing digest without ever
 * spending a model call.
 */
export async function resolveDigestRequest(
  payload: DigestPayload,
  opts: { cachedOnly: boolean },
  deps: DigestDeps,
): Promise<DigestResult> {
  const hash = digestPayloadHash(payload);

  const stored = await deps.findCached(hash);
  if (stored !== null) {
    const parsed = digestSchema.safeParse(stored);
    if (parsed.success) {
      return { status: "ok", digest: parsed.data, cached: true, hash };
    }
  }

  if (!deps.hasApiKey) return { status: "unavailable" };
  if (opts.cachedOnly) return { status: "none", hash };
  if ((await deps.countToday()) >= DIGEST_DAILY_LIMIT) {
    return { status: "rate-limited" };
  }

  const digest = await deps.generate(payload);
  await deps.save(hash, digest);
  return { status: "ok", digest, cached: false, hash };
}
