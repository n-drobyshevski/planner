"use client";

import { useMemo, useState } from "react";
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
import { CalendarToolbar } from "./calendar-toolbar";
import { CalendarCanvas } from "./calendar-canvas";
import { CalendarSidebar } from "@/components/sidebar/calendar-sidebar";
import { EventDialog } from "@/components/event/event-dialog";
import { TaskBacklogRail } from "@/components/tasks/task-backlog-rail";
import { ScheduleTaskDialog } from "@/components/tasks/schedule-task-dialog";
import {
  RecurrenceScopePrompt,
  type RecurrenceScope,
} from "@/components/event/recurrence-scope-prompt";
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

export function CalendarShell({
  initialView,
  initialDate,
}: {
  initialView: CalendarView;
  initialDate: number;
}) {
  const router = useRouter();
  const [view, setView] = useState<CalendarView>(initialView);
  const [focusedDate, setFocusedDate] = useState<number>(initialDate);

  const workspace = useWorkspace();
  const win = useMemo(() => getWindow(view, focusedDate), [view, focusedDate]);
  const { occurrences, events, isLoading: eventsLoading, isError: eventsError } =
    useWindowEvents(workspace.data?.workspaceId, win);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pendingReschedule, setPendingReschedule] = useState<PendingReschedule | null>(null);
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

  const days = useMemo(() => getVisibleDays(view, focusedDate), [view, focusedDate]);
  const label = formatRangeLabel(view, focusedDate);

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
        backlogOpen={backlogOpen}
        workspace={workspace.data ?? null}
      />
      <div className="flex min-h-0 flex-1">
        {sidebarOpen && workspace.data && (
          <CalendarSidebar
            workspaceId={workspace.data.workspaceId}
            members={workspace.data.members}
            categories={workspace.data.categories}
          />
        )}
        <main className="min-h-0 flex-1 overflow-hidden">
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
          taskDoneById={taskDoneById}
          onToggleTaskDone={onToggleTaskDone}
          onScheduleTask={onScheduleTask}
          loading={workspace.isLoading || eventsLoading}
          error={workspace.isError || eventsError}
          />
        </main>
        {backlogOpen && workspace.data && (
          <TaskBacklogRail
            tasks={backlogTasks}
            colorOf={taskColorOf}
            members={memberMap}
            onSchedule={(t) => setScheduling(t)}
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
    </div>
  );
}
