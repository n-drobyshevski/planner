"use client";

import { useCallback, useMemo, useState } from "react";
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
import {
  useDeleteSleepLog,
  useSleepLogs,
  useUpsertSleepLog,
} from "@/lib/hooks/use-sleep-logs";
import { useWindowEvents } from "@/lib/hooks/use-window-events";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import { computeSleepHints, HINTS_WINDOW_DAYS } from "@/lib/sleep/adaptive";
import {
  computeHabitualPhase,
  DEBT_NUDGE_CAP_MS,
  recentSleepDebtMs,
} from "@/lib/sleep/circadian";
import { deriveNights, type DeriveOptions } from "@/lib/sleep/derive";
import type { SleepPrefs } from "@/lib/sleep/cycles";
import type { Occurrence } from "@/lib/types";
import { CheckinCard } from "./sleep/checkin-card";
import { CalculatorCard } from "./sleep/calculator-card";
import { HintsSection } from "./sleep/hints-section";
import { HistorySection } from "./sleep/history-section";
import { LogNightDialog } from "./sleep/log-night-dialog";
import { TonightCard } from "./sleep/tonight-card";
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
  const { period, rawOccurrences, members, viewerId, timeZone, now } = data;

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

  const viewer = members.get(viewerId);
  const prefs: SleepPrefs = useMemo(
    () => ({
      cycleLengthMin: viewer?.sleepCycleLengthMin ?? 90,
      onsetLatencyMin: viewer?.sleepOnsetLatencyMin ?? 15,
      targetCycles: viewer?.targetSleepCycles ?? 5,
    }),
    [viewer],
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
  // occurrences; member/category filters would distort nights).
  const sleepCategoryId = viewer?.sleepCategoryId ?? null;
  const isViewerSleep = useCallback(
    (o: Occurrence) =>
      o.ownerId === viewerId &&
      !o.allDay &&
      o.kind === "event" &&
      (sleepCategoryId !== null ? o.categoryId === sleepCategoryId : o.inactive),
    [viewerId, sleepCategoryId],
  );
  const deriveOpts = useMemo<DeriveOptions>(
    () => ({
      startHour: viewer?.nightWindowStartHour ?? 20,
      endHour: viewer?.nightWindowEndHour ?? 12,
      preFiltered: true, // isViewerSleep owns the criterion
    }),
    [viewer?.nightWindowStartHour, viewer?.nightWindowEndHour],
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

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock aria-hidden className="size-3" />
        Sleep is personal — this tab shows yours only, and your check-ins are
        never visible to your partner.
      </p>

      {logsError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-soft"
        >
          <p className="flex items-center gap-2 text-sm">
            <CircleAlert aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            We couldn&apos;t load your sleep logs. Check your connection and try
            again.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetchLogs()}>
            <RotateCw data-icon="inline-start" />
            Try again
          </Button>
        </div>
      )}

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

      {hasAnyData ? (
        <>
          <HistorySection
            nights={nights}
            logs={periodLogs}
            prefs={prefs}
            timeZone={timeZone}
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
          <HintsSection hints={hints} scoredCount={scoredCount} />
        </>
      ) : logsError ? null : (
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MoonStar />
            </EmptyMedia>
            <EmptyTitle>No sleep data yet</EmptyTitle>
            <EmptyDescription>
              Log a night below, or mark your nightly events as inactive in the
              event dialog — Insights derives your nights from them
              automatically.
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

      <CalculatorCard prefs={prefs} />
    </div>
  );
}
