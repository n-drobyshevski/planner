import { describe, it, expect } from "vitest";
import { createIpRateLimiter } from "@/lib/rate-limit/ip-bucket";

describe("createIpRateLimiter", () => {
  it("allows up to capacity in an immediate burst, then throttles", () => {
    let t = 1000;
    const rl = createIpRateLimiter({ capacity: 3, refillPerSec: 1, now: () => t });
    expect(rl.check("a").ok).toBe(true);
    expect(rl.check("a").ok).toBe(true);
    expect(rl.check("a").ok).toBe(true);
    const blocked = rl.check("a");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("refills continuously over time", () => {
    let t = 0;
    const rl = createIpRateLimiter({ capacity: 1, refillPerSec: 1, now: () => t });
    expect(rl.check("a").ok).toBe(true); // consume the single token
    expect(rl.check("a").ok).toBe(false); // empty
    t = 1000; // +1s → +1 token
    expect(rl.check("a").ok).toBe(true);
  });

  it("keeps keys independent", () => {
    let t = 0;
    const rl = createIpRateLimiter({ capacity: 1, refillPerSec: 1, now: () => t });
    expect(rl.check("a").ok).toBe(true);
    expect(rl.check("a").ok).toBe(false);
    expect(rl.check("b").ok).toBe(true); // a's drain doesn't affect b
  });

  it("reports retryAfterMs as the time to the next token", () => {
    let t = 0;
    const rl = createIpRateLimiter({ capacity: 1, refillPerSec: 1, now: () => t });
    rl.check("a"); // drain
    const r = rl.check("a");
    expect(r.ok).toBe(false);
    expect(r.retryAfterMs).toBe(1000); // 1 token/sec
  });

  it("does not over-fill beyond capacity after a long idle", () => {
    let t = 0;
    const rl = createIpRateLimiter({ capacity: 2, refillPerSec: 1, now: () => t });
    rl.check("a"); // 2 -> 1
    t = 100_000; // long idle, but caps at capacity (2), not 100k
    expect(rl.check("a").ok).toBe(true); // 2 -> 1
    expect(rl.check("a").ok).toBe(true); // 1 -> 0
    expect(rl.check("a").ok).toBe(false); // empty again
  });

  it("prunes fully-refilled idle keys to bound memory", () => {
    let t = 0;
    const rl = createIpRateLimiter({
      capacity: 1,
      refillPerSec: 1,
      now: () => t,
      maxKeys: 2,
    });
    rl.check("a");
    rl.check("b");
    rl.check("c"); // size now 3 (> maxKeys)
    t = 10_000; // all keys fully refill → become prunable
    rl.check("d"); // triggers an opportunistic prune
    expect(rl.size()).toBeLessThanOrEqual(3);
  });
});
