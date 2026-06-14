import { describe, it, expect } from "vitest";
import {
  buildDigestPayload,
  digestPayloadHash,
  digestPayloadSchema,
  type DigestPayloadInput,
} from "@/lib/insights/digest-payload";

const HOUR = 3_600_000;

function input(over: Partial<DigestPayloadInput> = {}): DigestPayloadInput {
  return {
    periodLabel: "This week",
    dayCount: 7,
    lens: "me",
    locale: "en",
    totalMs: 20 * HOUR,
    prevTotalMs: 18 * HOUR,
    dailyAvgMs: 2.5 * HOUR,
    activeDays: 5,
    busiest: { dateKey: "2026-06-03", ms: 8 * HOUR },
    contexts: [
      { name: "Work", ms: 12 * HOUR, share: 0.6, prevShare: 0.5 },
      { name: "Gym", ms: 3 * HOUR, share: 0.15, prevShare: 0.2 },
    ],
    tasks: { completed: 4, onTimeRate: 0.75, overdueOpen: 1 },
    goals: [
      {
        name: "Gym",
        direction: "at-least",
        targetMs: 5 * HOUR,
        actualMs: 3 * HOUR,
        judgment: "behind",
      },
    ],
    outlook: {
      committedMs: 22 * HOUR,
      capacityRatio: 1.1,
      busiestDateKey: "2026-06-09",
      dueUnscheduled: 2,
    },
    anomalies: [{ dateKey: "2026-06-02", ms: 9 * HOUR, direction: "high" }],
    streak: { current: 3, longest: 5 },
    signals: [{ kind: "overloaded-day", text: "Heavy day: Wed 3 Jun — 8h vs 4h." }],
    ...over,
  };
}

describe("buildDigestPayload", () => {
  it("produces a schema-valid payload with minute-rounded durations", () => {
    const payload = buildDigestPayload(input());
    expect(digestPayloadSchema.safeParse(payload).success).toBe(true);
    expect(payload.time.totalMin).toBe(20 * 60);
    expect(payload.time.dailyAvgMin).toBe(150);
    expect(payload.contexts[0]).toEqual({
      name: "Work",
      min: 720,
      sharePct: 60,
      prevSharePct: 50,
    });
    expect(payload.tasks.onTimePct).toBe(75);
  });

  it("clamps list lengths (contexts 8, goals 6, anomalies 3, signals 8)", () => {
    const many = input({
      contexts: Array.from({ length: 20 }, (_, i) => ({
        name: `C${i}`,
        ms: HOUR,
        share: 0.05,
        prevShare: 0.05,
      })),
      goals: Array.from({ length: 10 }, (_, i) => ({
        name: `G${i}`,
        direction: "at-least" as const,
        targetMs: HOUR,
        actualMs: HOUR,
        judgment: "met" as const,
      })),
      anomalies: Array.from({ length: 6 }, (_, i) => ({
        dateKey: `2026-06-0${i + 1}`,
        ms: HOUR,
        direction: "high" as const,
      })),
      signals: Array.from({ length: 12 }, (_, i) => ({
        kind: "anomaly",
        text: `signal ${i}`,
      })),
    });
    const payload = buildDigestPayload(many);
    expect(payload.contexts).toHaveLength(8);
    expect(payload.goals).toHaveLength(6);
    expect(payload.anomalies).toHaveLength(3);
    expect(payload.signals).toHaveLength(8);
    expect(digestPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("contains no occurrence/event titles by construction", () => {
    // The builder only ever receives aggregates + app-derived signal text;
    // a distinctive event title can't appear unless a rule deliberately
    // embeds it (unscheduled-task does, by design).
    const TITLE = "EXTREMELY_PRIVATE_DENTIST_APPOINTMENT";
    const payload = buildDigestPayload(input());
    expect(JSON.stringify(payload)).not.toContain(TITLE);
  });

  it("stays comfortably under the size budget", () => {
    const payload = buildDigestPayload(
      input({
        contexts: Array.from({ length: 8 }, (_, i) => ({
          name: `Context number ${i} with a long-ish name`,
          ms: 5 * HOUR,
          share: 0.1,
          prevShare: 0.1,
        })),
        signals: Array.from({ length: 8 }, (_, i) => ({
          kind: "category-drift",
          text: `signal ${i}: `.padEnd(380, "x"),
        })),
      }),
    );
    expect(JSON.stringify(payload).length).toBeLessThan(4096);
  });
});

describe("digestPayloadHash", () => {
  it("is stable for identical payloads and across rebuilds", () => {
    const a = buildDigestPayload(input());
    const b = buildDigestPayload(input());
    expect(digestPayloadHash(a)).toBe(digestPayloadHash(b));
    expect(digestPayloadHash(a)).toMatch(/^[0-9a-f]{8}$/);
  });

  it("changes when the data or the lens changes", () => {
    const base = digestPayloadHash(buildDigestPayload(input()));
    expect(digestPayloadHash(buildDigestPayload(input({ totalMs: 21 * HOUR })))).not.toBe(
      base,
    );
    expect(digestPayloadHash(buildDigestPayload(input({ lens: "both" })))).not.toBe(base);
  });

  it("ignores sub-minute jitter (the rounding is the stability)", () => {
    const base = digestPayloadHash(buildDigestPayload(input()));
    const jittered = digestPayloadHash(
      buildDigestPayload(input({ totalMs: 20 * HOUR + 10_000 })),
    );
    expect(jittered).toBe(base);
  });
});
