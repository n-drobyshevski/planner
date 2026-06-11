import { describe, it, expect, vi } from "vitest";
import {
  resolveDigestRequest,
  DIGEST_DAILY_LIMIT,
  type DigestDeps,
} from "@/lib/insights/digest-service";
import {
  buildDigestPayload,
  digestPayloadHash,
} from "@/lib/insights/digest-payload";
import type { Digest } from "@/lib/insights/digest-schema";

const PAYLOAD = buildDigestPayload({
  periodLabel: "This week",
  dayCount: 7,
  lens: "me",
  totalMs: 0,
  prevTotalMs: 0,
  dailyAvgMs: 0,
  activeDays: 0,
  busiest: null,
  contexts: [],
  tasks: { completed: 0, onTimeRate: null, overdueOpen: 0 },
  goals: [],
  outlook: null,
  anomalies: [],
  streak: null,
  signals: [],
});

const DIGEST: Digest = {
  summary: "A quiet week.",
  observations: [
    { headline: "Little tracked", detail: "Almost nothing was tracked." },
    { headline: "No tasks", detail: "No tasks were completed." },
  ],
  recommendations: [
    { action: "Track one block", rationale: "Data unlocks the other views." },
    { action: "Set one goal", rationale: "A target gives the week a shape." },
  ],
};

function deps(over: Partial<DigestDeps> = {}): DigestDeps {
  return {
    hasApiKey: true,
    findCached: vi.fn(async () => null),
    countToday: vi.fn(async () => 0),
    generate: vi.fn(async () => DIGEST),
    save: vi.fn(async () => {}),
    ...over,
  };
}

describe("resolveDigestRequest", () => {
  it("serves a valid cached digest without generating, even cachedOnly", async () => {
    const d = deps({ findCached: vi.fn(async () => DIGEST) });
    const res = await resolveDigestRequest(PAYLOAD, { cachedOnly: true }, d);
    expect(res).toEqual({
      status: "ok",
      digest: DIGEST,
      cached: true,
      hash: digestPayloadHash(PAYLOAD),
    });
    expect(d.generate).not.toHaveBeenCalled();
  });

  it("treats junk cached jsonb as missing and regenerates", async () => {
    const d = deps({ findCached: vi.fn(async () => ({ summary: 42 })) });
    const res = await resolveDigestRequest(PAYLOAD, { cachedOnly: false }, d);
    expect(res.status).toBe("ok");
    expect(d.generate).toHaveBeenCalledOnce();
    expect(d.save).toHaveBeenCalledOnce();
  });

  it("reports unavailable (and never generates) without an API key", async () => {
    const d = deps({ hasApiKey: false });
    expect(await resolveDigestRequest(PAYLOAD, { cachedOnly: false }, d)).toEqual({
      status: "unavailable",
    });
    expect(d.generate).not.toHaveBeenCalled();
    // …but a cached digest still serves: the key may have been removed since.
    const cached = deps({ hasApiKey: false, findCached: vi.fn(async () => DIGEST) });
    expect(
      (await resolveDigestRequest(PAYLOAD, { cachedOnly: false }, cached)).status,
    ).toBe("ok");
  });

  it("cachedOnly probes return none instead of generating", async () => {
    const d = deps();
    const res = await resolveDigestRequest(PAYLOAD, { cachedOnly: true }, d);
    expect(res).toEqual({ status: "none", hash: digestPayloadHash(PAYLOAD) });
    expect(d.generate).not.toHaveBeenCalled();
    expect(d.countToday).not.toHaveBeenCalled();
  });

  it("rate-limits at the daily cap, before any model call", async () => {
    const d = deps({ countToday: vi.fn(async () => DIGEST_DAILY_LIMIT) });
    expect(await resolveDigestRequest(PAYLOAD, { cachedOnly: false }, d)).toEqual({
      status: "rate-limited",
    });
    expect(d.generate).not.toHaveBeenCalled();
  });

  it("generates, saves and returns a fresh digest on the happy path", async () => {
    const d = deps();
    const res = await resolveDigestRequest(PAYLOAD, { cachedOnly: false }, d);
    expect(res).toEqual({
      status: "ok",
      digest: DIGEST,
      cached: false,
      hash: digestPayloadHash(PAYLOAD),
    });
    expect(d.save).toHaveBeenCalledWith(digestPayloadHash(PAYLOAD), DIGEST);
  });

  it("propagates generation failures (the route maps them to 502)", async () => {
    const d = deps({
      generate: vi.fn(async () => {
        throw new Error("overloaded");
      }),
    });
    await expect(
      resolveDigestRequest(PAYLOAD, { cachedOnly: false }, d),
    ).rejects.toThrow("overloaded");
    expect(d.save).not.toHaveBeenCalled();
  });
});
