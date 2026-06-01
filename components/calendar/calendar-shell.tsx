"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { startOfDay } from "date-fns";
import { getWindow, getVisibleDays, navigate } from "@/lib/datetime/window";
import { formatRangeLabel, toDateParam } from "@/lib/datetime/format";
import { filterVisible } from "@/lib/scope/visibility";
import { resolveOccurrenceColor } from "@/lib/calendar/colors";
import { resolveTaskColor } from "@/lib/tasks/colors";
import { groupByParent } from "@/lib/tasks/tree";
import { localTimeZone } from "@/lib/datetime/local";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import { useWindowEvents } from "@/lib/hooks/use-window-events";
import { useEventMutations } from "@/lib/hooks/use-event-mutations";
import { useTasks } from "@/lib/hooks/use-tasks";
import { useTaskMutations } from "@/lib/hooks/use-task-mutations";
import { qk } from "@/lib/supabase/query-keys";
import type { WindowData } from "@/lib/supabase/queries";
import { useUiStore } from "@/stores/ui-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSwipe } from "@/hooks/use-swipe";
import { CalendarToolbar } from "./calendar-toolbar";
import { CalendarCanvas } from "./calendar-canvas";
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
  | { mode: "create"; defaultStart: number; defaultEnd: number }
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
  const win = useMemo(() => getWindow(view, focusedDate), [view, focusedDate]);
  const { occurrences, events, isLoading: eventsLoading, isError: eventsError } =
    useWindowEvents(workspace.data?.workspaceId, win);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pendingReschedule, setPendingReschedule] = useState<PendingReschedule | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const mutations = useEventMutations(workspace.data?.workspaceId);
  const qc = useQueryClient();

  const selectedKey = useUiStore((s) => s.selectedEventKey);
  const setSelected = useUiStore((s) => s.setSelectedEventKey);
  const hiddenCategoryIds = useUiStore((s) => s.hiddenCategoryIds);
  const hiddenLayers = useUiStore((s) => s.hiddenLayers);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const backlogOpen = useUiStore((s) => s.taskBacklogOpen);
  const setBacklogOpen = useUiStore((s) => s.setTaskBacklogOpen);

  const viewerId = workspace.data?.currentMember?.id ?? "";
  const visible = useMemo(
    () => filterVisible(occurrences, { viewerId, hiddenCategoryIds, hiddenLayers }),
    [occurrences, viewerId, hiddenCategoryIds, hiddenLayers],
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
  const backlogTasks = (childrenByParent.get(null) ?? []).filter(
    (t) => t.status !== "done",
  );
  const [scheduling, setScheduling] = useState<TaskRow | null>(null);
  const [deletingTask, setDeletingTask] = useState<TaskRow | null>(null);

  function onToggleTaskDone(taskId: string) {
    const t = tasksById.get(taskId);
    if (t) void taskMutations.toggleDone(t);
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
    setEditor({ mode: "create", defaultStart: s, defaultEnd: s + 3_600_000 });
  }
  function openEdit(occ: Occurrence) {
    const ev = events.find((e) => e.id === occ.eventId);
    if (!ev) return;
    setSelected(occ.key);
    setEditor({ mode: "edit", event: ev, occurrence: occ });
  }
  function onCreateRange(start: number, end: number) {
    setEditor({ mode: "create", defaultStart: start, defaultEnd: end });
  }
  /** Recolor an event (series-level: writes the master row's color). */
  function onChangeEventColor(occ: Occurrence, color: string | null) {
    const ev = events.find((e) => e.id === occ.eventId);
    if (ev) void mutations.updateSingle(ev.id, { color });
  }
  function onDeleteEvent(occ: Occurrence) {
    const ev = events.find((e) => e.id === occ.eventId);
    if (!ev) return;
    if (ev.rrule) setPendingDelete({ event: ev, occurrence: occ });
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
    const ev = events.find((e) => e.id === occ.eventId);
    if (!ev) return;
    if (!ev.rrule) {
      optimisticMove(ev.id, start, end);
      void mutations.updateSingle(ev.id, { start, end });
    } else {
      setPendingReschedule({ event: ev, occurrence: occ, start, end });
    }
  }
  function onRescheduleScope(scope: RecurrenceScope) {
    const p = pendingReschedule;
    setPendingReschedule(null);
    if (!p) return;
    const patch = { start: p.start, end: p.end };
    if (scope === "this") {
      void mutations.editThis(p.event, p.occurrence.occurrenceDate, patch);
    } else if (scope === "future") {
      void mutations.editFuture(p.event, p.occurrence.occurrenceDate, patch);
    } else {
      const delta = p.start - p.occurrence.start;
      void mutations.updateSingle(p.event.id, {
        start: p.event.start + delta,
        end: p.event.end + delta,
      });
    }
  }

  useEffect(() => setMounted(true), []);

  const days = useMemo(() => getVisibleDays(view, focusedDate), [view, focusedDate]);
  const label = formatRangeLabel(view, focusedDate);

  // Swipe the canvas left/right to page the view — only on Agenda/Month, where
  // there's no horizontal/vertical-scroll conflict with the time grid.
  const swipe = useSwipe({
    enabled: mounted && (view === "agenda" || view === "month"),
    onSwipeLeft: () => go(1),
    onSwipeRight: () => go(-1),
  });

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
        onPrev={() => go(-1)}
        onNext={() => go(1)}
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
        <main className="min-h-0 flex-1 overflow-hidden" {...swipe}>
          {mounted ? (
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
          taskDoneById={taskDoneById}
          onToggleTaskDone={onToggleTaskDone}
          onScheduleTask={onScheduleTask}
          loading={workspace.isLoading || eventsLoading}
          error={workspace.isError || eventsError}
          />
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
          event={editor.mode === "edit" ? editor.event : null}
          occurrence={editor.mode === "edit" ? editor.occurrence : null}
          defaultStart={editor.mode === "create" ? editor.defaultStart : undefined}
          defaultEnd={editor.mode === "create" ? editor.defaultEnd : undefined}
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
