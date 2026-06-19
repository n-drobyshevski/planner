// A tiny in-memory token-bucket rate limiter, keyed by an opaque client id
// (typically the request IP). This is the COARSE first line of defense on the
// unauthenticated timeslot-request endpoint; the authoritative per-share limit
// lives in the `submit_timeslot_request` SQL function (which a token holder can't
// bypass). In-memory state is per server instance — adequate for low-volume abuse
// protection on Vercel Fluid Compute; it is deliberately NOT a distributed limiter.
//
// The bucket math is pure and time-injectable so it unit-tests without a clock.

export interface RateLimitResult {
  /** true = allowed (a token was consumed); false = throttled. */
  ok: boolean;
  /** ms until at least one token is available again (0 when ok). */
  retryAfterMs: number;
}

interface BucketState {
  tokens: number;
  /** epoch ms of the last refill calculation */
  updatedAt: number;
}

export interface IpRateLimiter {
  /** Consume a token for `id`. */
  check(id: string): RateLimitResult;
  /** Test/inspection helper: current live key count. */
  size(): number;
}

export interface RateLimiterOptions {
  /** Max burst (bucket capacity). */
  capacity: number;
  /** Sustained rate: tokens added per second. */
  refillPerSec: number;
  /** Injectable clock (defaults to Date.now); keep pure for tests. */
  now?: () => number;
  /** Drop idle keys once the map exceeds this many entries (memory guard). */
  maxKeys?: number;
}

/**
 * Create an IP/token-bucket limiter. Each key starts full (one immediate burst of
 * `capacity`), then refills continuously at `refillPerSec`. `check` consumes one
 * token and reports whether it was allowed plus a retry hint.
 */
export function createIpRateLimiter(opts: RateLimiterOptions): IpRateLimiter {
  const { capacity, refillPerSec } = opts;
  const now = opts.now ?? (() => Date.now());
  const maxKeys = opts.maxKeys ?? 10_000;
  const refillPerMs = refillPerSec / 1000;
  const buckets = new Map<string, BucketState>();

  function refill(b: BucketState, t: number): void {
    const elapsed = t - b.updatedAt;
    if (elapsed <= 0) return;
    b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerMs);
    b.updatedAt = t;
  }

  // Opportunistically drop keys that have fully refilled (i.e. idle long enough to
  // be indistinguishable from a fresh key), so the map can't grow without bound.
  function prune(t: number): void {
    for (const [key, b] of buckets) {
      refill(b, t);
      if (b.tokens >= capacity) buckets.delete(key);
      if (buckets.size <= maxKeys) break;
    }
  }

  return {
    check(id: string): RateLimitResult {
      const t = now();
      if (buckets.size > maxKeys) prune(t);

      let b = buckets.get(id);
      if (!b) {
        b = { tokens: capacity, updatedAt: t };
        buckets.set(id, b);
      } else {
        refill(b, t);
      }

      if (b.tokens >= 1) {
        b.tokens -= 1;
        return { ok: true, retryAfterMs: 0 };
      }
      // Time until the bucket reaches one token.
      const deficit = 1 - b.tokens;
      const retryAfterMs = refillPerMs > 0 ? Math.ceil(deficit / refillPerMs) : Infinity;
      return { ok: false, retryAfterMs };
    },
    size() {
      return buckets.size;
    },
  };
}
