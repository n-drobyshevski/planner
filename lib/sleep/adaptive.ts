// Adaptive sleep hints — correlate logged quality/fatigue with sleep
// behavior. Pure and deterministic: group-mean comparisons with explicit
// effect-size gates, never p-values we can't honestly compute at n≈5–20.
// Below HINTS_MIN_LOGGED scored mornings the engine stays silent (the UI
// shows "log N more mornings" instead). Every hint body states its sample
// size. Severity renders as icon + text label, never color alone.

import { minutesSinceNoon } from "@/lib/sleep/clock";
import type { SleepPrefs } from "@/lib/sleep/cycles";
import type { DerivedNight } from "@/lib/sleep/derive";
import type { SleepLog } from "@/lib/types";

/**
 * Interpolation values a hint may carry. Raw (unformatted) so the engine stays
 * pure and locale-free: the view resolves `targetMs` through `formatDuration`
 * and feeds the rest straight to next-intl (ICU handles the plural counts).
 */
export interface SleepHintVars {
  /** logged mornings the comparison drew on — drives the ICU plural */
  count: number;
  /** target in-bed time, ms — formatted at render via formatDuration */
  targetMs?: number;
  /** bedtime spread, whole minutes (regularity) */
  spread?: number;
  /** cycle length, minutes (cycle-alignment) */
  cycle?: number;
}

/** A localized meta chip: a `sleep.hints.*` key plus its interpolation vars. */
export interface SleepHintMeta {
  key: string;
  vars: SleepHintVars;
}

export interface SleepHint {
  /** stable per data — one hint per kind, so the kind doubles as the id */
  id: string;
  kind: "duration" | "regularity" | "cycle-alignment";
  severity: "attention" | "info";
  /** `sleep.hints.*` keys; resolved in the view with `vars` */
  titleKey: string;
  bodyKey: string;
  vars: SleepHintVars;
  /** fact chips, rendered tabular-nums */
  meta?: SleepHintMeta[];
}

export interface SleepHintsInput {
  nights: DerivedNight[];
  logs: SleepLog[];
  prefs: SleepPrefs;
  timeZone: string;
}

/** Minimum scored (quality or fatigue) check-ins before any hint is emitted. */
export const HINTS_MIN_LOGGED = 5;
export const HINTS_CAP = 3;
/** Hints read a fixed trailing window (days), independent of the period picker. */
export const HINTS_WINDOW_DAYS = 30;

const MIN_MS = 60_000;
/** smallest group-mean differences that count as a real effect */
const QUALITY_EFFECT = 0.7;
const FATIGUE_EFFECT = 1.0;
/** effect sizes that escalate a comparison hint to "attention" */
const QUALITY_ATTENTION = 1.5;
const FATIGUE_ATTENTION = 2.0;
/** bedtime spread (population σ, minutes) thresholds */
const SPREAD_INFO_MIN = 35;
const SPREAD_ATTENTION_MIN = 60;
/** distance to the nearest cycle multiple (minutes) */
const ALIGNED_MAX_MIN = 15;
const MISALIGNED_MIN_MIN = 30;

const KIND_ORDER: SleepHint["kind"][] = ["duration", "regularity", "cycle-alignment"];

interface ScoredNight {
  /**
   * Effective night length. Semantics differ by `source`: "logged" is in-bed
   * time (bed→wake, includes onset latency and mid-night wakes); "derived" is
   * the sum of merged calendar blocks (gaps excluded — closer to asleep time).
   */
  durationMin: number | null;
  durationSource: "logged" | "derived" | null;
  bedtimeAt: number | null;
  quality: number | null;
  fatigue: number | null;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Compare quality/fatigue means of two night groups. Returns null when either
 * group is too small or no metric clears its effect gate; otherwise which
 * group scored better plus the effect sizes (for severity).
 */
function compareGroups(
  a: ScoredNight[],
  b: ScoredNight[],
): { betterIsA: boolean; qualityDiff: number; fatigueDiff: number } | null {
  // Group means on n<3 are coin flips; stay silent rather than overclaim.
  if (a.length < 3 || b.length < 3) return null;
  const qa = a.filter((n) => n.quality !== null).map((n) => n.quality as number);
  const qb = b.filter((n) => n.quality !== null).map((n) => n.quality as number);
  const fa = a.filter((n) => n.fatigue !== null).map((n) => n.fatigue as number);
  const fb = b.filter((n) => n.fatigue !== null).map((n) => n.fatigue as number);
  const qualityDiff = qa.length > 0 && qb.length > 0 ? mean(qa) - mean(qb) : 0;
  // fatigue is inverted (higher = worse): positive means group A is better
  const fatigueDiff = fa.length > 0 && fb.length > 0 ? mean(fb) - mean(fa) : 0;
  if (Math.abs(qualityDiff) < QUALITY_EFFECT && Math.abs(fatigueDiff) < FATIGUE_EFFECT) {
    return null;
  }
  // The dominant metric decides the direction.
  const betterIsA =
    Math.abs(qualityDiff) >= QUALITY_EFFECT ? qualityDiff > 0 : fatigueDiff > 0;
  return { betterIsA, qualityDiff: Math.abs(qualityDiff), fatigueDiff: Math.abs(fatigueDiff) };
}

function comparisonSeverity(c: { qualityDiff: number; fatigueDiff: number }): SleepHint["severity"] {
  return c.qualityDiff >= QUALITY_ATTENTION || c.fatigueDiff >= FATIGUE_ATTENTION
    ? "attention"
    : "info";
}

export function computeSleepHints(input: SleepHintsInput): SleepHint[] {
  const { logs, nights, prefs, timeZone } = input;
  const scoredLogs = logs.filter((l) => l.quality !== null || l.fatigue !== null);
  if (scoredLogs.length < HINTS_MIN_LOGGED) return [];

  const derivedByKey = new Map(nights.map((n) => [n.dateKey, n]));
  const scored: ScoredNight[] = scoredLogs.map((l) => {
    const derived = derivedByKey.get(l.date);
    const loggedMin =
      l.bedtimeAt !== null && l.wokeAt !== null
        ? (l.wokeAt - l.bedtimeAt) / MIN_MS
        : null;
    const derivedMin =
      derived && derived.durationMs > 0 ? derived.durationMs / MIN_MS : null;
    return {
      durationMin: loggedMin ?? derivedMin,
      durationSource:
        loggedMin !== null ? ("logged" as const)
        : derivedMin !== null ? ("derived" as const)
        : null,
      bedtimeAt: l.bedtimeAt ?? derived?.start ?? null,
      quality: l.quality,
      fatigue: l.fatigue,
    };
  });

  const hints: SleepHint[] = [];
  const targetMin = prefs.targetCycles * prefs.cycleLengthMin + prefs.onsetLatencyMin;

  // (a) duration vs target
  const withDuration = scored.filter((n) => n.durationMin !== null);
  const long = withDuration.filter((n) => (n.durationMin as number) >= targetMin);
  const short = withDuration.filter((n) => (n.durationMin as number) < targetMin);
  const durationCmp = compareGroups(long, short);
  if (durationCmp) {
    const n = withDuration.length;
    const shortWorse = durationCmp.betterIsA;
    const targetMs = targetMin * MIN_MS;
    hints.push({
      id: "duration",
      kind: "duration",
      severity: comparisonSeverity(durationCmp),
      titleKey: shortWorse ? "durationShortTitle" : "durationLongTitle",
      bodyKey: shortWorse ? "durationShortBody" : "durationLongBody",
      vars: { count: n, targetMs },
      meta: [
        { key: "metaTarget", vars: { count: n, targetMs } },
        { key: "metaNights", vars: { count: n } },
      ],
    });
  }

  // (b) bedtime regularity
  const bedtimes = scored
    .filter((n) => n.bedtimeAt !== null)
    .map((n) => minutesSinceNoon(n.bedtimeAt as number, timeZone));
  if (bedtimes.length >= HINTS_MIN_LOGGED) {
    const mu = mean(bedtimes);
    // Sample σ (n−1): at n≈5–20 the population formula understates the spread.
    const spread = Math.sqrt(
      bedtimes.reduce((s, b) => s + (b - mu) ** 2, 0) / (bedtimes.length - 1),
    );
    if (spread >= SPREAD_INFO_MIN) {
      const roundedSpread = Math.round(spread);
      hints.push({
        id: "regularity",
        kind: "regularity",
        severity: spread >= SPREAD_ATTENTION_MIN ? "attention" : "info",
        titleKey: "regularityTitle",
        bodyKey: "regularityBody",
        vars: { count: bedtimes.length, spread: roundedSpread },
        meta: [
          { key: "metaSpread", vars: { count: bedtimes.length, spread: roundedSpread } },
          { key: "metaNights", vars: { count: bedtimes.length } },
        ],
      });
    }
  }

  // (c) cycle alignment — onset latency is only inside LOGGED durations
  // (in-bed time); derived block-sums already approximate asleep time.
  const withAlignment = withDuration.map((n) => {
    const asleep =
      n.durationSource === "logged"
        ? Math.max(0, (n.durationMin as number) - prefs.onsetLatencyMin)
        : (n.durationMin as number);
    const rem = asleep % prefs.cycleLengthMin;
    return { night: n, distance: Math.min(rem, prefs.cycleLengthMin - rem) };
  });
  const aligned = withAlignment.filter((x) => x.distance <= ALIGNED_MAX_MIN).map((x) => x.night);
  const misaligned = withAlignment
    .filter((x) => x.distance >= MISALIGNED_MIN_MIN)
    .map((x) => x.night);
  const cycleCmp = compareGroups(aligned, misaligned);
  if (cycleCmp) {
    const n = aligned.length + misaligned.length;
    const alignedBetter = cycleCmp.betterIsA;
    hints.push({
      id: "cycle-alignment",
      kind: "cycle-alignment",
      severity: comparisonSeverity(cycleCmp),
      titleKey: alignedBetter ? "cycleAlignedTitle" : "cycleNeutralTitle",
      bodyKey: alignedBetter ? "cycleAlignedBody" : "cycleNeutralBody",
      vars: { count: n, cycle: prefs.cycleLengthMin },
      meta: [
        { key: "metaCycles", vars: { count: n, cycle: prefs.cycleLengthMin } },
        { key: "metaNights", vars: { count: n } },
      ],
    });
  }

  return hints
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "attention" ? -1 : 1;
      return KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    })
    .slice(0, HINTS_CAP);
}
