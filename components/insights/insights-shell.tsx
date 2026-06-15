"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import dynamic from "next/dynamic";
import { m } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { tween } from "@/lib/motion";
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
  type PeriodPreset,
  type PeriodState,
} from "@/lib/insights/period";
import { filterForInsights, type MemberFilter } from "@/lib/insights/filters";
import { useInsightsFilters } from "@/lib/hooks/use-insights-filters";
import { useInsightsCustomizationRealtime } from "@/lib/hooks/use-insights-prefs";
import type { SavedViewConfig } from "@/lib/insights/views";
import { dateKeyInZone } from "@/lib/datetime/local";
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

// Session-level gate for the content crossfade (mirrors components/crossfade.tsx):
// flipped true after the first insights content paints, so the very first paint
// never animates (animating the initial load would be a page-load sequence, which
// the product bans). Reading a module flag during render is pure-enough and is the
// same pattern Crossfade uses; a ref read during render is disallowed by lint.
let insightsPainted = false;

// Each tab is its own lazy chunk (recharts stays out of the route JS); warmed
// during idle so switching tabs never shows the skeleton in practice. After
// the 7→5 consolidation the former Balance and Optimize bodies render inside
// Patterns and Overview respectively (they fold into those chunks), and the
// private Sleep tab backs the "sleep" view.
const tabLoading = () => <ChartSkeleton height={360} className="mt-1" />;
const loadOverview = () => import("./overview-tab").then((m) => m.OverviewTab);
const loadTrends = () => import("./trends-tab").then((m) => m.TrendsTab);
const loadPatterns = () => import("./patterns-tab").then((m) => m.PatternsTab);
const loadTasksTab = () => import("./tasks-tab").then((m) => m.TasksTab);
const loadSleep = () => import("./sleep-tab").then((m) => m.SleepTab);
const OverviewTab = dynamic(loadOverview, { ssr: false, loading: tabLoading });
const TrendsTab = dynamic(loadTrends, { ssr: false, loading: tabLoading });
const PatternsTab = dynamic(loadPatterns, { ssr: false, loading: tabLoading });
const TasksTab = dynamic(loadTasksTab, { ssr: false, loading: tabLoading });
const SleepTab = dynamic(loadSleep, { ssr: false, loading: tabLoading });

const TAB_PRELOADS = [loadOverview, loadTrends, loadPatterns, loadTasksTab, loadSleep];

/** Everything a tab needs, computed once in the shell. */
export interface InsightsTabData {
  period: ReturnType<typeof resolvePeriod>;
  /** the active preset — lets ledes name the comparison unit (week/month/
   *  period) to match resolvePeriod's previous-window semantics */
  preset: PeriodPreset;
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
  collections: { id: string; name: string }[];
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
  const t = useTranslations("insights");
  const locale = useLocale();
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

  // Enter-only crossfade on tab / period change (the keyed content remounts and
  // fades in). The session-level `insightsPainted` flag (module scope) gates the
  // FIRST content paint so the initial load never animates; it flips in an effect
  // (not during render) and is read during render like Crossfade's `navigated`.
  // Reduced motion is dropped globally by <MotionConfig reducedMotion="user">.
  useEffect(() => {
    insightsPainted = true;
  }, []);

  const workspace = useWorkspace();
  const wsId = workspace.data?.workspaceId;
  useWorkspaceRealtime(wsId);
  // One channel for goals/views/prefs — the customization data hooks are
  // channel-free on purpose (see use-insights-prefs.ts).
  useInsightsCustomizationRealtime(wsId, workspace.data?.currentMember?.id);

  // "now" anchors the relative presets. Captured at mount and refreshed on
  // every period change (event handlers may be impure; render must stay pure).
  const [now, setNow] = useState(() => Date.now());
  // Localized preset labels for `period.label` — resolved once and threaded
  // into resolvePeriod so the label ("На этой неделе · 8 – 14 июн. 2026") is
  // localized everywhere it flows (every tab's aria/captions, the digest, the
  // period selector). Keys mirror "insights.period.*".
  const presetLabels = useMemo(
    () => ({
      "this-week": t("period.thisWeek"),
      "last-week": t("period.lastWeek"),
      "this-month": t("period.thisMonth"),
      "last-7d": t("period.last7d"),
      "last-30d": t("period.last30d"),
      "last-90d": t("period.last90d"),
    }),
    [t],
  );
  const period = useMemo(
    () => resolvePeriod(state, { timeZone, now, locale, presetLabels }),
    [state, timeZone, now, locale, presetLabels],
  );

  // Roll "now" forward when the local date changes (tab left open overnight),
  // so "today" — the Sleep check-in, relative presets — stays honest. The
  // callbacks only set state on an actual rollover, so queries don't churn.
  useEffect(() => {
    const check = () =>
      setNow((prev) => {
        const t = Date.now();
        return dateKeyInZone(t, timeZone) === dateKeyInZone(prev, timeZone)
          ? prev
          : t;
      });
    const id = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, [timeZone]);

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
    preset: state.preset,
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
    collections: workspace.data?.collections ?? [],
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
    // Sleep reads better as a trailing window than the calendar week (which
    // includes empty future days), so entering it from the untouched default
    // flips to "Last 7 days". A deliberate range (anything but this-week) is
    // preserved, and the selector stays usable on Sleep.
    let nextState = state;
    if (t === "sleep" && state.preset === "this-week") {
      nextState = { ...state, preset: "last-7d" };
      setNow(Date.now());
      setState(nextState);
    }
    pushUrl(nextState, t);
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
        {/* Border is full-bleed; the tab row aligns to the same centered
            1600px column as the content below it. */}
        <div className="border-b">
          <div className="mx-auto w-full max-w-[1600px] px-3 sm:px-4 xl:px-6">
            {/* 5 tabs fit a phone row, so they spread full-width (flex-1) on
                mobile instead of horizontal-scrolling; left-aligned at natural
                width from sm up. h override mirrors the base's group-data
                variant to out-cascade its h-8. */}
            <TabsList className="w-full bg-transparent p-0 group-data-horizontal/tabs:h-11 sm:w-max sm:group-data-horizontal/tabs:h-10">
              {INSIGHTS_TABS.map((tabId) => (
                <TabsTrigger
                  key={tabId}
                  value={tabId}
                  className="flex-1 rounded-none border-0 border-b-2 border-transparent px-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:flex-none sm:px-3 sm:text-sm"
                >
                  {t(`tabs.${tabId}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>
      </Tabs>

      {period.clamped && (
        <p className="border-b bg-muted/50 py-1.5 text-xs text-muted-foreground">
          <span className="mx-auto block w-full max-w-[1600px] px-4 xl:px-6">
            {t("shell.clamped")}
          </span>
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
          <div className="mx-auto w-full max-w-[1600px] p-3 sm:p-4 xl:px-6">
            <InsightsTabSkeleton />
          </div>
        ) : (
          <m.div
            key={`${tab}:${period.label}`}
            initial={insightsPainted ? { opacity: 0 } : false}
            animate={{ opacity: 1, transition: tween }}
            className="mx-auto w-full max-w-[1600px] p-3 sm:p-4 xl:px-6"
          >
            <h2 className="sr-only">{period.label}</h2>
            {tab === "overview" && <OverviewTab data={data} />}
            {tab === "trends" && <TrendsTab data={data} />}
            {tab === "patterns" && <PatternsTab data={data} />}
            {tab === "tasks" && <TasksTab data={data} />}
            {tab === "sleep" && <SleepTab data={data} />}
          </m.div>
        )}
      </main>
    </div>
  );
}
