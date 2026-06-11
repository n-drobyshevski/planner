"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { useIdlePreload } from "@/lib/lazy";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import { useWindowEvents, useWorkspaceRealtime } from "@/lib/hooks/use-window-events";
import { useTasks } from "@/lib/hooks/use-tasks";
import { TimezoneProvider, useViewerTimeZone } from "@/lib/datetime/timezone-context";
import {
  resolvePeriod,
  periodToSearch,
  nextWindowOf,
  INSIGHTS_TABS,
  type Granularity,
  type InsightsTab,
  type PeriodState,
} from "@/lib/insights/period";
import { filterForInsights, type MemberFilter } from "@/lib/insights/filters";
import { useInsightsFilters } from "@/lib/hooks/use-insights-filters";
import { useInsightsCustomizationRealtime } from "@/lib/hooks/use-insights-prefs";
import type { SavedViewConfig } from "@/lib/insights/views";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadError } from "@/components/shared/load-error";
import { InsightsToolbar } from "./insights-toolbar";
import { InsightsFiltersPopover } from "./insights-filters-popover";
import { SavedViewsMenu } from "./saved-views-menu";
import { ChartSkeleton } from "./chart-skeleton";
import { InsightsTabSkeleton } from "./insights-tab-skeleton";
import { cn } from "@/lib/utils";
import type { Category, Member, Occurrence, TaskRow, TimeWindow } from "@/lib/types";

const emptySubscribe = () => () => {};

const TAB_LABELS: Record<InsightsTab, string> = {
  overview: "Overview",
  trends: "Trends",
  patterns: "Patterns",
  balance: "Balance",
  tasks: "Tasks",
  optimize: "Optimize",
  sleep: "Sleep",
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
const loadSleep = () => import("./sleep-tab").then((m) => m.SleepTab);
const OverviewTab = dynamic(loadOverview, { ssr: false, loading: tabLoading });
const TrendsTab = dynamic(loadTrends, { ssr: false, loading: tabLoading });
const PatternsTab = dynamic(loadPatterns, { ssr: false, loading: tabLoading });
const BalanceTab = dynamic(loadBalance, { ssr: false, loading: tabLoading });
const TasksTab = dynamic(loadTasksTab, { ssr: false, loading: tabLoading });
const OptimizeTab = dynamic(loadOptimize, { ssr: false, loading: tabLoading });
const SleepTab = dynamic(loadSleep, { ssr: false, loading: tabLoading });

const TAB_PRELOADS = [
  loadOverview,
  loadTrends,
  loadPatterns,
  loadBalance,
  loadTasksTab,
  loadOptimize,
  loadSleep,
];

/** Everything a tab needs, computed once in the shell. */
export interface InsightsTabData {
  period: ReturnType<typeof resolvePeriod>;
  /** insights-filtered occurrences of the focused window */
  occurrences: Occurrence[];
  /** same filter over the comparison window */
  prevOccurrences: Occurrence[];
  /**
   * RAW (unfiltered) occurrences of the focused window — same array the
   * filter ran over. The Sleep tab derives nights from inactive spans, which
   * the insights filter drops; everything else should use `occurrences`.
   */
  rawOccurrences: Occurrence[];
  /** insights-filtered occurrences of the window AFTER the focused one —
   *  recurring series expanded forward; feeds the Optimize tab's Outlook. */
  futureOccurrences: Occurrence[];
  futureWindow: TimeWindow;
  futureDays: number[];
  /** true while the future window is still fetching (Outlook shows a skeleton
   *  instead of reading an empty array as "nothing committed") */
  futureLoading: boolean;
  tasks: TaskRow[];
  categories: Map<string, Category>;
  members: Map<string, Member>;
  boards: { id: string; name: string }[];
  /** for tabs that read/write customization rows (goals, prefs, views) */
  workspaceId: string;
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
  // One channel for goals/views/prefs — the customization data hooks are
  // channel-free on purpose (see use-insights-prefs.ts).
  useInsightsCustomizationRealtime(wsId, workspace.data?.currentMember?.id);

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

  // The window after the focused one, for the Outlook forecast. Same period
  // length; recurring series expand into it like any calendar window.
  const future = useMemo(() => nextWindowOf(period, timeZone), [period, timeZone]);

  const cur = useWindowEvents(wsId, period.window, sharedCategoryIds);
  const prev = useWindowEvents(wsId, period.prevWindow, sharedCategoryIds);
  const fut = useWindowEvents(wsId, future.window, sharedCategoryIds);
  const { tasks, isLoading: tasksLoading, isError: tasksError } = useTasks(wsId);

  const viewerId = workspace.data?.currentMember?.id ?? "";

  // Insights-local filters (independent of the calendar's sidebar filters),
  // remembered per viewer per device.
  const {
    memberFilter,
    hiddenCategoryIds,
    includeInactive,
    setMemberFilter,
    setHiddenCategoryIds,
    setIncludeInactive,
  } = useInsightsFilters(viewerId || undefined);

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
  const futureOccurrences = useMemo(
    () => filterForInsights(fut.occurrences, filterArgs),
    [fut.occurrences, filterArgs],
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
    rawOccurrences: cur.occurrences,
    futureOccurrences,
    futureWindow: future.window,
    futureDays: future.days,
    futureLoading: fut.isLoading,
    tasks,
    categories: categoryMap,
    members: memberMap,
    boards: workspace.data?.boards ?? [],
    workspaceId: wsId ?? "",
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

  // Saved views: the slice on screen as a config, and applying one routed
  // through the SAME setters the toolbar/filters use — no new state paths.
  const currentViewConfig: SavedViewConfig = {
    preset: state.preset,
    ...(state.preset === "custom" && state.customFrom != null
      ? { customFrom: state.customFrom }
      : {}),
    ...(state.preset === "custom" && state.customTo != null
      ? { customTo: state.customTo }
      : {}),
    granularity: state.granularity,
    member: memberFilter,
    hiddenCategoryIds: [...hiddenCategoryIds],
    includeInactive,
  };
  function applyView(config: SavedViewConfig) {
    setMemberFilter(config.member);
    setHiddenCategoryIds(new Set(config.hiddenCategoryIds));
    setIncludeInactive(config.includeInactive);
    changePeriod({
      preset: config.preset,
      granularity: config.granularity,
      ...(config.customFrom != null ? { customFrom: config.customFrom } : {}),
      ...(config.customTo != null ? { customTo: config.customTo } : {}),
    });
  }

  const loading =
    workspace.isLoading || cur.isLoading || prev.isLoading || tasksLoading;
  const error = workspace.isError || cur.isError || prev.isError || tasksError;
  const refreshing = cur.isFetching && !cur.isLoading;
  const qc = useQueryClient();

  return (
    // SurfaceChrome (the (surfaces) layout) owns the h-dvh frame + header; the
    // shell fills the content area below it.
    <div className="flex h-full flex-col">
      <InsightsToolbar
        state={state}
        period={period}
        timeZone={timeZone}
        onPeriodChange={changePeriod}
        onGranularityChange={changeGranularity}
        currentMember={workspace.data?.currentMember ?? null}
        viewsSlot={
          wsId && viewerId ? (
            <SavedViewsMenu
              workspaceId={wsId}
              memberId={viewerId}
              current={currentViewConfig}
              onApply={applyView}
            />
          ) : undefined
        }
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
            filtersInert={tab === "sleep"}
          />
        }
      />

      <Tabs value={tab} onValueChange={(v) => changeTab(v as InsightsTab)}>
        <div className="overflow-x-auto border-b px-3 sm:px-4">
          {/* h override must mirror the base's group-data variant to out-cascade its h-8 */}
          <TabsList className="w-max bg-transparent p-0 group-data-horizontal/tabs:h-11 sm:group-data-horizontal/tabs:h-10">
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
          <div className="mx-auto w-full max-w-5xl p-3 sm:p-4">
            <InsightsTabSkeleton />
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
            {tab === "sleep" && <SleepTab data={data} />}
          </div>
        )}
      </main>
    </div>
  );
}
