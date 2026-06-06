"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { startOfDay, getTime } from "date-fns";
import { tz } from "@date-fns/tz";
import { getWindow, getVisibleDays, navigate, defaultCreateDay } from "@/lib/datetime/window";
import { formatRangeLabel, toDateParam } from "@/lib/datetime/format";
import { TimezoneProvider } from "@/lib/datetime/timezone-context";
import { filterVisible, canEdit } from "@/lib/scope/visibility";
import { resolveOccurrenceColor } from "@/lib/calendar/colors";
import {
  contextOccurrences,
  enclosingContext,
} from "@/lib/calendar/contexts";
import { resolveTaskColor } from "@/lib/tasks/colors";
import { groupByParent } from "@/lib/tasks/tree";
import { localTimeZone, defaultStartOnDay } from "@/lib/datetime/local";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import { useWindowEvents, useWorkspaceRealtime } from "@/lib/hooks/use-window-events";
import { useEventMutations } from "@/lib/hooks/use-event-mutations";
import { useTasks } from "@/lib/hooks/use-tasks";
import { useTaskMutations } from "@/lib/hooks/use-task-mutations";
import { qk } from "@/lib/supabase/query-keys";
import { fetchWindow, type WindowData } from "@/lib/supabase/queries";
import type { EventInput } from "@/lib/supabase/mappers";
import { createClient } from "@/lib/supabase/client";
import { useUiStore } from "@/stores/ui-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTimelineZoomPersistence } from "@/hooks/use-timeline-zoom";
import { CalendarToolbar } from "./calendar-toolbar";
import { KeyboardShortcutsDialog } from "./keyboard-shortcuts-dialog";
import { CalendarCanvas } from "./calendar-canvas";
import { CalendarPager, type CalendarPagerHandle } from "./calendar-pager";
import { CalendarSidebar } from "@/components/sidebar/calendar-sidebar";
import { CalendarFiltersSheet } from "@/components/sidebar/calendar-filters-sheet";
import { Users, User, CopyPlus } from "lucide-react";
import { EventDialog } from "@/components/event/event-dialog";
import { EventDetails } from "@/components/event/event-details";
import type { ItemAction } from "@/components/shared/item-context-menu";
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
      defaultCategoryId: string | null;
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
const EMPTY_SET: Set<string> = new Set();
const DISPLAY_ONLY = {
  selectedKey: null,
  selectedKeys: EMPTY_SET,
  onSelect: NOOP,
  onToggleSelect: NOOP,
  onClearSelection: NOOP,
  onPickDay: NOOP,
  onCreateRange: NOOP,
  onCreateDay: NOOP,
  onReschedule: NOOP,
  onRescheduleMany: NOOP,
  onDuplicate: NOOP,
  onDuplicateMany: NOOP,
  onChangeColor: NOOP,
  onColorSelected: NOOP,
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const workspace = useWorkspace();
  const wsId = workspace.data?.workspaceId;
  useWorkspaceRealtime(wsId);

  // The viewer's chosen zone (null = follow device) is the single source of
  // truth for every window/day-boundary/label computation below, and is shared
  // with the calendar tree via TimezoneProvider for per-occurrence formatting.
  const viewerTimeZone = workspace.data?.currentMember?.timezone ?? localTimeZone();

  // Three windows for the swipe carousel: the focused period plus its
  // neighbours. Fetching all three keeps them cached so paging is instant and
  // the neighbour panes have content to slide in. React Query dedupes by
  // window, so after the first load each page only fetches one new edge.
  const prevFocus = useMemo(
    () => navigate(view, focusedDate, -1, { timeZone: viewerTimeZone }),
    [view, focusedDate, viewerTimeZone],
  );
  const nextFocus = useMemo(
    () => navigate(view, focusedDate, 1, { timeZone: viewerTimeZone }),
    [view, focusedDate, viewerTimeZone],
  );
  const win = useMemo(
    () => getWindow(view, focusedDate, { timeZone: viewerTimeZone }),
    [view, focusedDate, viewerTimeZone],
  );
  const winPrev = useMemo(
    () => getWindow(view, prevFocus, { timeZone: viewerTimeZone }),
    [view, prevFocus, viewerTimeZone],
  );
  const winNext = useMemo(
    () => getWindow(view, nextFocus, { timeZone: viewerTimeZone }),
    [view, nextFocus, viewerTimeZone],
  );
  // Ids of Shared contexts (categories with no owner). Events filed under one are
  // JOINT — both members see them without overlay and both may edit them. Drives
  // the derived `isShared` on every occurrence.
  const sharedCategoryIds = useMemo(
    () =>
      new Set(
        (workspace.data?.categories ?? [])
          .filter((c) => c.ownerId === null)
          .map((c) => c.id),
      ),
    [workspace.data],
  );
  const { occurrences, events, isLoading: eventsLoading, isError: eventsError } =
    useWindowEvents(wsId, win, sharedCategoryIds);
  const prevWin = useWindowEvents(wsId, winPrev, sharedCategoryIds);
  const nextWin = useWindowEvents(wsId, winNext, sharedCategoryIds);
  const pagerRef = useRef<CalendarPagerHandle>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [details, setDetails] = useState<{ event: EventRow; occurrence: Occurrence } | null>(null);
  const [pendingReschedule, setPendingReschedule] = useState<PendingReschedule | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [pendingCopy, setPendingCopy] = useState<{ event: EventRow; occurrence: Occurrence } | null>(null);
  const [deletingContext, setDeletingContext] = useState<EventRow | null>(null);
  const mutations = useEventMutations(workspace.data?.workspaceId);
  const qc = useQueryClient();

  // Warm the windows two steps out in each direction so a fast double-swipe
  // stays instant — the carousel already holds ±1, this prefetches ±2 so the
  // edge a second consecutive page needs is cached before the animation lands.
  useEffect(() => {
    if (!wsId) return;
    const sb = createClient();
    const farFocuses = [
      navigate(view, prevFocus, -1, { timeZone: viewerTimeZone }),
      navigate(view, nextFocus, 1, { timeZone: viewerTimeZone }),
    ];
    for (const focus of farFocuses) {
      const w = getWindow(view, focus, { timeZone: viewerTimeZone });
      void qc.prefetchQuery({
        queryKey: qk.window(wsId, w.start, w.end),
        queryFn: () => fetchWindow(sb, wsId, w),
      });
    }
  }, [wsId, view, prevFocus, nextFocus, viewerTimeZone, qc]);

  const selectedKey = useUiStore((s) => s.selectedEventKey);
  const setSelected = useUiStore((s) => s.setSelectedEventKey);
  const selectedKeys = useUiStore((s) => s.selectedEventKeys);
  const toggleSelected = useUiStore((s) => s.toggleSelectedEventKey);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const toggleMaskTitles = useUiStore((s) => s.toggleMaskTitles);
  const hiddenCategoryIds = useUiStore((s) => s.hiddenCategoryIds);
  const overlayMemberIds = useUiStore((s) => s.overlayMemberIds);
  const ownCalendarHidden = useUiStore((s) => s.ownCalendarHidden);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const backlogOpen = useUiStore((s) => s.taskBacklogOpen);
  const setBacklogOpen = useUiStore((s) => s.setTaskBacklogOpen);

  const viewerId = workspace.data?.currentMember?.id ?? "";
  // Month-view display preference (week/day always show inactive events).
  const showInactiveInMonth = workspace.data?.currentMember?.showInactiveInMonth ?? true;
  // Week/day display: how context blocks are labelled (top bar vs side label).
  const contextLabel = workspace.data?.currentMember?.contextLabel ?? "bar";
  // Partner's calendar overlaid: contexts split 4/5 by owner in the time grid.
  const twoCalendars = overlayMemberIds.size > 0;
  // My own items are editable, plus any JOINT item (filed under a Shared
  // context — both members co-edit); overlaid members' personal items are
  // read-only. Mirrors the widened events_write RLS.
  const canEditOcc = useMemo(
    () => (o: Occurrence) => canEdit(o, viewerId),
    [viewerId],
  );
  const visible = useMemo(
    () =>
      filterVisible(occurrences, {
        viewerId,
        overlayMemberIds,
        hiddenCategoryIds,
        selfHidden: ownCalendarHidden,
      }),
    [occurrences, viewerId, overlayMemberIds, hiddenCategoryIds, ownCalendarHidden],
  );
  // Same visibility filter for the neighbour panes (display-only).
  const prevVisible = useMemo(
    () =>
      filterVisible(prevWin.occurrences, {
        viewerId,
        overlayMemberIds,
        hiddenCategoryIds,
        selfHidden: ownCalendarHidden,
      }),
    [prevWin.occurrences, viewerId, overlayMemberIds, hiddenCategoryIds, ownCalendarHidden],
  );
  const nextVisible = useMemo(
    () =>
      filterVisible(nextWin.occurrences, {
        viewerId,
        overlayMemberIds,
        hiddenCategoryIds,
        selfHidden: ownCalendarHidden,
      }),
    [nextWin.occurrences, viewerId, overlayMemberIds, hiddenCategoryIds, ownCalendarHidden],
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
  // Context backdrops (expanded occurrences) for auto-assigning a Context when
  // an item is created inside one.
  const contextOccs = useMemo(() => contextOccurrences(occurrences), [occurrences]);
  // The Contexts (categories) the viewer can file an item under: shared ones and
  // their own. Drives the calendar's right-click "Assign to context" menu.
  const categoryChoices = useMemo(
    () =>
      (workspace.data?.categories ?? [])
        .filter((c) => c.ownerId === null || c.ownerId === viewerId)
        .map((c) => ({ id: c.id, name: c.name })),
    [workspace.data, viewerId],
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
    if (t) void taskMutations.schedule(t, [{ start, end }], viewerTimeZone);
  }

  function pushUrl(v: CalendarView, ms: number) {
    router.replace(`/calendar?view=${v}&date=${toDateParam(ms, viewerTimeZone)}`, {
      scroll: false,
    });
  }
  function changeView(v: CalendarView) {
    setView(v);
    pushUrl(v, focusedDate);
    clearSelection();
  }
  function go(dir: -1 | 1) {
    const next = navigate(view, focusedDate, dir, { timeZone: viewerTimeZone });
    setFocusedDate(next);
    pushUrl(view, next);
    // Occurrence keys are window-specific; drop the selection on navigation.
    clearSelection();
  }
  function goToday() {
    const t = getTime(startOfDay(Date.now(), { in: tz(viewerTimeZone) }));
    setFocusedDate(t);
    pushUrl(view, t);
    clearSelection();
  }
  function pickDay(ms: number) {
    setView("day");
    setFocusedDate(ms);
    pushUrl("day", ms);
    clearSelection();
  }
  function openNew() {
    // Default to the first day of the visible timeframe (1st of month / Monday
    // of the week / focused day), at the next 30-min slot if today else 9am.
    const s = defaultStartOnDay(
      defaultCreateDay(view, focusedDate, { timeZone: viewerTimeZone }),
      viewerTimeZone,
    );
    onCreateRange(s, s + 3_600_000);
  }
  function openEdit(occ: Occurrence) {
    const ev = events.find((e) => e.id === occ.eventId);
    if (!ev) return;
    setSelected(occ.key);
    setEditor({ mode: "edit", event: ev, occurrence: occ });
  }
  /** Click opens a read-only details panel; editing is one step further (its Edit button). */
  function openDetails(occ: Occurrence) {
    const ev = events.find((e) => e.id === occ.eventId);
    if (!ev) return;
    setSelected(occ.key);
    setDetails({ event: ev, occurrence: occ });
  }
  function onCreateRange(start: number, end: number) {
    // Drawing inside a context backdrop defaults the new item to that Context.
    const ctx = enclosingContext(contextOccs, start);
    setEditor({
      mode: "create",
      defaultStart: start,
      defaultEnd: end,
      defaultCategoryId: ctx?.categoryId ?? null,
    });
  }
  /** Month-view empty-cell create: default time on the clicked day, 1h long. */
  function createOnDay(dayMs: number) {
    const s = defaultStartOnDay(dayMs, viewerTimeZone);
    onCreateRange(s, s + 3_600_000);
  }
  /** Assign an item to a Context (categoryId), or clear it (null). Series-level. */
  function onAssignCategory(occ: Occurrence, categoryId: string | null) {
    if (!canEditOcc(occ)) return;
    void mutations.assignCategory(occ.eventId, categoryId, occ.categoryId);
  }
  /** Recolor an event (series-level: writes the master row's color). */
  function onChangeEventColor(occ: Occurrence, color: string | null) {
    if (!canEditOcc(occ)) return;
    const ev = events.find((e) => e.id === occ.eventId);
    if (ev) void mutations.updateSingle(ev.id, { color }, { color: ev.color });
  }
  /** Toggle a single event Shared (joint). Series-level, like is_private:
   *  writes the master row, no scope prompt. Sharing also clears Private so the
   *  partner can see it. */
  function onToggleEventShared(occ: Occurrence) {
    if (!canEditOcc(occ)) return;
    const ev = events.find((e) => e.id === occ.eventId);
    if (!ev) return;
    const next = !ev.isShared;
    void mutations.updateSingle(
      ev.id,
      next ? { isShared: true, isPrivate: false } : { isShared: false },
      next ? { isShared: ev.isShared, isPrivate: ev.isPrivate } : { isShared: ev.isShared },
    );
  }
  /** The right-click "Share / Make personal" action for an event, or null when
   *  it doesn't apply: not editable, not a normal event, or already joint via a
   *  Shared context (the per-event toggle is moot there). Outside a Shared
   *  context, occ.isShared equals the stored per-event flag. */
  function eventShareAction(occ: Occurrence): ItemAction | null {
    if (occ.kind !== "event" || !canEditOcc(occ)) return null;
    const cat = occ.categoryId ? categoryMap.get(occ.categoryId) : null;
    if (cat?.ownerId === null) return null;
    return occ.isShared
      ? { label: "Make personal", icon: User, onSelect: () => onToggleEventShared(occ) }
      : { label: "Share", icon: Users, onSelect: () => onToggleEventShared(occ) };
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
      // Moving never changes a Context membership — only creating inside a
      // backdrop assigns one. So a move just writes the new time.
      void mutations.updateSingle(ev.id, { start, end }, { start: ev.start, end: ev.end });
    } else {
      setPendingReschedule({ event: ev, occurrence: occ, start, end });
    }
  }
  function onRescheduleScope(scope: RecurrenceScope) {
    const p = pendingReschedule;
    setPendingReschedule(null);
    if (!p) return;
    const patch = { start: p.start, end: p.end };
    // A move never changes Context membership (only create-inside assigns one).
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

  // --- Multi-selection (Shift+click) + bulk actions ---
  /** Shift+click: toggle an editable occurrence in/out of the selection set. */
  function onToggleSelect(occ: Occurrence) {
    if (!canEditOcc(occ)) return; // overlay items aren't actionable in bulk
    toggleSelected(occ.key);
  }
  /** Move/resize every selected block in one batched pass (one invalidate +
   *  one toast). Recurring members change only the selected occurrence (this);
   *  with `family` (Alt) they change the whole series. Master updates are deduped
   *  by event id so several occurrences of one series shift it once. */
  function onRescheduleMany(
    moves: { occ: Occurrence; start: number; end: number }[],
    family: boolean,
  ) {
    const updates = new Map<
      string,
      { kind: "update"; id: string; patch: Partial<EventInput>; prev: Partial<EventInput> }
    >();
    const overrides: {
      kind: "override";
      event: EventRow;
      occurrenceDate: number;
      patch: { start: number; end: number };
    }[] = [];
    for (const { occ, start, end } of moves) {
      if (!canEditOcc(occ)) continue;
      const ev = events.find((e) => e.id === occ.eventId);
      if (!ev) continue;
      if (!ev.rrule) {
        optimisticMove(ev.id, start, end);
        updates.set(ev.id, {
          kind: "update",
          id: ev.id,
          patch: { start, end },
          prev: { start: ev.start, end: ev.end },
        });
      } else if (family) {
        // Whole series: shift the master row by the same start/end delta.
        const mStart = ev.start + (start - occ.start);
        const mEnd = ev.end + (end - occ.end);
        optimisticMove(ev.id, mStart, mEnd);
        updates.set(ev.id, {
          kind: "update",
          id: ev.id,
          patch: { start: mStart, end: mEnd },
          prev: { start: ev.start, end: ev.end },
        });
      } else {
        // This occurrence only: a modify override keyed on the original date.
        overrides.push({ kind: "override", event: ev, occurrenceDate: occ.occurrenceDate, patch: { start, end } });
      }
    }
    const ops = [...updates.values(), ...overrides];
    if (ops.length > 0) void mutations.rescheduleMany(ops);
  }
  // Fields shared by every duplicate (a plain copy owned by the viewer).
  function copyBase(ev: EventRow) {
    return {
      workspaceId: ev.workspaceId,
      ownerId: viewerId,
      categoryId: ev.categoryId,
      title: ev.title,
      description: ev.description,
      location: ev.location,
      isPrivate: ev.isPrivate,
      isShared: ev.isShared,
      color: ev.color,
      kind: ev.kind,
      allDay: ev.allDay,
      inactive: ev.inactive,
      status: ev.status,
      timeZone: ev.timeZone,
      taskId: null as string | null, // a plain copy, not a second "part" of a task
    };
  }
  /** A single one-off copy at the dropped time (drops any recurrence). The copy
   *  keeps the original's Context (categoryId, carried by copyBase). */
  function oneOffCopyInput(ev: EventRow, start: number, end: number): EventInput {
    return {
      ...copyBase(ev),
      start,
      end,
      rrule: null,
      recurrenceEndsAt: null,
    };
  }
  /** A copy of the whole series, shifted by the drag delta (parallel series). */
  function familyCopyInput(ev: EventRow, delta: number): EventInput {
    return {
      ...copyBase(ev),
      start: ev.start + delta,
      end: ev.end + delta,
      rrule: ev.rrule,
      recurrenceEndsAt: ev.recurrenceEndsAt != null ? ev.recurrenceEndsAt + delta : null,
    };
  }
  /** Ctrl/Cmd-drag drop: copy one item. `family` (Alt) copies a recurring item's
   *  whole series shifted by the delta; otherwise a one-off of the occurrence. */
  function onDuplicate(occ: Occurrence, start: number, end: number, family: boolean) {
    if (!canEditOcc(occ)) return;
    const ev = events.find((e) => e.id === occ.eventId);
    if (!ev || !workspace.data) return;
    const input =
      ev.rrule && family ? familyCopyInput(ev, start - occ.start) : oneOffCopyInput(ev, start, end);
    void mutations.create(input);
  }
  /** Ctrl/Cmd-drag drop on a multi-selection: duplicate every selected item.
   *  With `family` (Alt), recurring members copy their whole series (deduped per
   *  series); otherwise each is a one-off of its occurrence. */
  function onDuplicateMany(
    moves: { occ: Occurrence; start: number; end: number }[],
    family: boolean,
  ) {
    const inputs: EventInput[] = [];
    const seenFamily = new Set<string>();
    for (const { occ, start, end } of moves) {
      if (!canEditOcc(occ)) continue;
      const ev = events.find((e) => e.id === occ.eventId);
      if (!ev) continue;
      if (ev.rrule && family) {
        if (seenFamily.has(ev.id)) continue; // one family copy per series
        seenFamily.add(ev.id);
        inputs.push(familyCopyInput(ev, start - occ.start));
      } else {
        inputs.push(oneOffCopyInput(ev, start, end));
      }
    }
    if (inputs.length > 0) void mutations.createMany(inputs);
  }
  /** Build a copy of another member's event for MY calendar. `scope === "all"`
   *  copies the whole recurring series at the same times; otherwise a one-off at
   *  this occurrence's slot. Drops a category I can't see (the other member's
   *  personal context) so the copy doesn't dangle. */
  function copyInput(ev: EventRow, occ: Occurrence, scope: RecurrenceScope): EventInput {
    const input =
      scope === "all" && ev.rrule
        ? familyCopyInput(ev, 0)
        : oneOffCopyInput(ev, occ.start, occ.end);
    if (input.categoryId && !categoryMap.has(input.categoryId)) input.categoryId = null;
    return input;
  }
  /** "Copy to my calendar" for an event I don't own. Recurring sources prompt
   *  for this-occurrence vs whole-series; everything else copies immediately. */
  function onCopyToMine(occ: Occurrence) {
    const ev = events.find((e) => e.id === occ.eventId);
    if (!ev) return;
    if (ev.rrule) {
      setPendingCopy({ event: ev, occurrence: occ });
      return;
    }
    void mutations.create(copyInput(ev, occ, "this"));
  }
  function onCopyScope(scope: RecurrenceScope) {
    if (!pendingCopy) return;
    const { event: ev, occurrence: occ } = pendingCopy;
    setPendingCopy(null);
    void mutations.create(copyInput(ev, occ, scope));
  }
  /** The right-click "Copy to my calendar" action, shown only for another
   *  member's non-joint event (read-only to me). */
  function eventCopyAction(occ: Occurrence): ItemAction | null {
    if (occ.kind !== "event" || canEditOcc(occ)) return null;
    return { label: "Copy to my calendar", icon: CopyPlus, onSelect: () => onCopyToMine(occ) };
  }
  /** Delete every selected event in one batch. A lone item keeps the existing
   *  prompt (recurring) / direct delete (single). In a multi-pick, recurring
   *  items delete only the selected occurrence (this), or the whole series with
   *  `family` (Alt). Series deletes are deduped by event id. */
  function deleteSelected(family: boolean) {
    const keys = [...selectedKeys];
    if (keys.length === 0) return;
    if (keys.length === 1) {
      const occ = visible.find((o) => o.key === keys[0]);
      if (occ) onDeleteEvent(occ); // routes rrule items through the scope prompt
      clearSelection();
      return;
    }
    const deletes = new Set<string>(); // whole rows (non-recurring + family series)
    const cancels: { kind: "cancel"; event: EventRow; occurrenceDate: number }[] = [];
    for (const key of keys) {
      const occ = visible.find((o) => o.key === key);
      if (!occ || !canEditOcc(occ)) continue;
      const ev = events.find((e) => e.id === occ.eventId);
      if (!ev) continue;
      if (!ev.rrule || family) deletes.add(ev.id);
      else cancels.push({ kind: "cancel", event: ev, occurrenceDate: occ.occurrenceDate });
    }
    const ops = [
      ...[...deletes].map((id) => ({ kind: "delete" as const, id })),
      ...cancels,
    ];
    if (ops.length > 0) void mutations.removeMany(ops);
    clearSelection();
  }
  /** Recolor the whole selection (series-level, mirrors onChangeEventColor). */
  function colorSelected(color: string | null) {
    for (const key of selectedKeys) {
      const occ = visible.find((o) => o.key === key);
      if (!occ || !canEditOcc(occ)) continue;
      const ev = events.find((e) => e.id === occ.eventId);
      if (ev) void mutations.updateSingle(ev.id, { color }, { color: ev.color }, { color });
    }
  }

  // Delete/Backspace removes the selection; Escape clears it. Kept in a ref so
  // the listener binds once yet always runs the latest closures.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (e: KeyboardEvent) => {
    // Don't hijack keys while a dialog/sheet is open or while typing — applies
    // to every shortcut below (incl. Shift+M, so typing "M" never toggles).
    if (editor || details || pendingReschedule || pendingDelete || scheduling || shortcutsOpen)
      return;
    const ae = document.activeElement;
    if (
      ae instanceof HTMLElement &&
      (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)
    )
      return;
    // "?" (Shift+/) opens the keyboard-shortcut reference. Guarded above so it
    // never fires while typing or with another dialog open.
    if (e.key === "?") {
      e.preventDefault();
      setShortcutsOpen(true);
      return;
    }
    // Shift+M blurs/un-blurs all titles — works in every view, no selection needed.
    if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "m") {
      e.preventDefault();
      toggleMaskTitles();
      return;
    }
    // Ctrl+Alt+Left / Right toggle the left sidebar / right task-backlog panel.
    if (e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSidebarOpen(!sidebarOpen);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setBacklogOpen(!backlogOpen);
        return;
      }
    }
    const inTimeGrid = view === "day" || view === "week" || view === "3day";
    if (!inTimeGrid || selectedKeys.size === 0) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteSelected(e.altKey); // Alt → delete the whole recurring family
    } else if (e.key === "Escape") {
      clearSelection();
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => setMounted(true), []);

  // First time a second event joins the selection, surface the group-op modifiers
  // contextually (they're otherwise only in the ? sheet). One toast, ever — the
  // session ref stops repeats this mount, localStorage stops them across visits.
  const multiSelectHintShown = useRef(false);
  useEffect(() => {
    if (selectedKeys.size < 2 || multiSelectHintShown.current) return;
    multiSelectHintShown.current = true;
    try {
      if (localStorage.getItem("planner.hint.multiselect") === "seen") return;
      localStorage.setItem("planner.hint.multiselect", "seen");
    } catch {
      /* private mode / no storage — just show it this once */
    }
    toast.info("Multiple events selected", {
      description:
        "Drag any one to move them together. Hold Alt for the whole series, Ctrl to duplicate. Press ? for all shortcuts.",
      duration: 8000,
    });
  }, [selectedKeys.size]);

  // The technical hint (a fresh DB needs its schema applied + seeded) goes to the
  // console only; users get the human LoadError with a Retry instead.
  const dataError = workspace.isError || eventsError;
  useEffect(() => {
    if (dataError)
      console.warn(
        "[planner] Calendar data failed to load. If this is a fresh environment, make sure the Supabase schema is applied and seeded.",
      );
  }, [dataError]);

  const days = useMemo(
    () => getVisibleDays(view, focusedDate, { timeZone: viewerTimeZone }),
    [view, focusedDate, viewerTimeZone],
  );
  const prevDays = useMemo(
    () => getVisibleDays(view, prevFocus, { timeZone: viewerTimeZone }),
    [view, prevFocus, viewerTimeZone],
  );
  const nextDays = useMemo(
    () => getVisibleDays(view, nextFocus, { timeZone: viewerTimeZone }),
    [view, nextFocus, viewerTimeZone],
  );
  const label = formatRangeLabel(view, focusedDate, viewerTimeZone);

  // Swipe left/right to page the period via the carousel; in the time-grid
  // views (day/week/3day) a gesture that begins on an event block is left alone
  // so long-press-dragging an event between days never doubles as a page turn.
  const timeGridView = view === "day" || view === "week" || view === "3day";
  // Remember the time-grid zoom per user; Ctrl/Cmd+0 resets it in timed views.
  useTimelineZoomPersistence(viewerId, timeGridView);
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
  // Week needs 7 columns a phone can't give it; 3-day is the legible stand-in.
  // This also catches a deep-linked `?view=week` opened on a phone (the
  // auto-Agenda above is skipped when the URL pins a view) and a desktop window
  // resized down to phone width. Same convergent render-time setState pattern:
  // week -> 3day, after which this condition is false. The URL self-heals on the
  // next navigation (pushUrl writes the current view).
  if (mounted && isMobile && view === "week") {
    setView("3day");
  }

  return (
    <TimezoneProvider>
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
        onOpenShortcuts={() => setShortcutsOpen(true)}
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
                  showInactiveInMonth={showInactiveInMonth}
                  contextLabel={contextLabel}
                  twoCalendars={twoCalendars}
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
                  showInactiveInMonth={showInactiveInMonth}
                  contextLabel={contextLabel}
                  twoCalendars={twoCalendars}
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
                selectedKeys={selectedKeys}
                onSelect={openDetails}
                onToggleSelect={onToggleSelect}
                onClearSelection={clearSelection}
                onPickDay={pickDay}
                onCreateRange={onCreateRange}
                onCreateDay={createOnDay}
                onReschedule={onReschedule}
                onRescheduleMany={onRescheduleMany}
                onDuplicate={onDuplicate}
                onDuplicateMany={onDuplicateMany}
                onChangeColor={onChangeEventColor}
                onColorSelected={colorSelected}
                onDeleteEvent={onDeleteEvent}
                onAssignCategory={onAssignCategory}
                categoryChoices={categoryChoices}
                eventShareAction={eventShareAction}
                eventCopyAction={eventCopyAction}
                canEdit={canEditOcc}
                taskDoneById={taskDoneById}
                onToggleTaskDone={onToggleTaskDone}
                onScheduleTask={onScheduleTask}
                showInactiveInMonth={showInactiveInMonth}
                contextLabel={contextLabel}
                twoCalendars={twoCalendars}
                loading={workspace.isLoading || eventsLoading}
                error={workspace.isError || eventsError}
                onRetry={() => void qc.invalidateQueries()}
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
            onChangeColor={(t, c) => void taskMutations.update(t.id, { color: c }, { color: t.color }, { color: c })}
            onDelete={(t) => setDeletingTask(t)}
            analytics={{
              occurrences: visible,
              view,
              focusedDate,
              days,
              window: win,
              categories: categoryMap,
              members: memberMap,
              overlayActive: overlayMemberIds.size > 0,
            }}
          />
        )}
      </div>

      {details && (
        <EventDetails
          open
          onOpenChange={(o) => !o && setDetails(null)}
          occurrence={details.occurrence}
          event={details.event}
          color={colorOf(details.occurrence)}
          categoryName={
            details.occurrence.categoryId
              ? categoryMap.get(details.occurrence.categoryId)?.name ?? null
              : null
          }
          ownerName={memberMap.get(details.occurrence.ownerId)?.name ?? "Unknown"}
          isOwn={canEditOcc(details.occurrence)}
          task={
            details.occurrence.taskId ? tasksById.get(details.occurrence.taskId) ?? null : null
          }
          taskDone={
            details.occurrence.taskId
              ? taskDoneById.get(details.occurrence.taskId) ?? false
              : undefined
          }
          onEdit={() => {
            const occ = details.occurrence;
            setDetails(null);
            openEdit(occ);
          }}
          onDelete={() => {
            const occ = details.occurrence;
            setDetails(null);
            onDeleteEvent(occ);
          }}
          onChangeColor={(c) => onChangeEventColor(details.occurrence, c)}
          sharedContext={
            details.occurrence.categoryId
              ? categoryMap.get(details.occurrence.categoryId)?.ownerId === null
              : false
          }
          onToggleEventShared={() => onToggleEventShared(details.occurrence)}
          onCopyToMine={() => {
            const occ = details.occurrence;
            setDetails(null);
            onCopyToMine(occ);
          }}
          onToggleTaskDone={
            details.occurrence.taskId
              ? () => onToggleTaskDone(details.occurrence.taskId!)
              : undefined
          }
        />
      )}

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
          defaultCategoryId={editor.mode === "create" ? editor.defaultCategoryId : undefined}
          readOnly={editor.mode === "edit" && !canEdit(editor.occurrence, viewerId)}
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

      <RecurrenceScopePrompt
        open={pendingCopy !== null}
        onOpenChange={(o) => !o && setPendingCopy(null)}
        mode="copy"
        onChoose={onCopyScope}
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

      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

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
          onChangeColor={(t, c) => void taskMutations.update(t.id, { color: c }, { color: t.color }, { color: c })}
          onDelete={(t) => setDeletingTask(t)}
        />
      )}

      <AlertDialog
        open={deletingContext !== null}
        onOpenChange={(o) => !o && setDeletingContext(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this context window?</AlertDialogTitle>
            <AlertDialogDescription>
              Items keep their Context — only this time-block is removed from the
              calendar. The Context itself stays in the sidebar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingContext) void mutations.remove(deletingContext.id);
                setDeletingContext(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
              calendar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingTask) void taskMutations.remove(deletingTask.id);
                setDeletingTask(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </TimezoneProvider>
  );
}
