"use client";

import { useMemo } from "react";
import { Lock, MoonStar } from "lucide-react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { dateKeyInZone } from "@/lib/datetime/local";
import { useSleepLogs, useUpsertSleepLog } from "@/lib/hooks/use-sleep-logs";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import { computeSleepHints } from "@/lib/sleep/adaptive";
import { deriveNights } from "@/lib/sleep/derive";
import type { SleepPrefs } from "@/lib/sleep/cycles";
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
 * own inactive events to tell one consistent story. The member filter in the
 * toolbar deliberately has no effect here.
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

  const { logs, isLoading: logsLoading } = useSleepLogs(wsId, viewerId);
  const upsert = useUpsertSleepLog(wsId, viewerId);

  // Your own inactive spans from the RAW window (the insights filter drops
  // inactive occurrences; member/category filters would distort nights).
  const viewerSpans = useMemo(
    () =>
      rawOccurrences.filter(
        (o) =>
          o.ownerId === viewerId && o.inactive && !o.allDay && o.kind === "event",
      ),
    [rawOccurrences, viewerId],
  );
  const nights = useMemo(
    () => deriveNights(viewerSpans, period.days, timeZone),
    [viewerSpans, period.days, timeZone],
  );

  const nightKeys = useMemo(() => new Set(nights.map((n) => n.dateKey)), [nights]);
  const periodLogs = useMemo(
    () => logs.filter((l) => nightKeys.has(l.date)),
    [logs, nightKeys],
  );
  const scoredCount = useMemo(
    () => periodLogs.filter((l) => l.quality !== null || l.fatigue !== null).length,
    [periodLogs],
  );
  const hints = useMemo(
    () => computeSleepHints({ nights, logs: periodLogs, prefs, timeZone }),
    [nights, periodLogs, prefs, timeZone],
  );

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

      {!logsLoading && !hasLogToday && (
        <CheckinCard
          key={`${viewerId}:${todayKey}`}
          viewerId={viewerId}
          todayKey={todayKey}
          timeZone={timeZone}
          derivedToday={derivedToday}
          onSave={upsert}
        />
      )}

      <TonightCard
        workspaceId={wsId}
        viewerId={viewerId}
        sharedCategoryIds={sharedCategoryIds}
        prefs={prefs}
        timeZone={timeZone}
        now={now}
      />

      <CalculatorCard prefs={prefs} />

      {hasAnyData ? (
        <>
          <HistorySection
            nights={nights}
            logs={periodLogs}
            prefs={prefs}
            timeZone={timeZone}
          />
          <HintsSection hints={hints} scoredCount={scoredCount} />
        </>
      ) : (
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MoonStar />
            </EmptyMedia>
            <EmptyTitle>No sleep data yet</EmptyTitle>
            <EmptyDescription>
              Mark your nightly events as inactive in the event dialog —
              Insights derives your nights from them — or log a night by hand
              below.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <LogNightDialog
              todayKey={todayKey}
              timeZone={timeZone}
              nights={nights}
              logs={logs}
              onSave={upsert}
            />
          </EmptyContent>
        </Empty>
      )}

      {hasAnyData && (
        <div className="flex justify-start">
          <LogNightDialog
            todayKey={todayKey}
            timeZone={timeZone}
            nights={nights}
            logs={logs}
            onSave={upsert}
          />
        </div>
      )}
    </div>
  );
}
