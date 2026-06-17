"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import {
  Activity,
  AlarmClock,
  ArrowRightLeft,
  BedDouble,
  CalendarClock,
  ChevronDown,
  CircleAlert,
  Flame,
  Gauge,
  Info,
  Meh,
  MoonStar,
  Puzzle,
  Scale,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { categoryShares } from "@/lib/analytics/balance";
import { computeForecast, type Forecast } from "@/lib/analytics/forecast";
import { activeStreak, dayAnomalies } from "@/lib/analytics/momentum";
import { buildSleepDayPairs } from "@/lib/analytics/sleep-cross";
import { computeTaskStats } from "@/lib/analytics/task-stats";
import { computeUsage } from "@/lib/analytics/usage";
import { buildDigestPayload } from "@/lib/insights/digest-payload";
import { goalProgress } from "@/lib/insights/goals";
import {
  attributeCoverage,
  computeSuggestions,
  type Suggestion,
  type SuggestionKind,
} from "@/lib/insights/suggestions";
import { useCategoryGoals } from "@/lib/hooks/use-category-goals";
import {
  useInsightsPrefs,
  useUpdateInsightsPrefs,
} from "@/lib/hooks/use-insights-prefs";
import { useSleepLogs } from "@/lib/hooks/use-sleep-logs";
import { formatDuration } from "@/lib/datetime/format";
import { dateFnsLocale } from "@/lib/datetime/date-locale";
import { dateInputToMs, dateKeyInZone } from "@/lib/datetime/local";
import { Link } from "@/i18n/navigation";
import { DigestCard } from "./digest-card";
import { InsightsEmpty } from "./insights-empty";
import { StatCard, StatGrid } from "./stat-card";
import { SectionLabel, TabGrid } from "./tab-bits";
import type { InsightsTabData } from "./insights-shell";

// Dismissals live in ONE viewer-scoped localStorage entry: a JSON map of
// period key → dismissed suggestion ids, pruned to the most recent periods.
// Suggestion ids are stable for the same data, so a dismissal survives
// re-renders and filter tweaks but resets when the period changes.
// (Muting a whole KIND is the cross-device layer — that lives in
// insights_prefs.suppressed_kinds, written through the prefs hook.)
const STORAGE_PREFIX = "planner:insights:dismissed:v1:";
const MAX_PERIOD_ENTRIES = 12;

type DismissalMap = Record<string, string[]>;

function readDismissals(storageKey: string): DismissalMap {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      return parsed as DismissalMap;
  } catch {
    /* private mode / corrupt entry — treat as nothing dismissed */
  }
  return {};
}

function writeDismissals(storageKey: string, periodKey: string, ids: string[]) {
  try {
    const map = readDismissals(storageKey);
    // Re-insert last so JSON key order doubles as recency for pruning.
    delete map[periodKey];
    map[periodKey] = ids;
    const keys = Object.keys(map);
    while (keys.length > MAX_PERIOD_ENTRIES) delete map[keys.shift() as string];
    localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    /* private mode — dismissal still applies for this mount via state */
  }
}

const KIND_ICONS: Record<SuggestionKind, LucideIcon> = {
  "unscheduled-task": AlarmClock,
  "overloaded-day": Gauge,
  "late-night": MoonStar,
  "stranded-flexible": ArrowRightLeft,
  fragmentation: Puzzle,
  "category-drift": Scale,
  "goal-over-budget": Wallet,
  "goal-under-budget": Target,
  "streak-broken": Flame,
  anomaly: Activity,
  "forecast-overload": CalendarClock,
  "sleep-debt": BedDouble,
  "correlation-insight": Meh,
};

/** Translation keys for the mute list ("Muted: heavy-day tips"). */
const KIND_LABEL_KEYS: Record<SuggestionKind, string> = {
  "unscheduled-task": "optimize.kind.unscheduledTask",
  "overloaded-day": "optimize.kind.overloadedDay",
  "late-night": "optimize.kind.lateNight",
  "stranded-flexible": "optimize.kind.strandedFlexible",
  fragmentation: "optimize.kind.fragmentation",
  "category-drift": "optimize.kind.categoryDrift",
  "goal-over-budget": "optimize.kind.goalOverBudget",
  "goal-under-budget": "optimize.kind.goalUnderBudget",
  "streak-broken": "optimize.kind.streakBroken",
  anomaly: "optimize.kind.anomaly",
  "forecast-overload": "optimize.kind.forecastOverload",
  "sleep-debt": "optimize.kind.sleepDebt",
  "correlation-insight": "optimize.kind.correlationInsight",
};

/** Look up a kind label, tolerating an unknown stored kind (renders the raw id). */
function kindLabel(
  t: ReturnType<typeof useTranslations<"insights">>,
  kind: string,
): string {
  const key = KIND_LABEL_KEYS[kind as SuggestionKind];
  return key ? t(key) : kind;
}

export function OptimizeTab({ data }: { data: InsightsTabData }) {
  const t = useTranslations("insights");
  const tc = useTranslations("common");
  const locale = useLocale();
  const {
    period,
    occurrences,
    prevOccurrences,
    tasks,
    categories,
    timeZone,
    now,
    viewerId,
    workspaceId,
  } = data;

  const { goals } = useCategoryGoals(workspaceId || undefined);
  const { logs: sleepLogs } = useSleepLogs(
    workspaceId || undefined,
    viewerId || undefined,
  );
  const { prefs } = useInsightsPrefs(workspaceId || undefined, viewerId || undefined);
  const updatePrefs = useUpdateInsightsPrefs(
    workspaceId || undefined,
    viewerId || undefined,
  );
  const suppressedKinds = useMemo(
    () => prefs?.suppressedKinds ?? [],
    [prefs?.suppressedKinds],
  );

  // Active (non-sleep) usage of both windows — shared baseline for the
  // forecast, anomalies, streak and goal judgments (same rule as the engine:
  // sleep blocks never read as workload).
  const usage = useMemo(() => {
    const active = (occs: typeof occurrences) => occs.filter((o) => !o.inactive);
    return {
      cur: computeUsage(active(occurrences), period.days, period.window, {
        includeInactive: true,
      }),
      prev: computeUsage(active(prevOccurrences), period.prevDays, period.prevWindow, {
        includeInactive: true,
      }),
    };
  }, [occurrences, prevOccurrences, period]);

  // Capacity forecast over the NEXT window: committed time from already-
  // scheduled (incl. recurring) items vs the typical day of the trailing
  // current+previous windows.
  const forecast = useMemo(
    () =>
      computeForecast({
        futureOccurrences: data.futureOccurrences,
        futureDays: data.futureDays,
        futureWindow: data.futureWindow,
        historyPerDay: [...usage.cur.perDay, ...usage.prev.perDay],
        tasks,
        timeZone,
        now,
      }),
    [usage, data.futureOccurrences, data.futureDays, data.futureWindow, tasks, timeZone, now],
  );

  // Lifted out of the suggestions memo: the digest payload reads the same
  // goal judgments, anomalies and streak the rule engine sees.
  const goalsProgress = useMemo(() => {
    const actualByCategory = new Map(
      usage.cur.byCategory.map((c) => [c.categoryId, c.ms]),
    );
    return goals
      .filter((g) => categories.has(g.categoryId))
      .map((g) =>
        goalProgress(
          g,
          actualByCategory.get(g.categoryId) ?? 0,
          period.days,
          period.window,
          now,
        ),
      );
  }, [goals, categories, usage.cur.byCategory, period, now]);
  const anomalies = useMemo(() => dayAnomalies(usage.cur.perDay), [usage.cur.perDay]);
  // Streak over days that have started — future days always read as 0 and
  // would fake a "broken streak" mid-period.
  const streak = useMemo(() => {
    const elapsedPerDay = usage.cur.perDay.filter((d) => d.dayMs <= now);
    return elapsedPerDay.length > 0 ? activeStreak(elapsedPerDay) : null;
  }, [usage.cur.perDay, now]);

  const suggestions = useMemo(() => {
    return computeSuggestions({
      t,
      locale,
      occurrences,
      prevOccurrences,
      tasks,
      window: period.window,
      prevWindow: period.prevWindow,
      days: period.days,
      prevDays: period.prevDays,
      timeZone,
      now,
      categoryName: (id) =>
        id === null ? "Uncategorized" : (categories.get(id)?.name ?? "a context"),
      goals: goalsProgress,
      forecast: period.window.end > now ? forecast : null,
      anomalies,
      streak,
      // The sleep-debt rule sees the VIEWER's own nights — occurrences are
      // always the viewer's own slice now.
      sleepPairs: buildSleepDayPairs(sleepLogs, occurrences, period.days, period.window, timeZone),
      suppressedKinds: new Set(suppressedKinds),
      periodLabel: period.label,
    });
  }, [t, locale, occurrences, prevOccurrences, tasks, period, timeZone, now, categories, goalsProgress, anomalies, streak, forecast, sleepLogs, suppressedKinds]);

  const coverage = useMemo(() => attributeCoverage(occurrences), [occurrences]);

  // The digest payload: the same aggregates this tab renders, rounded to
  // minutes and clamped (see lib/insights/digest-payload.ts for the privacy
  // boundary — no event titles, no occurrences, no sleep rows).
  const digestPayload = useMemo(() => {
    const active = occurrences.filter((o) => !o.inactive);
    const prevActive = prevOccurrences.filter((o) => !o.inactive);
    const shares = categoryShares(active, prevActive, period.window, period.prevWindow);
    const taskStats = computeTaskStats(tasks, period.window, now, timeZone);
    const name = (id: string | null) =>
      id === null ? t("series.noContext") : (categories.get(id)?.name ?? t("series.unknown"));
    const futureCommittedMs = forecast.perDay.reduce((s, d) => s + d.committedMs, 0);
    return buildDigestPayload({
      periodLabel: period.label,
      dayCount: period.days.length,
      lens: "me",
      locale: locale === "ru" ? "ru" : "en",
      totalMs: usage.cur.summary.totalMs,
      prevTotalMs: usage.prev.summary.totalMs,
      dailyAvgMs: usage.cur.summary.dailyAverageMs,
      activeDays: usage.cur.summary.activeDays,
      busiest: usage.cur.summary.busiestDay
        ? {
            dateKey: dateKeyInZone(usage.cur.summary.busiestDay.dayMs, timeZone),
            ms: usage.cur.summary.busiestDay.ms,
          }
        : null,
      contexts: shares.map((s) => ({
        name: name(s.categoryId),
        ms: s.ms,
        share: s.share,
        prevShare: s.prevShare,
      })),
      tasks: {
        completed: taskStats.completedCount,
        onTimeRate: taskStats.adherenceRate,
        overdueOpen: taskStats.overdueOpenCount,
      },
      goals: goalsProgress.map((g) => ({
        name: name(g.goal.categoryId),
        direction: g.goal.direction,
        targetMs: g.targetMs,
        actualMs: g.actualMs,
        judgment: g.judgment,
      })),
      outlook:
        period.window.end > now
          ? {
              committedMs: futureCommittedMs,
              capacityRatio: forecast.capacityRatio,
              busiestDateKey: forecast.busiestDay
                ? dateKeyInZone(forecast.busiestDay.dayMs, timeZone)
                : null,
              dueUnscheduled: forecast.dueUnscheduled.length,
            }
          : null,
      anomalies: anomalies.map((a) => ({
        dateKey: dateKeyInZone(a.dayMs, timeZone),
        ms: a.ms,
        direction: a.direction,
      })),
      streak,
      signals: suggestions.map((s) => ({
        kind: s.kind,
        text: `${s.title} — ${s.evidence.summary}`,
      })),
    });
  }, [occurrences, prevOccurrences, period, tasks, now, timeZone, categories, usage, forecast, goalsProgress, anomalies, streak, suggestions]);

  function muteKind(kind: SuggestionKind) {
    if (suppressedKinds.includes(kind)) return;
    const restored = suppressedKinds;
    void updatePrefs({ suppressedKinds: [...suppressedKinds, kind] }).catch(() => {});
    toast(t("optimize.muted", { label: kindLabel(t, kind) }), {
      description: t("optimize.mutedDescription"),
      action: {
        label: tc("undo"),
        onClick: () => void updatePrefs({ suppressedKinds: restored }).catch(() => {}),
      },
    });
  }
  function unmuteKind(kind: string) {
    void updatePrefs({
      suppressedKinds: suppressedKinds.filter((k) => k !== kind),
    }).catch(() => {});
  }

  if (occurrences.length === 0) return <InsightsEmpty />;

  const periodKey = `${period.window.start}-${period.window.end}`;
  return (
    <div className="flex flex-col gap-4">
      <p className="sr-only">
        {suggestions.length === 0
          ? t("optimize.srNoSuggestions")
          : t("optimize.srSuggestions", { count: suggestions.length })}
      </p>
      <DigestCard payload={digestPayload} />
      {/* Outlook and coverage pair two-up on desktop; the digest above and the
          suggestion list below read the whole period and stay full width. */}
      <TabGrid>
        {period.window.end > now && (
          <OutlookSection
            forecast={forecast}
            futureWindow={data.futureWindow}
            loading={data.futureLoading}
            timeZone={timeZone}
          />
        )}
        <CoverageCard coverage={coverage} />
      </TabGrid>
      {/* Keyed remount per period + viewer: dismissed state re-reads storage
          in its lazy initializer; no setState-in-effect. */}
      <SuggestionList
        key={`${viewerId}:${periodKey}`}
        storageKey={`${STORAGE_PREFIX}${viewerId}`}
        periodKey={periodKey}
        suggestions={suggestions}
        onMute={muteKind}
      />
      {suppressedKinds.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-muted-foreground">
          <span>{t("optimize.mutedLabel")}</span>
          {suppressedKinds.map((kind) => (
            <Button
              key={kind}
              variant="ghost"
              size="sm"
              className="min-h-11 px-1.5 text-xs sm:min-h-7"
              onClick={() => unmuteKind(kind)}
              aria-label={t("optimize.unmute", { label: kindLabel(t, kind) })}
            >
              {kindLabel(t, kind)}
              <X data-icon="inline-end" />
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Capacity outlook for the window after the focused one: committed time from
 * already-scheduled items (recurring series expand forward like any calendar
 * window) judged against the typical day of the trailing two windows, plus
 * tasks due next window with no time blocked. Hidden for fully-past periods —
 * an outlook on history helps nobody.
 */
function OutlookSection({
  forecast,
  futureWindow,
  loading,
  timeZone,
}: {
  forecast: Forecast;
  futureWindow: { start: number; end: number };
  loading: boolean;
  timeZone: string;
}) {
  const t = useTranslations("insights");
  const locale = useLocale();
  const ctx = tz(timeZone);
  const dfLocale = dateFnsLocale(locale);
  const rangeLabel = `${format(futureWindow.start, "d MMM", { in: ctx, locale: dfLocale })} – ${format(
    futureWindow.end - 1,
    "d MMM",
    { in: ctx, locale: dfLocale },
  )}`;

  if (loading) {
    return (
      <section className="space-y-1.5" aria-busy>
        <SectionLabel>{t("optimize.outlook", { range: rangeLabel })}</SectionLabel>
        <Skeleton className="h-20 w-full rounded-lg" />
      </section>
    );
  }

  const committedMs = forecast.perDay.reduce((s, d) => s + d.committedMs, 0);
  const pacePct =
    forecast.capacityRatio === null ? null : Math.round(forecast.capacityRatio * 100);

  return (
    <section className="space-y-1.5">
      <SectionLabel>{t("optimize.outlook", { range: rangeLabel })}</SectionLabel>
      <StatGrid>
        <StatCard
          label={t("optimize.committed")}
          value={formatDuration(committedMs, locale)}
          hint={t("optimize.committedHint")}
        />
        <StatCard
          label={t("optimize.ofTypicalPace")}
          value={pacePct === null ? "—" : `${pacePct}%`}
          warning={pacePct !== null && pacePct > 110}
          hint={
            pacePct === null
              ? t("optimize.noBaseline")
              : t("optimize.typicalDay", { ms: formatDuration(forecast.typicalDayMs, locale) })
          }
        />
        <StatCard
          label={t("optimize.busiestDay")}
          value={forecast.busiestDay ? formatDuration(forecast.busiestDay.ms, locale) : "—"}
          hint={
            forecast.busiestDay
              ? format(forecast.busiestDay.dayMs, "EEE d MMM", { in: ctx, locale: dfLocale })
              : t("optimize.nothingScheduled")
          }
        />
      </StatGrid>
      {forecast.dueUnscheduled.length > 0 && (
        <ul className="space-y-1 pt-1" role="list">
          {forecast.dueUnscheduled.slice(0, 4).map((task) => (
            <li
              key={task.taskId}
              className="flex items-baseline justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-xs"
            >
              <span className="min-w-0 truncate">
                {task.title}
                <span className="text-muted-foreground">{t("optimize.dueNoTime")}</span>
              </span>
              <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                {format(dateInputToMs(task.dueDate, timeZone), "EEE d MMM", { in: ctx, locale: dfLocale })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CoverageCard({
  coverage,
}: {
  coverage: ReturnType<typeof attributeCoverage>;
}) {
  const t = useTranslations("insights");
  if (coverage.share === null) return null;
  const pct = Math.round(coverage.share * 100);
  return (
    <div className="rounded-lg border bg-card p-3 shadow-soft">
      <div className="text-xs font-medium text-muted-foreground">
        {t("optimize.optimizationDetails")}
      </div>
      <div className="mt-0.5 text-base leading-tight font-semibold tabular-nums">
        {pct}%
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t("optimize.coverageBody", {
          withAttributes: coverage.withAttributes,
          tracked: coverage.tracked,
        })}
      </p>
    </div>
  );
}

function SuggestionList({
  storageKey,
  periodKey,
  suggestions,
  onMute,
}: {
  storageKey: string;
  periodKey: string;
  suggestions: Suggestion[];
  onMute: (kind: SuggestionKind) => void;
}) {
  const t = useTranslations("insights");
  // Component is inside an ssr:false chunk, so reading localStorage in the
  // lazy initializer is hydration-safe.
  const [dismissed, setDismissed] = useState<string[]>(
    () => readDismissals(storageKey)[periodKey] ?? [],
  );
  const visible = suggestions.filter((s) => !dismissed.includes(s.id));
  const dismissedCount = suggestions.length - visible.length;

  function persist(next: string[]) {
    setDismissed(next);
    writeDismissals(storageKey, periodKey, next);
  }

  if (suggestions.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Sparkles />
          </EmptyMedia>
          <EmptyTitle>{t("optimize.nothingToOptimize")}</EmptyTitle>
          <EmptyDescription>
            {t("optimize.nothingToOptimizeDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {visible.length > 0 ? (
        <ul role="list" className="flex flex-col gap-2">
          {visible.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              onDismiss={() => persist([...dismissed, s.id])}
              onMute={() => onMute(s.kind)}
            />
          ))}
        </ul>
      ) : (
        <p className="px-1 py-6 text-center text-sm text-muted-foreground">
          {t("optimize.allDismissed")}
        </p>
      )}
      {dismissedCount > 0 && (
        <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {t("optimize.dismissedCount", { count: dismissedCount })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 sm:min-h-7"
            onClick={() => persist([])}
          >
            {t("optimize.restoreDismissed")}
          </Button>
        </div>
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onDismiss,
  onMute,
}: {
  suggestion: Suggestion;
  onDismiss: () => void;
  onMute: () => void;
}) {
  const t = useTranslations("insights");
  const KindIcon = KIND_ICONS[suggestion.kind];
  const SeverityIcon = suggestion.severity === "attention" ? CircleAlert : Info;
  // "Useful" is a thank-you, not a database row — it acknowledges and stops.
  const [thanked, setThanked] = useState(false);

  return (
    <li className="flex items-start gap-3 rounded-lg border bg-card p-3 shadow-soft">
      <KindIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium">{suggestion.title}</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <SeverityIcon aria-hidden className="size-3" />
            {suggestion.severity === "attention" ? t("optimize.worthALook") : t("optimize.fyi")}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{suggestion.body}</p>
        {suggestion.meta && suggestion.meta.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            {suggestion.meta.join(" · ")}
          </p>
        )}

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="group -ml-1.5 mt-1 min-h-11 px-1.5 text-xs text-muted-foreground sm:min-h-7"
            >
              {t("optimize.whyAmISeeing")}
              <ChevronDown
                data-icon="inline-end"
                className="transition-transform group-data-[state=open]:rotate-180"
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <dl className="mt-1 space-y-1 rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground">
              <div>
                <dt className="sr-only">{t("optimize.dataBehind")}</dt>
                <dd>{suggestion.evidence.summary}</dd>
              </div>
              <div>
                <dt className="sr-only">{t("optimize.whenThisFires")}</dt>
                <dd>{suggestion.evidence.threshold}</dd>
              </div>
              <div className="tabular-nums">
                <dt className="sr-only">{t("optimize.dataWindow")}</dt>
                <dd>
                  {suggestion.evidence.n !== undefined
                    ? t("optimize.windowLabelN", {
                        label: suggestion.evidence.windowLabel,
                        n: suggestion.evidence.n,
                      })
                    : t("optimize.windowLabel", { label: suggestion.evidence.windowLabel })}
                </dd>
              </div>
            </dl>
          </CollapsibleContent>
        </Collapsible>

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {suggestion.action && (
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 text-xs sm:min-h-7"
              asChild
            >
              <Link href={suggestion.action.href}>{suggestion.action.label}</Link>
            </Button>
          )}
          <span className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            className="size-11 text-muted-foreground sm:size-7"
            aria-label={thanked ? t("optimize.markedUseful") : t("optimize.useful")}
            aria-pressed={thanked}
            disabled={thanked}
            onClick={() => setThanked(true)}
          >
            <ThumbsUp className={thanked ? "text-foreground" : undefined} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 text-muted-foreground sm:size-7"
            aria-label={t("optimize.notUseful")}
            onClick={onMute}
          >
            <ThumbsDown />
          </Button>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="-mt-1 -mr-1 size-11 shrink-0 text-muted-foreground sm:size-8"
        onClick={onDismiss}
        aria-label={t("optimize.dismiss", { title: suggestion.title })}
      >
        <X />
      </Button>
    </li>
  );
}
