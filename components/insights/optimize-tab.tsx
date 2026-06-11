"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
import { computeForecast, type Forecast } from "@/lib/analytics/forecast";
import { activeStreak, dayAnomalies } from "@/lib/analytics/momentum";
import { buildSleepDayPairs } from "@/lib/analytics/sleep-cross";
import { computeUsage } from "@/lib/analytics/usage";
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
import { dateInputToMs } from "@/lib/datetime/local";
import { InsightsEmpty } from "./insights-empty";
import { StatCard, StatGrid } from "./stat-card";
import { SectionLabel } from "./tab-bits";
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

/** Human names for the mute list ("Muted: heavy-day tips"). */
const KIND_LABELS: Record<SuggestionKind, string> = {
  "unscheduled-task": "due-task tips",
  "overloaded-day": "heavy-day tips",
  "late-night": "short-night tips",
  "stranded-flexible": "movable-item tips",
  fragmentation: "fragmentation tips",
  "category-drift": "share-shift tips",
  "goal-over-budget": "over-budget tips",
  "goal-under-budget": "behind-pace tips",
  "streak-broken": "streak tips",
  anomaly: "out-of-pattern tips",
  "forecast-overload": "outlook tips",
  "sleep-debt": "sleep tips",
  "correlation-insight": "satisfaction tips",
};

export function OptimizeTab({ data }: { data: InsightsTabData }) {
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
    memberFilter,
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

  const suggestions = useMemo(() => {
    const actualByCategory = new Map(
      usage.cur.byCategory.map((c) => [c.categoryId, c.ms]),
    );
    // Streak over days that have started — future days always read as 0 and
    // would fake a "broken streak" mid-period.
    const elapsedPerDay = usage.cur.perDay.filter((d) => d.dayMs <= now);
    return computeSuggestions({
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
      goals: goals
        .filter((g) => categories.has(g.categoryId))
        .map((g) =>
          goalProgress(
            g,
            actualByCategory.get(g.categoryId) ?? 0,
            period.days,
            period.window,
            now,
          ),
        ),
      forecast: period.window.end > now ? forecast : null,
      anomalies: dayAnomalies(usage.cur.perDay),
      streak: elapsedPerDay.length > 0 ? activeStreak(elapsedPerDay) : null,
      // The sleep-debt rule only ever sees the VIEWER's own nights, and only
      // when the lens is strictly "me" (occurrences are theirs alone then).
      sleepPairs:
        memberFilter === "me"
          ? buildSleepDayPairs(sleepLogs, occurrences, period.days, period.window, timeZone)
          : null,
      suppressedKinds: new Set(suppressedKinds),
      periodLabel: period.label,
    });
  }, [occurrences, prevOccurrences, tasks, period, timeZone, now, categories, goals, forecast, usage, memberFilter, sleepLogs, suppressedKinds]);

  const coverage = useMemo(() => attributeCoverage(occurrences), [occurrences]);

  function muteKind(kind: SuggestionKind) {
    if (suppressedKinds.includes(kind)) return;
    const restored = suppressedKinds;
    void updatePrefs({ suppressedKinds: [...suppressedKinds, kind] }).catch(() => {});
    toast(`Muted ${KIND_LABELS[kind]}`, {
      description: "You won't see this kind of tip again, on any device.",
      action: {
        label: "Undo",
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
    <div className="flex flex-col gap-3">
      <p className="sr-only">
        {suggestions.length === 0
          ? "No suggestions for this period."
          : `${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"} for this period.`}
      </p>
      {period.window.end > now && (
        <OutlookSection
          forecast={forecast}
          futureWindow={data.futureWindow}
          loading={data.futureLoading}
          timeZone={timeZone}
        />
      )}
      <CoverageCard coverage={coverage} />
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
          <span>Muted:</span>
          {suppressedKinds.map((kind) => (
            <Button
              key={kind}
              variant="ghost"
              size="sm"
              className="min-h-11 px-1.5 text-xs sm:min-h-7"
              onClick={() => unmuteKind(kind)}
              aria-label={`Unmute ${KIND_LABELS[kind as SuggestionKind] ?? kind}`}
            >
              {KIND_LABELS[kind as SuggestionKind] ?? kind}
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
  const ctx = tz(timeZone);
  const rangeLabel = `${format(futureWindow.start, "d MMM", { in: ctx })} – ${format(
    futureWindow.end - 1,
    "d MMM",
    { in: ctx },
  )}`;

  if (loading) {
    return (
      <section className="space-y-1.5" aria-busy>
        <SectionLabel>Outlook · {rangeLabel}</SectionLabel>
        <Skeleton className="h-20 w-full rounded-lg" />
      </section>
    );
  }

  const committedMs = forecast.perDay.reduce((s, d) => s + d.committedMs, 0);
  const pacePct =
    forecast.capacityRatio === null ? null : Math.round(forecast.capacityRatio * 100);

  return (
    <section className="space-y-1.5">
      <SectionLabel>Outlook · {rangeLabel}</SectionLabel>
      <StatGrid>
        <StatCard
          label="Committed"
          value={formatDuration(committedMs)}
          hint="already scheduled"
        />
        <StatCard
          label="Of typical pace"
          value={pacePct === null ? "—" : `${pacePct}%`}
          warning={pacePct !== null && pacePct > 110}
          hint={
            pacePct === null
              ? "no baseline yet"
              : `typical day ${formatDuration(forecast.typicalDayMs)}`
          }
        />
        <StatCard
          label="Busiest day"
          value={forecast.busiestDay ? formatDuration(forecast.busiestDay.ms) : "—"}
          hint={
            forecast.busiestDay
              ? format(forecast.busiestDay.dayMs, "EEE d MMM", { in: ctx })
              : "nothing scheduled"
          }
        />
      </StatGrid>
      {forecast.dueUnscheduled.length > 0 && (
        <ul className="space-y-1 pt-1" role="list">
          {forecast.dueUnscheduled.slice(0, 4).map((t) => (
            <li
              key={t.taskId}
              className="flex items-baseline justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-xs"
            >
              <span className="min-w-0 truncate">
                {t.title}
                <span className="text-muted-foreground"> — due, no time blocked</span>
              </span>
              <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                {format(dateInputToMs(t.dueDate, timeZone), "EEE d MMM", { in: ctx })}
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
  if (coverage.share === null) return null;
  const pct = Math.round(coverage.share * 100);
  return (
    <div className="rounded-lg border bg-card p-3 shadow-soft">
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Optimization details
      </div>
      <div className="mt-0.5 text-base leading-tight font-semibold tabular-nums">
        {pct}%
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        of timed events in this period carry details ({coverage.withAttributes} of{" "}
        {coverage.tracked}). Set energy, flexibility, focus or satisfaction in any
        event or task dialog — suggestions get sharper as coverage grows.
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
          <EmptyTitle>Nothing to optimize</EmptyTitle>
          <EmptyDescription>
            This period looks balanced — no heavy days, short nights or stranded
            tasks stood out.
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
          All suggestions for this period are dismissed.
        </p>
      )}
      {dismissedCount > 0 && (
        <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {dismissedCount} dismissed
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 sm:min-h-7"
            onClick={() => persist([])}
          >
            Restore dismissed
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
            {suggestion.severity === "attention" ? "Worth a look" : "FYI"}
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
              Why am I seeing this?
              <ChevronDown
                data-icon="inline-end"
                className="transition-transform group-data-[state=open]:rotate-180"
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <dl className="mt-1 space-y-1 rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground">
              <div>
                <dt className="sr-only">The data behind this</dt>
                <dd>{suggestion.evidence.summary}</dd>
              </div>
              <div>
                <dt className="sr-only">When this fires</dt>
                <dd>{suggestion.evidence.threshold}</dd>
              </div>
              <div className="tabular-nums">
                <dt className="sr-only">Data window</dt>
                <dd>
                  Window: {suggestion.evidence.windowLabel}
                  {suggestion.evidence.n !== undefined
                    ? ` · n ${suggestion.evidence.n}`
                    : ""}
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
            aria-label={thanked ? "Marked useful" : "Useful"}
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
            aria-label="Not useful — mute this kind of tip"
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
        aria-label={`Dismiss: ${suggestion.title}`}
      >
        <X />
      </Button>
    </li>
  );
}
