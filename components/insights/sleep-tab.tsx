"use client";

import { useCallback, useMemo, useState } from "react";
import { CircleAlert, Lock, MoonStar, RotateCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import {
  buildSleepDayPairs,
  sleepCorrelations,
  type SleepCorrelation,
} from "@/lib/analytics/sleep-cross";
import { computeSleepHints, HINTS_WINDOW_DAYS } from "@/lib/sleep/adaptive";
import { deriveNights, type DeriveOptions } from "@/lib/sleep/derive";
import type { SleepPrefs } from "@/lib/sleep/cycles";
import type { Occurrence } from "@/lib/types";
import { CheckinCard } from "./sleep/checkin-card";
import { CalculatorCard } from "./sleep/calculator-card";
import { HintsSection } from "./sleep/hints-section";
import { HistorySection } from "./sleep/history-section";
import { LogNightDialog } from "./sleep/log-night-dialog";
import { TonightCard } from "./sleep/tonight-card";
import { InsightCard, Takeaway } from "./insight-card";
import { SectionEmpty } from "./insights-empty";
import { TabGrid } from "./tab-bits";
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

  const todayKey = dateKeyInZone(now, timeZone);
  const hasLogToday = logs.some((l) => l.date === todayKey);
  const derivedToday = nights.find((n) => n.dateKey === todayKey) ?? null;

  const hasAnyData =
    viewerSpans.length > 0 || logs.length > 0 || logsLoading;

  const nightsWithData = nights.filter((n) => n.durationMs > 0).length;

  return (
    <div className="flex flex-col gap-4">
      {nightsWithData > 0 && (
        <Takeaway>
          {`${nightsWithData} night${nightsWithData === 1 ? "" : "s"} with sleep data this period — see how your nights track with the days that followed below.`}
        </Takeaway>
      )}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock aria-hidden className="size-3" />
        Sleep is personal — this tab shows yours only, and your check-ins are
        never visible to your partner.
      </p>

      {logsError && (
        <Card
          size="sm"
          role="alert"
          className="flex-row flex-wrap items-center justify-between gap-3 px-3 py-3"
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
        </Card>
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
        timeZone={timeZone}
        now={now}
      />

      {hasAnyData ? (
        // History spans the full width (its charts read better wide); hints,
        // the new sleep↔day correlations and the calculator flow two-up.
        <TabGrid>
          <div className="xl:col-span-2">
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
          </div>
          <HintsSection hints={hints} scoredCount={scoredCount} />
          <SleepCorrelationsSection correlations={correlations} />
          <CalculatorCard prefs={prefs} />
        </TabGrid>
      ) : logsError ? null : (
        <>
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
          <CalculatorCard prefs={prefs} />
        </>
      )}
    </div>
  );
}

const CORRELATION_METRIC_LABELS: Record<SleepCorrelation["metric"], string> = {
  load: "Next-day load",
  fragmentation: "Next-day focus blocks",
  satisfaction: "Next-day satisfaction",
};
const CORRELATION_SIDE_LABELS: Record<SleepCorrelation["vs"], string> = {
  duration: "sleep duration",
  quality: "sleep quality",
};

/** |rho| → plain-language strength; sign carries the direction separately. */
function correlationStrength(rho: number): string {
  const a = Math.abs(rho);
  if (a < 0.2) return "no clear link";
  if (a < 0.4) return rho > 0 ? "slightly higher" : "slightly lower";
  if (a < 0.6) return rho > 0 ? "tends higher" : "tends lower";
  return rho > 0 ? "strongly higher" : "strongly lower";
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
  const rows = correlations.filter((c) => c.rho !== null);

  return (
    <InsightCard title="Sleep & your days" metric="sleep-correlation">
      {rows.length === 0 ? (
        <SectionEmpty>
          Once you&apos;ve logged enough nights alongside rated days, this shows
          how your sleep duration and quality track with the next day&apos;s
          load, focus and satisfaction.
        </SectionEmpty>
      ) : (
        <ul className="space-y-1.5" role="list">
          {rows.map((c) => {
            const rho = c.rho as number;
            return (
              <li key={`${c.metric}-${c.vs}`} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">
                    {CORRELATION_METRIC_LABELS[c.metric]}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {correlationStrength(rho)} after more{" "}
                    {CORRELATION_SIDE_LABELS[c.vs]}
                  </span>
                </span>
                <Badge
                  variant="outline"
                  className="shrink-0 font-mono tabular-nums text-muted-foreground"
                  aria-label={`Spearman correlation ${rho.toFixed(2)} over ${c.n} nights`}
                >
                  {rho > 0 ? "+" : ""}
                  {rho.toFixed(2)}
                </Badge>
                <span className="w-10 shrink-0 text-right font-mono tabular-nums text-muted-foreground/70">
                  n {c.n}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </InsightCard>
  );
}
