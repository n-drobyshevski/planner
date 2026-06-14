// The digest's REQUEST contract: a compact, privacy-bounded aggregate of the
// period — what the API route sends to the model. Pure + isomorphic (built
// client-side from already-computed analytics, re-validated server-side).
//
// Privacy boundary, by construction: NO event titles, NO occurrence rows, NO
// sleep data ever enter the payload. Context (category) names and goal names
// do — they're the coarse labels a useful narrative needs — plus suggestion
// headlines/evidence, which are app-derived text (the unscheduled-task kind
// can carry a task title; that is the one user-authored string class here).
// Durations are rounded to MINUTES so the payload (and its cache hash) is
// stable against sub-minute jitter.

import { z } from "zod";

const MAX_CONTEXTS = 8;
const MAX_GOALS = 6;
const MAX_ANOMALIES = 3;
const MAX_SIGNALS = 8;

const str = (max: number) => z.string().min(1).max(max);

export const digestPayloadSchema = z.object({
  period: z.object({
    label: str(80),
    days: z.number().int().min(1).max(366),
    /** the member lens the numbers were computed under */
    lens: z.enum(["me", "partner", "both"]),
    /** UI language the digest should be written in */
    locale: z.enum(["en", "ru"]),
  }),
  time: z.object({
    totalMin: z.number().int().min(0),
    prevTotalMin: z.number().int().min(0),
    dailyAvgMin: z.number().int().min(0),
    activeDays: z.number().int().min(0),
    busiest: z.object({ date: str(10), min: z.number().int().min(0) }).nullable(),
  }),
  contexts: z
    .array(
      z.object({
        name: str(60),
        min: z.number().int().min(0),
        sharePct: z.number().int().min(0).max(100),
        prevSharePct: z.number().int().min(0).max(100),
      }),
    )
    .max(MAX_CONTEXTS),
  tasks: z.object({
    completed: z.number().int().min(0),
    onTimePct: z.number().int().min(0).max(100).nullable(),
    overdueOpen: z.number().int().min(0),
  }),
  goals: z
    .array(
      z.object({
        name: str(60),
        kind: z.enum(["target", "budget"]),
        targetMin: z.number().int().min(0),
        actualMin: z.number().int().min(0),
        judgment: z.enum(["on-track", "behind", "over", "met"]),
      }),
    )
    .max(MAX_GOALS),
  outlook: z
    .object({
      committedMin: z.number().int().min(0),
      pacePct: z.number().int().min(0).nullable(),
      busiestDate: str(10).nullable(),
      dueUnscheduled: z.number().int().min(0),
    })
    .nullable(),
  anomalies: z
    .array(
      z.object({
        date: str(10),
        min: z.number().int().min(0),
        direction: z.enum(["high", "low"]),
      }),
    )
    .max(MAX_ANOMALIES),
  streak: z
    .object({
      current: z.number().int().min(0),
      longest: z.number().int().min(0),
    })
    .nullable(),
  /** the rule engine's findings, as derived text the model may quote */
  signals: z
    .array(z.object({ kind: str(40), text: str(200) }))
    .max(MAX_SIGNALS),
});

export type DigestPayload = z.infer<typeof digestPayloadSchema>;

const MINUTE = 60_000;
const toMin = (ms: number) => Math.round(ms / MINUTE);
const toPct = (share: number) => Math.max(0, Math.min(100, Math.round(share * 100)));

/** Raw (ms-grade) inputs, as the Optimize tab already computes them. */
export interface DigestPayloadInput {
  periodLabel: string;
  dayCount: number;
  lens: "me" | "partner" | "both";
  /** UI language ("en" | "ru") — the digest is written in it. */
  locale: "en" | "ru";
  totalMs: number;
  prevTotalMs: number;
  dailyAvgMs: number;
  activeDays: number;
  busiest: { dateKey: string; ms: number } | null;
  contexts: { name: string; ms: number; share: number; prevShare: number }[];
  tasks: { completed: number; onTimeRate: number | null; overdueOpen: number };
  goals: {
    name: string;
    direction: "at-least" | "at-most";
    targetMs: number;
    actualMs: number;
    judgment: "on-track" | "behind" | "over" | "met";
  }[];
  outlook: {
    committedMs: number;
    capacityRatio: number | null;
    busiestDateKey: string | null;
    dueUnscheduled: number;
  } | null;
  anomalies: { dateKey: string; ms: number; direction: "high" | "low" }[];
  streak: { current: number; longest: number } | null;
  signals: { kind: string; text: string }[];
}

/** Clamp, round and order the raw aggregates into the canonical payload. */
export function buildDigestPayload(input: DigestPayloadInput): DigestPayload {
  return {
    period: {
      label: input.periodLabel.slice(0, 80),
      days: input.dayCount,
      lens: input.lens,
      locale: input.locale,
    },
    time: {
      totalMin: toMin(input.totalMs),
      prevTotalMin: toMin(input.prevTotalMs),
      dailyAvgMin: toMin(input.dailyAvgMs),
      activeDays: input.activeDays,
      busiest: input.busiest
        ? { date: input.busiest.dateKey, min: toMin(input.busiest.ms) }
        : null,
    },
    contexts: input.contexts.slice(0, MAX_CONTEXTS).map((c) => ({
      name: c.name.slice(0, 60),
      min: toMin(c.ms),
      sharePct: toPct(c.share),
      prevSharePct: toPct(c.prevShare),
    })),
    tasks: {
      completed: input.tasks.completed,
      onTimePct: input.tasks.onTimeRate === null ? null : toPct(input.tasks.onTimeRate),
      overdueOpen: input.tasks.overdueOpen,
    },
    goals: input.goals.slice(0, MAX_GOALS).map((g) => ({
      name: g.name.slice(0, 60),
      kind: g.direction === "at-most" ? "budget" : "target",
      targetMin: toMin(g.targetMs),
      actualMin: toMin(g.actualMs),
      judgment: g.judgment,
    })),
    outlook: input.outlook
      ? {
          committedMin: toMin(input.outlook.committedMs),
          pacePct:
            input.outlook.capacityRatio === null
              ? null
              : Math.max(0, Math.round(input.outlook.capacityRatio * 100)),
          busiestDate: input.outlook.busiestDateKey,
          dueUnscheduled: input.outlook.dueUnscheduled,
        }
      : null,
    anomalies: input.anomalies.slice(0, MAX_ANOMALIES).map((a) => ({
      date: a.dateKey,
      min: toMin(a.ms),
      direction: a.direction,
    })),
    streak: input.streak,
    signals: input.signals.slice(0, MAX_SIGNALS).map((s) => ({
      kind: s.kind.slice(0, 40),
      text: s.text.slice(0, 200),
    })),
  };
}

/**
 * Stable fingerprint of a payload (FNV-1a 32-bit over the canonical JSON,
 * hex). The payload is built with a fixed key order, so identical aggregates
 * hash identically across devices — that's the digest cache key.
 */
export function digestPayloadHash(payload: DigestPayload): string {
  const text = JSON.stringify(payload);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
