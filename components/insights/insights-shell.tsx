"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useIdlePreload } from "@/lib/lazy";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import { useWindowEvents, useWorkspaceRealtime } from "@/lib/hooks/use-window-events";
import { useTasks } from "@/lib/hooks/use-tasks";
import { TimezoneProvider, useViewerTimeZone } from "@/lib/datetime/timezone-context";
import {
  resolvePeriod,
  periodToSearch,
  INSIGHTS_TABS,
  type Granularity,
  type InsightsTab,
  type PeriodState,
} from "@/lib/insights/period";
import { filterForInsights, type MemberFilter } from "@/lib/insights/filters";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadError } from "@/components/shared/load-error";
import { InsightsToolbar } from "./insights-toolbar";
import { InsightsFiltersPopover } from "./insights-filters-popover";
import { ChartSkeleton } from "./chart-skeleton";
import { cn } from "@/lib/utils";
import type { Category, Member, Occurrence, TaskRow } from "@/lib/types";

const emptySubscribe = () => () => {};

const TAB_LABELS: Record<InsightsTab, string> = {
  overview: "Overview",
  trends: "Trends",
  patterns: "Patterns",
  balance: "Balance",
  tasks: "Tasks",
  optimize: "Optimize",
};

// Each tab is its own lazy chunk (recharts stays out of the route JS); warmed
// during idle so switching tabs never shows the skeleton in practice.
const tabLoading = () => <ChartSkeleton height={360} className="mt-1" />;
const loadOverview = () => import("./overview-tab").then((m) => m.OverviewTab);
const loadTrends = () => import("./trends-tab").then((m) => m.TrendsTab);
const loadPatterns = () => import("./patterns-tab").then((m) => m.PatternsTab);
const loadBalance = () => import("./balance-tab").then((m) => m.BalanceTab);
const loadTasksTab = () => import("./tasks-tab").then((m) => m.TasksTab);
const loadOptimize = () => import("./optimize-tab").then((m) => m.OptimizeTab);
const OverviewTab = dynamic(loadOverview, { ssr: false, loading: tabLoading });
const TrendsTab = dynamic(loadTrends, { ssr: false, loading: tabLoading });
const PatternsTab = dynamic(loadPatterns, { ssr: false, loading: tabLoading });
const BalanceTab = dynamic(loadBalance, { ssr: false, loading: tabLoading });
const TasksTab = dynamic(loadTasksTab, { ssr: false, loading: tabLoading });
const OptimizeTab = dynamic(loadOptimize, { ssr: false, loading: tabLoading });

const TAB_PRELOADS = [
  loadOverview,
  loadTrends,
  loadPatterns,
  loadBalance,
  loadTasksTab,
  loadOptimize,
];

/** Everything a tab needs, computed once in the shell. */
export interface InsightsTabData {
  period: ReturnType<typeof resolvePeriod>;
  /** insights-filtered occurrences of the focused window */
  occurrences: Occurrence[];
  /** same filter over the comparison window */
  prevOccurrences: Occurrence[];
  tasks: TaskRow[];
  categories: Map<string, Category>;
  members: Map<string, Member>;
  boards: { id: string; name: string }[];
  viewerId: string;
  timeZone: string;
  memberFilter: MemberFilter;
  /** the instant relative stats (overdue, presets) are judged against */
  now: number;
}

export function InsightsShell(props: {
  initialState: PeriodState;
  initialTab: InsightsTab;
}) {
  // The timezone context is mounted per surface (CalendarShell does the same);
  // everything below reads the member's preferred zone through it.
  return (
    <TimezoneProvider>
      <InsightsShellInner {...props} />
    </TimezoneProvider>
  );
}

function InsightsShellInner({
  initialState,
  initialTab,
}: {
  initialState: PeriodState;
  initialTab: InsightsTab;
}) {
  const router = useRouter();
  const timeZone = useViewerTimeZone();
  const [state, setState] = useState<PeriodState>(initialState);
  const [tab, setTab] = useState<InsightsTab>(initialTab);

  // Insights-local filters (independent of the calendar's sidebar filters).
  const [memberFilter, setMemberFilter] = useState<MemberFilter>("both");
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<Set<string>>(new Set());
  const [includeInactive, setIncludeInactive] = useState(false);

  // SSR renders without the member's zone/data; paint the frame and fill in
  // after mount. Read "mounted" as an external store (server snapshot false,
  // client true) — no setState-in-effect needed.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const workspace = useWorkspace();
  const wsId = workspace.data?.workspaceId;
  useWorkspaceRealtime(wsId);

  // "now" anchors the relative presets. Captured at mount and refreshed on
  // every period change (event handlers may be impure; render must stay pure).
  const [now, setNow] = useState(() => Date.now());
  const period = useMemo(
    () => resolvePeriod(state, { timeZone, now }),
    [state, timeZone, now],
  );

  // Ids of Shared contexts (categories with no owner) — drives the derived
  // `isShared` on every occurrence, exactly like the calendar shell.
  const sharedCategoryIds = useMemo(
    () =>
      new Set(
        (workspace.data?.categories ?? [])
          .filter((c) => c.ownerId === null)
          .map((c) => c.id),
      ),
    [workspace.data],
  );

  const cur = useWindowEvents(wsId, period.window, sharedCategoryIds);
  const prev = useWindowEvents(wsId, period.prevWindow, sharedCategoryIds);
  const { tasks, isLoading: tasksLoading, isError: tasksError } = useTasks(wsId);

  const viewerId = workspace.data?.currentMember?.id ?? "";
  const filterArgs = useMemo(
    () => ({ viewerId, member: memberFilter, hiddenCategoryIds, includeInactive }),
    [viewerId, memberFilter, hiddenCategoryIds, includeInactive],
  );
  const occurrences = useMemo(
    () => filterForInsights(cur.occurrences, filterArgs),
    [cur.occurrences, filterArgs],
  );
  const prevOccurrences = useMemo(
    () => filterForInsights(prev.occurrences, filterArgs),
    [prev.occurrences, filterArgs],
  );

  const members = useMemo(
    () => workspace.data?.members ?? [],
    [workspace.data?.members],
  );
  const categories = useMemo(
    () => workspace.data?.categories ?? [],
    [workspace.data?.categories],
  );
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const data: InsightsTabData = {
    period,
    occurrences,
    prevOccurrences,
    tasks,
    categories: categoryMap,
    members: memberMap,
    boards: workspace.data?.boards ?? [],
    viewerId,
    timeZone,
    memberFilter,
    now,
  };

  // Warm all tab chunks during idle so first switch is instant.
  useIdlePreload(TAB_PRELOADS);

  // URL is written only in event handlers (never effects) — calendar pattern.
  function pushUrl(nextState: PeriodState, nextTab: InsightsTab) {
    router.replace(`/insights${periodToSearch(nextState, nextTab, timeZone)}`, {
      scroll: false,
    });
  }
  function changePeriod(next: PeriodState) {
    setNow(Date.now());
    setState(next);
    pushUrl(next, tab);
  }
  function changeGranularity(g: Granularity) {
    changePeriod({ ...state, granularity: g });
  }
  function changeTab(t: InsightsTab) {
    setTab(t);
    pushUrl(state, t);
  }

  const loading =
    workspace.isLoading || cur.isLoading || prev.isLoading || tasksLoading;
  const error = workspace.isError || cur.isError || prev.isError || tasksError;
  const refreshing = cur.isFetching && !cur.isLoading;
  const qc = useQueryClient();

  return (
    <div className="flex h-dvh flex-col bg-background">
      <InsightsToolbar
        state={state}
        period={period}
        timeZone={timeZone}
        onPeriodChange={changePeriod}
        onGranularityChange={changeGranularity}
        currentMember={workspace.data?.currentMember ?? null}
        filtersSlot={
          <InsightsFiltersPopover
            members={members}
            categories={categories}
            member={memberFilter}
            onMemberChange={setMemberFilter}
            hiddenCategoryIds={hiddenCategoryIds}
            onHiddenCategoryIdsChange={setHiddenCategoryIds}
            includeInactive={includeInactive}
            onIncludeInactiveChange={setIncludeInactive}
          />
        }
      />

      <Tabs value={tab} onValueChange={(v) => changeTab(v as InsightsTab)}>
        <div className="overflow-x-auto border-b px-3 sm:px-4">
          <TabsList className="h-10 w-max bg-transparent p-0">
            {INSIGHTS_TABS.map((t) => (
              <TabsTrigger
                key={t}
                value={t}
                className="rounded-none border-0 border-b-2 border-transparent px-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                {TAB_LABELS[t]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {period.clamped && (
        <p className="border-b bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground">
          Showing the most recent 366 days of the selected range.
        </p>
      )}

      <main
        className={cn(
          "min-h-0 flex-1 overflow-y-auto transition-opacity",
          refreshing && "opacity-60",
        )}
        aria-busy={loading || refreshing}
      >
        {!mounted ? (
          <div className="h-full" />
        ) : error ? (
          <LoadError subject="insights" onRetry={() => void qc.invalidateQueries()} />
        ) : loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mx-auto w-full max-w-5xl p-3 sm:p-4">
            <h2 className="sr-only">{period.label}</h2>
            {tab === "overview" && <OverviewTab data={data} />}
            {tab === "trends" && <TrendsTab data={data} />}
            {tab === "patterns" && <PatternsTab data={data} />}
            {tab === "balance" && <BalanceTab data={data} />}
            {tab === "tasks" && <TasksTab data={data} />}
            {tab === "optimize" && <OptimizeTab data={data} />}
          </div>
        )}
      </main>
    </div>
  );
}
