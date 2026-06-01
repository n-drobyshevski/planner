"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { startOfDay } from "date-fns";
import { getWindow, getVisibleDays, navigate } from "@/lib/datetime/window";
import { formatRangeLabel, toDateParam } from "@/lib/datetime/format";
import { filterVisible } from "@/lib/scope/visibility";
import { resolveOccurrenceColor } from "@/lib/calendar/colors";
import {
  contextOccurrences,
  enclosingContext,
  contextIdForRange,
} from "@/lib/calendar/contexts";
import { resolveTaskColor } from "@/lib/tasks/colors";
import { groupByParent } from "@/lib/tasks/tree";
import { localTimeZone } from "@/lib/datetime/local";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import { useWindowEvents, useWorkspaceRealtime } from "@/lib/hooks/use-window-events";
import { useEventMutations } from "@/lib/hooks/use-event-mutations";
import { useTasks } from "@/lib/hooks/use-tasks";
import { useTaskMutations } from "@/lib/hooks/use-task-mutations";
import { qk } from "@/lib/supabase/query-keys";
import type { WindowData } from "@/lib/supabase/queries";
import { useUiStore } from "@/stores/ui-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { CalendarToolbar } from "./calendar-toolbar";
import { CalendarCanvas } from "./calendar-canvas";
import { CalendarPager, type CalendarPagerHandle } from "./calendar-pager";
import { CalendarSidebar } from "@/components/sidebar/calendar-sidebar";
import { CalendarFiltersSheet } from "@/components/sidebar/calendar-filters-sheet";
import { EventDialog } from "@/components/event/event-dialog";
import { TaskBacklogRail, TaskBacklogSheet } from "@/components/tasks/task-backlog-rail";
import { ScheduleTaskDialog } from "@/components/tasks/schedule-task-dialog";
import {
  RecurrenceScopePrompt,
  type RecurrenceScope,
} from "@/components/event/recurrence-scope-prompt";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { CalendarView, EventRow, Occurrence, TaskRow } from "@/lib/types";

type EditorState =
  | {
      mode: "create";
      defaultStart: number;
      defaultEnd: number;
      defaultContextId: string | null;
    }
  | { mode: "edit"; event: EventRow; occurrence: Occurrence };

interface PendingReschedule {
  event: EventRow;
  occurrence: Occurrence;
  start: number;
  end: number;
}

interface PendingDelete {
  event: EventRow;
  occurrence: Occurrence;
}

// Neighbour (prev/next) carousel panes are display-only: no selection, no
// editing, no drag — those all act on the focused window via the centre pane.
const NOOP = () => {};
const DISPLAY_ONLY = {
  selectedKey: null,
  onSelect: NOOP,
  onPickDay: NOOP,
  onCreateRange: NOOP,
  onReschedule: NOOP,
  onChangeColor: NOOP,
  onDeleteEvent: NOOP,
  onToggleTaskDone: NOOP,
  onScheduleTask: NOOP,
} as const;

export function CalendarShell({
  initialView,
  initialDate,
  viewFromUrl,
}: {
  initialView: CalendarView;
  initialDate: number;
  viewFromUrl: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<CalendarView>(initialView);
  const [focusedDate, setFocusedDate] = useState<number>(initialDate);
  const isMobile = useIsMobile();
  const autoMobileApplied = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const workspace = useWorkspace();
  const wsId = workspace.data?.workspaceId;
  useWorkspaceRealtime(wsId);

  // Three windows for the swipe carousel: the focused period plus its
  // neighbours. Fetching all three keeps them cached so paging is instant and
  // the neighbour panes have content to slide in. React Query dedupes by
  // window, so after the first load each page only fetches one new edge.
  const prevFocus = useMemo(() => navigate(view, focusedDate, -1), [view, focusedDate]);
  const nextFocus = useMemo(() => navigate(view, focusedDate, 1), [view, focusedDate]);
  const win = useMemo(() => getWindow(view, focusedDate), [view, focusedDate]);
  const winPrev = useMemo(() => getWindow(view, prevFocus), [view, prevFocus]);
  const winNext = useMemo(() => getWindow(view, nextFocus), [view, nextFocus]);
  const { occurrences, events, isLoading: eventsLoading, isError: eventsError } =
    useWindowEvents(wsId, win);
  const prevWin = useWindowEvents(wsId, winPrev);
  const nextWin = useWindowEvents(wsId, winNext);
  const pagerRef = useRef<CalendarPagerHandle>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pendingReschedule, setPendingReschedule] = useState<PendingReschedule | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deletingContext, setDeletingContext] = useState<EventRow | null>(null);
  const mutations = useEventMutations(workspace.data?.workspaceId);
  const qc = useQueryClient();

  const selectedKey = useUiStore((s) => s.selectedEventKey);
  const setSelected = useUiStore((s) => s.setSelectedEventKey);
  const hiddenCategoryIds = useUiStore((s) => s.hiddenCategoryIds);
  const overlayMemberIds = useUiStore((s) => s.overlayMemberIds);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const backlogOpen = useUiStore((s) => s.taskBacklogOpen);
  const setBacklogOpen = useUiStore((s) => s.setTaskBacklogOpen);

  const viewerId = workspace.data?.currentMember?.id ?? "";
  // Only my own calendar is editable; overlaid members' items are read-only.
  const canEditOcc = useMemo(
    () => (o: Occurrence) => o.ownerId === viewerId,
    [viewerId],
  );
  const visible = useMemo(
    () => filterVisible(occurrences, { viewerId, overlayMemberIds, hiddenCategoryIds }),
    [occurrences, viewerId, overlayMemberIds, hiddenCategoryIds],
  );
  // Same visibility filter for the neighbour panes (display-only).
  const prevVisible = useMemo(
    () => filterVisible(prevWin.occurrences, { viewerId, overlayMemberIds, hiddenCategoryIds }),
    [prevWin.occurrences, viewerId, overlayMemberIds, hiddenCategoryIds],
  );
  const nextVisible = useMemo(
    () => filterVisible(nextWin.occurrences, { viewerId, overlayMemberIds, hiddenCategoryIds }),
    [nextWin.occurrences, viewerId, overlayMemberIds, hiddenCategoryIds],
  );

  const memberMap = useMemo(
    () => new Map((workspace.data?.members ?? []).map((m) => [m.id, m])),
    [workspace.data],
  );
  const categoryMap = useMemo(
    () => new Map((workspace.data?.categories ?? []).map((c) => [c.id, c])),
    [workspace.data],
  );
  const colorOf = useMemo(
    () => (o: Occurrence) => resolveOccurrenceColor(o, categoryMap, memberMap),
    [categoryMap, memberMap],
  );
  // Context backdrops (expanded occurrences) for create-inside / move re-eval,
  // and the master list of contexts for the dialog's "Context" selector.
  const contextOccs = useMemo(() => contextOccurrences(occurrences), [occurrences]);
  const contextList = useMemo(
    () => events.filter((e) => e.kind === "context").map((e) => ({ id: e.id, title: e.title })),
    [events],
  );
  const taskColorOf = (t: TaskRow) => resolveTaskColor(t, categoryMap, memberMap);

  // --- Tasks (for calendar blocks + backlog rail) ---
  const { tasks } = useTasks(workspace.data?.workspaceId);
  const taskMutations = useTaskMutations(workspace.data?.workspaceId);
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const taskDoneById = useMemo(
    () => new Map(tasks.map((t) => [t.id, t.status === "done"])),
    [tasks],
  );
  const childrenByParent = useMemo(() => groupByParent(tasks), [tasks]);
  // The backlog rail is for scheduling your OWN tasks; others' tasks (now
  // returned by RLS as non-private) aren't schedulable from here.
  const backlogTasks = (childrenByParent.get(null) ?? []).filter(
    (t) => t.status !== "done" && t.ownerId === viewerId,
  );
  const [scheduling, setScheduling] = useState<TaskRow | null>(null);
  const [deletingTask, setDeletingTask] = useState<TaskRow | null>(null);

  function onToggleTaskDone(taskId: string) {
    const t = tasksById.get(taskId);
    // Only complete your own tasks; others' calendars are read-only.
    if (t && t.ownerId === viewerId) void taskMutations.toggleDone(t);
  }
  function onScheduleTask(taskId: string, start: number, end: number) {
    const t = tasksById.get(taskId);
    if (t) void taskMutations.schedule(t, [{ start, end }], localTimeZone());
  }

  function pushUrl(v: CalendarView, ms: number) {
    router.replace(`/calendar?view=${v}&date=${toDateParam(ms)}`, { scroll: false });
  }
  function changeView(v: CalendarView) {
    setView(v);
    pushUrl(v, focusedDate);
  }
  function go(dir: -1 | 1) {
    const next = navigate(view, focusedDate, dir);
    setFocusedDate(next);
    pushUrl(view, next);
  }
  function goToday() {
    const t = startOfDay(new Date()).getTime();
    setFocusedDate(t);
    pushUrl(view, t);
  }
  function pickDay(ms: number) {
    setView("day");
    setFocusedDate(ms);
    pushUrl("day", ms);
  }
  function openNew() {
    const s = focusedDate + 9 * 3_600_000; // 9am on the focused day
    setEditor({
      mode: "create",
      defaultStart: s,
      defaultEnd: s + 3_600_000,
      defaultContextId: null,
    });
  }
  function openEdit(occ: Occurrence) {
    const ev = events.find((e) => e.id === occ.eventId);
    if (!ev) return;
    setSelected(occ.key);
    setEditor({ mode: "edit", event: ev, occurrence: occ });
  }
  function onCreateRange(start: number, end: number) {
    // Drawing inside a context auto-assigns the new event to it.
    const ctx = enclosingContext(contextOccs, start);
    setEditor({
      mode: "create",
      defaultStart: start,
      defaultEnd: end,
      defaultContextId: ctx?.eventId ?? null,
    });
  }
  function onAssignContext(occ: Occurrence, contextId: string) {
    if (!canEditOcc(occ)) return;
    void mutations.assignContext(occ.eventId, contextId);
  }
  function onRemoveContext(occ: Occurrence) {
    if (!canEditOcc(occ)) return;
    void mutations.removeContext(occ.eventId);
  }
  /** Recolor an event (series-level: writes the master row's color). */
  function onChangeEventColor(occ: Occurrence, color: string | null) {
    if (!canEditOcc(occ)) return;
    const ev = events.find((e) => e.id === occ.eventId);
    if (ev) void mutations.updateSingle(ev.id, { color });
  }
  function onDeleteEvent(occ: Occurrence) {
    if (!canEditOcc(occ)) return;
    const ev = events.find((e) => e.id === occ.eventId);
    if (!ev) return;
    if (ev.rrule) setPendingDelete({ event: ev, occurrence: occ });
    else if (ev.kind === "context") setDeletingContext(ev);
    else void mutations.remove(ev.id);
  }
  function onDeleteScope(scope: RecurrenceScope) {
    const p = pendingDelete;
    setPendingDelete(null);
    if (!p) return;
    if (scope === "this") {
      void mutations.deleteThis(p.event, p.occurrence.occurrenceDate);
    } else if (scope === "future") {
      void mutations.deleteFuture(p.event, p.occurrence.occurrenceDate);
    } else {
      void mutations.deleteAll(p.event.id);
    }
  }
  /** Optimistically patch a single event's time in the current window cache. */
  function optimisticMove(eventId: string, start: number, end: number) {
    const wsId = workspace.data?.workspaceId;
    if (!wsId) return;
    qc.setQueryData<WindowData>(qk.window(wsId, win.start, win.end), (old) =>
      old
        ? { ...old, events: old.events.map((e) => (e.id === eventId ? { ...e, start, end } : e)) }
        : old,
    );
  }
  function onReschedule(occ: Occurrence, start: number, end: number) {
    if (!canEditOcc(occ)) return;
    const ev = events.find((e) => e.id === occ.eventId);
    if (!ev) return;
    if (!ev.rrule) {
      optimisticMove(ev.id, start, end);
      // Re-derive context membership from overlap on every move (backdrop model).
      // Contexts themselves never get a context_id; recurring events skip this.
      if (ev.kind === "context") {
        void mutations.updateSingle(ev.id, { start, end });
      } else {
        void mutations.updateSingle(ev.id, {
          start,
          end,
          contextId: contextIdForRange(contextOccs, start),
        });
      }
    } else {
      setPendingReschedule({ event: ev, occurrence: occ, start, end });
    }
  }
  function onRescheduleScope(scope: RecurrenceScope) {
    const p = pendingReschedule;
    setPendingReschedule(null);
    if (!p) return;
    const patch = { start: p.start, end: p.end };
    // Re-derive context by overlap (series-level). "this" only moves a single
    // occurrence, so it leaves series membership alone (it still nests visually);
    // "future"/"all" re-file the affected series. Contexts never get a context_id.
    const ctxId =
      p.event.kind === "context" ? undefined : contextIdForRange(contextOccs, p.start);
    if (scope === "this") {
      void mutations.editThis(p.event, p.occurrence.occurrenceDate, patch);
    } else if (scope === "future") {
      void mutations.editFuture(p.event, p.occurrence.occurrenceDate, patch, ctxId);
    } else {
      const delta = p.start - p.occurrence.start;
      void mutations.updateSingle(p.event.id, {
        start: p.event.start + delta,
        end: p.event.end + delta,
        ...(ctxId === undefined ? {} : { contextId: ctxId }),
      });
    }
  }

  useEffect(() => setMounted(true), []);

  const days = useMemo(() => getVisibleDays(view, focusedDate), [view, focusedDate]);
  const prevDays = useMemo(() => getVisibleDays(view, prevFocus), [view, prevFocus]);
  const nextDays = useMemo(() => getVisibleDays(view, nextFocus), [view, nextFocus]);
  const label = formatRangeLabel(view, focusedDate);

  // Swipe left/right to page the period via the carousel; in the time-grid
  // views (day/week/3day) a gesture that begins on an event block is left alone
  // so long-press-dragging an event between days never doubles as a page turn.
  const timeGridView = view === "day" || view === "week" || view === "3day";
  // Prev/Next animate through the carousel too; fall back to an instant jump if
  // it isn't mounted yet.
  function page(dir: -1 | 1) {
    if (pagerRef.current) pagerRef.current.page(dir);
    else go(dir);
  }

  // On a phone, the dense grids are hard to scan — default to the Agenda list
  // on first load, but only when the URL didn't already pin a view. Applied
  // once (ref-guarded) so a later manual switch isn't clobbered. Done during
  // render — React's "adjust state on changed input" pattern, mirroring
  // task-board's resync — rather than in an effect, to avoid a cascading
  // set-state-in-effect. Kept after every hook so the conditional setState
  // never sits above a hook call (rules-of-hooks). `useIsMobile` is false until
  // mounted, so SSR renders the URL/default view and a real phone flips right
  // after; the `mounted` gate on the canvas hides that first frame.
  if (mounted && !autoMobileApplied.current && !viewFromUrl && isMobile) {
    autoMobileApplied.current = true;
    setView("agenda");
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <CalendarToolbar
        view={view}
        label={label}
        onPrev={() => page(-1)}
        onNext={() => page(1)}
        onToday={goToday}
        onViewChange={changeView}
        onNewEvent={openNew}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onToggleBacklog={() => setBacklogOpen(!backlogOpen)}
        onOpenFilters={() => setFiltersOpen(true)}
        backlogOpen={backlogOpen}
        workspace={workspace.data ?? null}
      />
      <div className="flex min-h-0 flex-1">
        {sidebarOpen && workspace.data && (
          <CalendarSidebar
            workspaceId={workspace.data.workspaceId}
            currentMemberId={viewerId}
            members={workspace.data.members}
            categories={workspace.data.categories}
          />
        )}
        <main className="min-h-0 flex-1 overflow-hidden">
          {mounted ? (
            <CalendarPager
              ref={pagerRef}
              onCommit={go}
              ignoreSelector={timeGridView ? "[data-occ-key]" : undefined}
              prev={
                <CalendarCanvas
                  view={view}
                  days={prevDays}
                  occurrences={prevVisible}
                  focusedMs={prevFocus}
                  colorOf={colorOf}
                  canEdit={canEditOcc}
                  taskDoneById={taskDoneById}
                  {...DISPLAY_ONLY}
                  loading={workspace.isLoading || prevWin.isLoading}
                  error={workspace.isError || prevWin.isError}
                />
              }
              next={
                <CalendarCanvas
                  view={view}
                  days={nextDays}
                  occurrences={nextVisible}
                  focusedMs={nextFocus}
                  colorOf={colorOf}
                  canEdit={canEditOcc}
                  taskDoneById={taskDoneById}
                  {...DISPLAY_ONLY}
                  loading={workspace.isLoading || nextWin.isLoading}
                  error={workspace.isError || nextWin.isError}
                />
              }
            >
              <CalendarCanvas
                view={view}
                days={days}
                occurrences={visible}
                focusedMs={focusedDate}
                colorOf={colorOf}
                selectedKey={selectedKey}
                onSelect={openEdit}
                onPickDay={pickDay}
                onCreateRange={onCreateRange}
                onReschedule={onReschedule}
                onChangeColor={onChangeEventColor}
                onDeleteEvent={onDeleteEvent}
                onAssignContext={onAssignContext}
                onRemoveContext={onRemoveContext}
                canEdit={canEditOcc}
                taskDoneById={taskDoneById}
                onToggleTaskDone={onToggleTaskDone}
                onScheduleTask={onScheduleTask}
                loading={workspace.isLoading || eventsLoading}
                error={workspace.isError || eventsError}
              />
            </CalendarPager>
          ) : (
            <div className="h-full" />
          )}
        </main>
        {backlogOpen && workspace.data && (
          <TaskBacklogRail
            userKey={viewerId}
            tasks={backlogTasks}
            colorOf={taskColorOf}
            members={memberMap}
            onSchedule={(t) => setScheduling(t)}
            onToggleDone={(t) => void taskMutations.toggleDone(t)}
            onChangeColor={(t, c) => void taskMutations.update(t.id, { color: c })}
            onDelete={(t) => setDeletingTask(t)}
          />
        )}
      </div>

      {editor && workspace.data?.currentMember && (
        <EventDialog
          open
          onOpenChange={(o) => {
            if (!o) setEditor(null);
          }}
          mode={editor.mode}
          workspaceId={workspace.data.workspaceId}
          currentMemberId={workspace.data.currentMember.id}
          categories={workspace.data.categories}
          contexts={contextList}
          event={editor.mode === "edit" ? editor.event : null}
          occurrence={editor.mode === "edit" ? editor.occurrence : null}
          defaultStart={editor.mode === "create" ? editor.defaultStart : undefined}
          defaultEnd={editor.mode === "create" ? editor.defaultEnd : undefined}
          defaultContextId={editor.mode === "create" ? editor.defaultContextId : undefined}
          readOnly={editor.mode === "edit" && editor.event.ownerId !== viewerId}
          ownerName={
            editor.mode === "edit"
              ? memberMap.get(editor.event.ownerId)?.name
              : undefined
          }
        />
      )}

      <RecurrenceScopePrompt
        open={pendingReschedule !== null}
        onOpenChange={(o) => !o && setPendingReschedule(null)}
        mode="edit"
        onChoose={onRescheduleScope}
      />

      <RecurrenceScopePrompt
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        mode="delete"
        onChoose={onDeleteScope}
      />

      {scheduling && workspace.data && (
        <ScheduleTaskDialog
          open
          onOpenChange={(o) => !o && setScheduling(null)}
          task={scheduling}
          subtasks={childrenByParent.get(scheduling.id) ?? []}
          workspaceId={workspace.data.workspaceId}
          defaultStartMs={focusedDate + 9 * 3_600_000}
        />
      )}

      {workspace.data && (
        <CalendarFiltersSheet
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          workspaceId={workspace.data.workspaceId}
          currentMemberId={viewerId}
          members={workspace.data.members}
          categories={workspace.data.categories}
        />
      )}

      {workspace.data && (
        <TaskBacklogSheet
          open={isMobile && backlogOpen}
          onOpenChange={setBacklogOpen}
          tasks={backlogTasks}
          colorOf={taskColorOf}
          members={memberMap}
          onSchedule={(t) => {
            setScheduling(t);
            setBacklogOpen(false);
          }}
          onToggleDone={(t) => void taskMutations.toggleDone(t)}
          onChangeColor={(t, c) => void taskMutations.update(t.id, { color: c })}
          onDelete={(t) => setDeletingTask(t)}
        />
      )}

      <AlertDialog
        open={deletingContext !== null}
        onOpenChange={(o) => !o && setDeletingContext(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this context?</AlertDialogTitle>
            <AlertDialogDescription>
              The events inside it stay on your calendar — only the time-block
              grouping is removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingContext) void mutations.remove(deletingContext.id);
                setDeletingContext(null);
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deletingTask !== null}
        onOpenChange={(o) => !o && setDeletingTask(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the task, its subtasks, and any blocks it placed on the
              calendar. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingTask) void taskMutations.remove(deletingTask.id);
                setDeletingTask(null);
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
