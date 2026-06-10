"use client";

import { useMemo, useState } from "react";
import {
  AlarmClock,
  ArrowRightLeft,
  CircleAlert,
  Gauge,
  Info,
  MoonStar,
  Puzzle,
  Scale,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  attributeCoverage,
  computeSuggestions,
  type Suggestion,
  type SuggestionKind,
} from "@/lib/insights/suggestions";
import { InsightsEmpty } from "./insights-empty";
import type { InsightsTabData } from "./insights-shell";

// Dismissals live in ONE viewer-scoped localStorage entry: a JSON map of
// period key → dismissed suggestion ids, pruned to the most recent periods.
// Suggestion ids are stable for the same data, so a dismissal survives
// re-renders and filter tweaks but resets when the period changes.
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
  } = data;

  const suggestions = useMemo(
    () =>
      computeSuggestions({
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
      }),
    [occurrences, prevOccurrences, tasks, period, timeZone, now, categories],
  );
  const coverage = useMemo(() => attributeCoverage(occurrences), [occurrences]);

  if (occurrences.length === 0) return <InsightsEmpty />;

  const periodKey = `${period.window.start}-${period.window.end}`;
  return (
    <div className="flex flex-col gap-3">
      <p className="sr-only">
        {suggestions.length === 0
          ? "No suggestions for this period."
          : `${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"} for this period.`}
      </p>
      <CoverageCard coverage={coverage} />
      {/* Keyed remount per period + viewer: dismissed state re-reads storage
          in its lazy initializer; no setState-in-effect. */}
      <SuggestionList
        key={`${viewerId}:${periodKey}`}
        storageKey={`${STORAGE_PREFIX}${viewerId}`}
        periodKey={periodKey}
        suggestions={suggestions}
      />
    </div>
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
}: {
  storageKey: string;
  periodKey: string;
  suggestions: Suggestion[];
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
          <Button variant="ghost" size="sm" onClick={() => persist([])}>
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
}: {
  suggestion: Suggestion;
  onDismiss: () => void;
}) {
  const KindIcon = KIND_ICONS[suggestion.kind];
  const SeverityIcon = suggestion.severity === "attention" ? CircleAlert : Info;
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
