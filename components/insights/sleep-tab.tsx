"use client";

import { useCallback, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleAlert, Lock, MoonStar, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { dateKeyInZone, dayStartOffset } from "@/lib/datetime/local";
import { formatDuration } from "@/lib/datetime/format";
import type { Lede } from "@/lib/insights/ledes";
import {
  useDeleteSleepLog,
  useSleepLogs,
  useUpsertSleepLog,
} from "@/lib/hooks/use-sleep-logs";
import { useWindowEvents } from "@/lib/hooks/use-window-events";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import {
  buildSleepDayPairs,
  sleepCorrelations,
  type SleepCorrelation,
} from "@/lib/analytics/sleep-cross";
import { computeSleepHints, HINTS_WINDOW_DAYS } from "@/lib/sleep/adaptive";
import {
  computeHabitualPhase,
  DEBT_NUDGE_CAP_MS,
  recentSleepDebtMs,
} from "@/lib/sleep/circadian";
import { deriveNights, type DeriveOptions } from "@/lib/sleep/derive";
import { isViewerSleep as viewerOwnsSleep } from "@/lib/sleep/viewer-sleep";
import type { SleepPrefs } from "@/lib/sleep/cycles";
import type { Occurrence } from "@/lib/types";
import { InsightLede } from "./insight-lede";
import { CheckinCard } from "./sleep/checkin-card";
import { CalculatorCard } from "./sleep/calculator-card";
import { HintsSection } from "./sleep/hints-section";
import { HistorySection } from "./sleep/history-section";
import { LogNightDialog } from "./sleep/log-night-dialog";
import { RhythmChart } from "./sleep/rhythm-chart";
import { TonightCard } from "./sleep/tonight-card";
import { TypicalNight } from "./sleep/typical-night";
import { SectionEmpty } from "./insights-empty";
import { Reading, SectionLabel } from "./tab-bits";
import type { InsightsTabData } from "./insights-shell";

/**
 * The Sleep tab is viewer-only by design: sleep logs are member-private under
 * RLS (the partner's rows aren't even fetchable), so the calculator, check-in
 * and trends are inherently yours — and the derived nights are scoped to your
 * own sleep events (your dedicated sleep category when set, otherwise the
 * inactive≡sleep heuristic) to tell one consistent story. The member filter
 * in the toolbar deliberately has no effect here.
 */
export function SleepTab({ data }: { data: InsightsTabData }) {
  const t = useTranslations("insights");
  const locale = useLocale();
  const { period, rawOccurrences, viewerId, timeZone, now } = data;

  const workspace = useWorkspace();
  const wsId = workspace.data?.workspaceId;
  const sharedCategoryIds = useMemo(
    () =>
      new Set(
        (workspace.data?.categories ?? [])
          .filter((c) => c.ownerId === null)
          .map((c) => c.id),
      ),
    [workspace.data],
  );

  // Sleep prefs are member-private (their own table), so they live on the
  // workspace bundle's `sleepPrefs` (the signed-in member's own row), NOT on the
  // shared members list. The Sleep tab is viewer-only, so this IS the viewer's.
  const sleepPrefs = workspace.data?.sleepPrefs ?? null;
  const prefs: SleepPrefs = useMemo(
    () => ({
      cycleLengthMin: sleepPrefs?.sleepCycleLengthMin ?? 90,
      onsetLatencyMin: sleepPrefs?.sleepOnsetLatencyMin ?? 15,
      targetCycles: sleepPrefs?.targetSleepCycles ?? 5,
    }),
    [sleepPrefs],
  );

  const {
    logs,
    isLoading: logsLoading,
    isError: logsError,
    refetch: refetchLogs,
  } = useSleepLogs(wsId, viewerId);
  const upsert = useUpsertSleepLog(wsId, viewerId);
  const deleteLog = useDeleteSleepLog(wsId, viewerId);

  // The optimistic upsert makes hasLogToday true the instant a check-in save
  // starts; without this flag the card would unmount mid-save and a failure
  // would remount it empty, losing the draft. Pending keeps it mounted until
  // the save settles (success unmounts it via the real row).
  const [checkinPending, setCheckinPending] = useState(false);
  const saveCheckin = useCallback(
    async (input: Parameters<typeof upsert>[0]) => {
      setCheckinPending(true);
      try {
        await upsert(input);
      } finally {
        setCheckinPending(false);
      }
    },
    [upsert],
  );

  // What counts as the viewer's sleep: with a dedicated sleep category set,
  // that category's timed events; otherwise the inactive≡sleep heuristic.
  // Always from the RAW window (the insights filter drops inactive
  // occurrences; member/category filters would distort nights). The ownership
  // gate lives in lib/sleep/viewer-sleep so it's unit-tested in isolation.
  const sleepCategoryId = sleepPrefs?.sleepCategoryId ?? null;
  const isViewerSleep = useCallback(
    (o: Occurrence) => viewerOwnsSleep(o, viewerId, sleepCategoryId),
    [viewerId, sleepCategoryId],
  );
  const deriveOpts = useMemo<DeriveOptions>(
    () => ({
      startHour: sleepPrefs?.nightWindowStartHour ?? 20,
      endHour: sleepPrefs?.nightWindowEndHour ?? 12,
      preFiltered: true, // isViewerSleep owns the criterion
    }),
    [sleepPrefs?.nightWindowStartHour, sleepPrefs?.nightWindowEndHour],
  );

  const viewerSpans = useMemo(
    () => rawOccurrences.filter(isViewerSleep),
    [rawOccurrences, isViewerSleep],
  );
  const nights = useMemo(
    () => deriveNights(viewerSpans, period.days, timeZone, deriveOpts),
    [viewerSpans, period.days, timeZone, deriveOpts],
  );

  const nightKeys = useMemo(() => new Set(nights.map((n) => n.dateKey)), [nights]);
  const periodLogs = useMemo(
    () => logs.filter((l) => nightKeys.has(l.date)),
    [logs, nightKeys],
  );

  // Cross-analysis: does a night's duration / quality track with the next
  // day's load, focus blocks or satisfaction? Pairs each logged night with the
  // viewer's OWN active tracked time on the day they woke into (sleep is
  // viewer-only, so a partner's events never enter the relation).
  const viewerDayOccurrences = useMemo(
    () => rawOccurrences.filter((o) => o.ownerId === viewerId),
    [rawOccurrences, viewerId],
  );
  const correlations = useMemo(() => {
    const pairs = buildSleepDayPairs(
      logs,
      viewerDayOccurrences,
      period.days,
      period.window,
      timeZone,
    );
    return sleepCorrelations(pairs);
  }, [logs, viewerDayOccurrences, period.days, period.window, timeZone]);

  // Hints read a fixed trailing window, not the period picker: switching to
  // "this week" shouldn't make patterns vanish below the minimum sample. The
  // window fetches day-aligned (stable query key, the Tonight card pattern).
  const hintsWin = useMemo(
    () => ({
      start: dayStartOffset(now, 1 - HINTS_WINDOW_DAYS, timeZone),
      end: dayStartOffset(now, 1, timeZone),
    }),
    [now, timeZone],
  );
  const hintsEvents = useWindowEvents(wsId, hintsWin, sharedCategoryIds);
  const hintsDays = useMemo(
    () =>
      Array.from({ length: HINTS_WINDOW_DAYS }, (_, i) =>
        dayStartOffset(now, i + 1 - HINTS_WINDOW_DAYS, timeZone),
      ),
    [now, timeZone],
  );
  const hintsNights = useMemo(
    () =>
      deriveNights(
        hintsEvents.occurrences.filter(isViewerSleep),
        hintsDays,
        timeZone,
        deriveOpts,
      ),
    [hintsEvents.occurrences, isViewerSleep, hintsDays, timeZone, deriveOpts],
  );
  const hintsLogs = useMemo(() => {
    const keys = new Set(hintsNights.map((n) => n.dateKey));
    return logs.filter((l) => keys.has(l.date));
  }, [logs, hintsNights]);
  const scoredCount = useMemo(
    () => hintsLogs.filter((l) => l.quality !== null || l.fatigue !== null).length,
    [hintsLogs],
  );
  const hints = useMemo(
    () =>
      computeSleepHints({ nights: hintsNights, logs: hintsLogs, prefs, timeZone }),
    [hintsNights, hintsLogs, prefs, timeZone],
  );

  // The same trailing-30-day history feeds the Tonight recommendation: the
  // viewer's habitual circadian phase, and a recent sleep debt bounded to the
  // most a single night's target may be nudged up (more is irrelevant here).
  const habitualPhase = useMemo(
    () => computeHabitualPhase(hintsNights, hintsLogs, timeZone),
    [hintsNights, hintsLogs, timeZone],
  );
  const recentDebtMs = useMemo(() => {
    const targetAsleepMs = prefs.targetCycles * prefs.cycleLengthMin * 60_000;
    return recentSleepDebtMs(hintsNights, hintsLogs, targetAsleepMs, DEBT_NUDGE_CAP_MS);
  }, [hintsNights, hintsLogs, prefs.targetCycles, prefs.cycleLengthMin]);

  const todayKey = dateKeyInZone(now, timeZone);
  const hasLogToday = logs.some((l) => l.date === todayKey);
  const derivedToday = nights.find((n) => n.dateKey === todayKey) ?? null;

  const hasAnyData =
    viewerSpans.length > 0 || logs.length > 0 || logsLoading;

  // The tab lede: a recent sleep-debt nudge takes priority (the one genuinely
  // actionable signal); otherwise the strongest sleep↔next-day relation, if it
  // clears the link threshold. Stays null while there's nothing to say.
  const youLede = useMemo<Lede | null>(() => {
    if (!hasAnyData) return null;
    if (recentDebtMs >= 45 * 60_000) {
      return {
        headline: t("sleep.debtHeadline", { ms: formatDuration(recentDebtMs, locale) }),
        tone: "attention",
        support: t("sleep.debtSupport"),
      };
    }
    const strongest = correlations
      .filter((c): c is SleepCorrelation & { rho: number } => c.rho !== null)
      .reduce<(SleepCorrelation & { rho: number }) | null>(
        (best, c) =>
          best === null || Math.abs(c.rho) > Math.abs(best.rho) ? c : best,
        null,
      );
    if (strongest && Math.abs(strongest.rho) >= 0.2) {
      return {
        headline: t("sleep.correlationHeadline", {
          metric: t(CORRELATION_METRIC_KEYS[strongest.metric]),
          strength: t(correlationStrengthKey(strongest.rho)),
          side: t(CORRELATION_SIDE_KEYS[strongest.vs]),
        }),
        tone: "neutral",
        support: t("sleep.correlationSupport", { count: strongest.n }),
      };
    }
    return null;
  }, [hasAnyData, recentDebtMs, correlations, t, locale]);

  return (
    <Reading>
      {/* Movement 1 — the answer band: what to do tonight (prescriptive) beside
          your typical night (descriptive), so the recommendation never reads as
          a lonely sentence and the desktop width carries real substance. The
          privacy note, any standout lede and the error sit full width above. */}
      <div className="space-y-4">
        <p className="flex items-center gap-1.5 px-0.5 text-xs text-muted-foreground">
          <Lock aria-hidden className="size-3" />
          {t("sleep.privacyNote")}
        </p>

        {youLede && <InsightLede lede={youLede} />}

        {logsError && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-soft"
          >
            <p className="flex items-center gap-2 text-sm">
              <CircleAlert aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              {t("sleep.loadError")}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetchLogs()}>
              <RotateCw data-icon="inline-start" />
              {t("sleep.tryAgain")}
            </Button>
          </div>
        )}

        {hasAnyData ? (
          <div className="grid grid-cols-1 items-start gap-x-8 gap-y-4 lg:grid-cols-2">
            <TonightCard
              workspaceId={wsId}
              viewerId={viewerId}
              sharedCategoryIds={sharedCategoryIds}
              prefs={prefs}
              habitualPhase={habitualPhase}
              recentDebtMs={recentDebtMs}
              timeZone={timeZone}
              now={now}
            />
            <TypicalNight
              nights={nights}
              logs={periodLogs}
              prefs={prefs}
              timeZone={timeZone}
            />
          </div>
        ) : (
          <TonightCard
            workspaceId={wsId}
            viewerId={viewerId}
            sharedCategoryIds={sharedCategoryIds}
            prefs={prefs}
            habitualPhase={habitualPhase}
            recentDebtMs={recentDebtMs}
            timeZone={timeZone}
            now={now}
          />
        )}

        {/* The morning check-in is an input prompt — it keeps a card frame
            (interactive), full width below the band. */}
        {!logsLoading && !logsError && (!hasLogToday || checkinPending) && (
          <CheckinCard
            key={`${viewerId}:${todayKey}`}
            viewerId={viewerId}
            todayKey={todayKey}
            timeZone={timeZone}
            derivedToday={derivedToday}
            onSave={saveCheckin}
          />
        )}
      </div>

      {/* Movements 2 & 3 — the rhythm strip stands alone as the tab's anchor;
          the remaining signals (check-in trends, hints, sleep↔day relations)
          flow as an even evidence grid beneath it. */}
      {hasAnyData ? (
        <>
          <RhythmChart
            nights={nights}
            logs={periodLogs}
            habitualPhase={habitualPhase}
            timeZone={timeZone}
            windowStartHour={sleepPrefs?.nightWindowStartHour ?? 20}
            windowEndHour={sleepPrefs?.nightWindowEndHour ?? 12}
            action={
              <LogNightDialog
                todayKey={todayKey}
                timeZone={timeZone}
                nights={nights}
                logs={logs}
                onSave={upsert}
                onDelete={deleteLog}
              />
            }
          />
          <div className="grid grid-cols-1 items-start gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
            <HistorySection nights={nights} logs={periodLogs} timeZone={timeZone} />
            <HintsSection hints={hints} scoredCount={scoredCount} />
            <SleepCorrelationsSection correlations={correlations} />
          </div>
        </>
      ) : logsError ? null : (
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MoonStar />
            </EmptyMedia>
            <EmptyTitle>{t("sleep.noDataTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("sleep.noDataDescription")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <LogNightDialog
              todayKey={todayKey}
              timeZone={timeZone}
              nights={nights}
              logs={logs}
              onSave={upsert}
              onDelete={deleteLog}
            />
          </EmptyContent>
        </Empty>
      )}

      {/* Movement 4 — tools: the calculator is an interactive input, so it keeps
          its frame, set apart at the foot like the Overview's "What to do". */}
      <section className="space-y-2 border-t pt-5">
        <SectionLabel>{t("sleep.planANight")}</SectionLabel>
        <CalculatorCard prefs={prefs} />
      </section>
    </Reading>
  );
}

const CORRELATION_METRIC_KEYS: Record<SleepCorrelation["metric"], string> = {
  load: "sleep.metricLoad",
  fragmentation: "sleep.metricFragmentation",
  satisfaction: "sleep.metricSatisfaction",
};
const CORRELATION_SIDE_KEYS: Record<SleepCorrelation["vs"], string> = {
  duration: "sleep.sideDuration",
  quality: "sleep.sideQuality",
};

/** |rho| → plain-language strength key; sign carries the direction separately. */
function correlationStrengthKey(rho: number): string {
  const a = Math.abs(rho);
  if (a < 0.2) return "sleep.strengthNoLink";
  if (a < 0.4) return rho > 0 ? "sleep.strengthSlightlyHigher" : "sleep.strengthSlightlyLower";
  if (a < 0.6) return rho > 0 ? "sleep.strengthTendsHigher" : "sleep.strengthTendsLower";
  return rho > 0 ? "sleep.strengthStronglyHigher" : "sleep.strengthStronglyLower";
}

/**
 * Sleep ↔ next-day relations: the six Spearman correlations
 * (load / focus blocks / satisfaction vs sleep duration / quality), computed
 * from logged nights paired with the day woken into. Only combos that clear
 * the minimum-pairs gate (rho non-null) are shown; below that the section
 * coaches the member to log more.
 */
function SleepCorrelationsSection({
  correlations,
}: {
  correlations: SleepCorrelation[];
}) {
  const t = useTranslations("insights");
  const rows = correlations.filter((c) => c.rho !== null);

  return (
    <section className="space-y-2">
      <SectionLabel>{t("sleep.correlationsTitle")}</SectionLabel>
      {rows.length === 0 ? (
        <SectionEmpty>
          {t("sleep.correlationsEmpty")}
        </SectionEmpty>
      ) : (
        <ul className="space-y-1" role="list">
          {rows.map((c) => {
            const rho = c.rho as number;
            return (
              <li
                key={`${c.metric}-${c.vs}`}
                className="flex items-center gap-2 text-xs"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-medium">
                    {t(CORRELATION_METRIC_KEYS[c.metric])}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {t("sleep.correlationRow", {
                      strength: t(correlationStrengthKey(rho)),
                      side: t(CORRELATION_SIDE_KEYS[c.vs]),
                    })}
                  </span>
                </span>
                <span
                  className="shrink-0 font-mono tabular-nums text-muted-foreground"
                  aria-label={t("sleep.correlationAria", { rho: rho.toFixed(2), count: c.n })}
                >
                  {rho > 0 ? "+" : ""}
                  {rho.toFixed(2)}
                </span>
                <span className="w-12 shrink-0 text-right font-mono tabular-nums text-muted-foreground/70">
                  n {c.n}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
