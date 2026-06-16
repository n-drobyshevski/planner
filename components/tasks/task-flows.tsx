"use client";

// Flows — the third task view. A GitKraken-style lifecycle graph: each
// top-level task is a horizontal trunk on a left->right timeline, subtasks
// branch off and merge back, and nodes mark recorded status changes. Desktop-
// only (the shell falls back to List on phones); time runs left->right over a
// scrollable, zoomable date axis. Layout math is pure (lib/tasks/flows-layout);
// this file owns the scroll frame, ruler, gutter, zoom, and empty/loading.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ChevronRight,
  CalendarRange,
  Filter,
  GripVertical,
  LocateFixed,
  Plus,
  CircleDot,
} from "lucide-react";
import { startOfDay, startOfWeek, startOfMonth, addDays, addMonths, format } from "date-fns";
import { tz } from "@date-fns/tz";
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { toPaletteColor } from "@/lib/theme/appearance";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useViewerTimeZone } from "@/lib/datetime/timezone-context";
import { dateFnsLocale } from "@/lib/datetime/date-locale";
import { formatTime, formatWeekdayDayMonth } from "@/lib/datetime/format";
import { ToolbarSlot } from "@/components/toolbar-slots";
import {
  DAY_MS,
  FLOW_GEOM,
  buildFlowLanes,
  flowsWindow,
  layoutRows,
  xForTime,
  type FlowCheckpoint,
  type FlowLane,
  type FlowNode,
  type FlowSegment,
  type GroupHeaderRow,
  type LaneRow,
} from "@/lib/tasks/flows-layout";
import {
  filterLanes,
  flowOrderOf,
  groupLanes,
  type FlowsDisplay,
  type FlowsDisplayCtx,
} from "@/lib/tasks/flows-display";
import { useFlowsDnd } from "@/lib/hooks/use-flows-dnd";
import type { FlowLineStyle } from "@/lib/tasks/flow-line-styles";
import { FlowTrack } from "./flows/flow-track";
import { FlowRowMenu } from "./flows/flow-row-menu";
import { FlowsDisplayMenu } from "./flows/flows-display-menu";
import type { TaskActions } from "./task-actions";
import { msToDateInput } from "@/lib/datetime/local";
import type {
  Board,
  Category,
  EventRow,
  Member,
  TaskCheckpoint,
  TaskRow,
  TaskStatusEvent,
} from "@/lib/types";

const G = FLOW_GEOM;
const ZOOM = { month: 9, week: 26, day: 80 } as const;
const ZOOM_MIN = 6;
const ZOOM_MAX = 160;
// Horizontal gap (px) within which a date-tick label is hidden so it never
// collides with the "Now" pill on the ruler. Covers the widest now label
// (the dot + a locale word like "Сейчас") plus a comfortable margin.
const NOW_LABEL_GUARD_PX = 48;
type Density = keyof typeof ZOOM;

export interface TaskFlowsProps {
  tasks: TaskRow[]; // top-level tasks only
  childrenByParent: Map<string | null, TaskRow[]>;
  eventsByTask: Map<string, TaskStatusEvent[]>;
  /** task id -> its linked calendar blocks, for scheduled-block markers */
  blocksByTask: Map<string, EventRow[]>;
  /** task id -> its milestone checkpoints (top-level lanes only) */
  checkpointsByTask: Map<string, TaskCheckpoint[]>;
  colorOf: (t: TaskRow) => string;
  /** the Flows line style for a task, resolved from its board (state). */
  lineStyleOf: (t: TaskRow) => FlowLineStyle;
  members: Map<string, Member>;
  currentMemberId: string | null;
  actions: TaskActions;
  /** the active collection's columns (ordered) — for status grouping + filter */
  boards: Board[];
  /** the workspace's categories — for category grouping/filter + swatches */
  categories: Category[];
  /** filter / group / sort settings (owned + persisted by the shell) */
  display: FlowsDisplay;
  onDisplayChange: (next: FlowsDisplay) => void;
  onResetDisplay: () => void;
  /** Bumped by the shell after a subtask is added here, to auto-expand its lane. */
  expandLane?: { id: string; key: number } | null;
  /** status-event history still loading (tasks may already be ready) */
  loading?: boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function TaskFlows({
  tasks,
  childrenByParent,
  eventsByTask,
  blocksByTask,
  checkpointsByTask,
  colorOf,
  lineStyleOf,
  members,
  currentMemberId,
  actions,
  boards,
  categories,
  display,
  onDisplayChange,
  onResetDisplay,
  expandLane,
  loading,
}: TaskFlowsProps) {
  const t = useTranslations("tasks");
  const locale = useLocale();
  const timeZone = useViewerTimeZone();
  // The canvas is the only scroll container; the ruler (horizontal) and gutter
  // (vertical) are overflow-hidden panes slaved to it, so horizontal scroll and
  // zoom can never move the side panel.
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const didCenter = useRef(false);

  // Captured once: a minute of drift in the now-line is invisible, and a stable
  // value keeps the memoized model from thrashing.
  const [nowMs] = useState(() => Date.now());
  const [pxPerDay, setPxPerDay] = useState<number>(ZOOM.week);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // Auto-expand a lane when the shell signals a subtask was just added to it
  // (Add subtask → its new branch should be visible without a manual expand).
  // Adjusting state during render off the bumping `key` is React's recommended
  // alternative to an effect for reacting to a changed prop.
  const [seenExpandKey, setSeenExpandKey] = useState<number | null>(null);
  if (expandLane && expandLane.key !== seenExpandKey) {
    setSeenExpandKey(expandLane.key);
    if (!expanded.has(expandLane.id)) {
      setExpanded((prev) => new Set(prev).add(expandLane.id));
    }
  }
  // Measured canvas viewport. Width drives the side padding that lets the
  // now-line reach the centre even when the data is narrower than the screen;
  // height lets the track fill the view. Measured before paint (callback ref)
  // so centring doesn't flicker.
  const [canvasW, setCanvasW] = useState(0);
  const [canvasH, setCanvasH] = useState(0);

  const lanes = useMemo(
    () =>
      buildFlowLanes({
        topLevel: tasks,
        childrenByParent,
        eventsByTask,
        blocksByTask,
        checkpointsByTask,
        nowMs,
      }),
    [tasks, childrenByParent, eventsByTask, blocksByTask, checkpointsByTask, nowMs],
  );

  // Lookups + localized bucket labels the grouping needs (pure data; the
  // pipeline stays unit-testable).
  const groupCtx = useMemo<FlowsDisplayCtx>(
    () => ({
      boardsById: new Map(boards.map((b) => [b.id, b])),
      boardOrder: new Map(boards.map((b, i) => [b.id, i])),
      categoriesById: new Map(categories.map((c) => [c.id, c])),
      labels: {
        noStatus: t("flows.display.noStatus"),
        noCategory: t("flows.display.noCategory"),
        priority: {
          0: t("priority.none"),
          1: t("priority.low"),
          2: t("priority.medium"),
          3: t("priority.high"),
        },
      },
    }),
    [boards, categories, t],
  );

  // filter -> group/sort -> layout. The window derives from the *filtered*
  // lanes, so hiding lanes recomputes the visible time extent.
  const filtered = useMemo(() => filterLanes(lanes, display.filter), [lanes, display.filter]);

  // The manual-order anchor: a hand-set `flowPos` if present, else the lane's
  // baseline index (open-first by time). Drives both the manual sort and the DnD
  // drop math, so the rendered order and the persisted rank stay consistent.
  const flowAnchor = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((l, i) => map.set(l.task.id, flowOrderOf(l.task) ?? i));
    return map;
  }, [filtered]);
  const manualAnchor = useCallback(
    (l: FlowLane) => flowAnchor.get(l.task.id) ?? 0,
    [flowAnchor],
  );

  const groups = useMemo(
    () =>
      groupLanes(filtered, display.groupBy, display.sortBy, display.sortDir, groupCtx, manualAnchor),
    [filtered, display.groupBy, display.sortBy, display.sortDir, groupCtx, manualAnchor],
  );

  // The data window is the meaningful extent; the render window pads each side
  // by half the visible track so any point (incl. "now") can be scrolled to the
  // centre. The pad is empty but dated — it reads as scroll/planning slack.
  const data = useMemo(() => flowsWindow(filtered, nowMs), [filtered, nowMs]);
  // The canvas viewport IS the track viewport (the gutter is a separate pane).
  const visibleTrack = canvasW;
  const padMs = pxPerDay > 0 ? ((visibleTrack / 2) / pxPerDay) * DAY_MS : 0;
  const t0 = data.t0 - padMs; // render origin (left pad)
  const t1 = data.t1 + padMs; // render right edge (right pad)
  const { rows, totalHeight } = useMemo(
    () => layoutRows(groups, expanded),
    [groups, expanded],
  );

  // Lanes in their current visual order (across groups) — the DnD reorder set.
  const orderedLanes = useMemo(
    () => rows.flatMap((r) => (r.kind === "lane" ? [r.lane] : [])),
    [rows],
  );
  // Each lane's group bucket, so a drag reorders only within its own group.
  const groupByLane = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) for (const l of g.lanes) map.set(l.task.id, g.key);
    return map;
  }, [groups]);
  // Hand-reordering writes a global `flowPos`, so it works in every grouping —
  // it just needs the manual sort (otherwise the chosen sort owns the order).
  const canReorder = display.sortBy === "manual";
  const dnd = useFlowsDnd(orderedLanes, {
    anchorOf: (id) => flowAnchor.get(id) ?? 0,
    groupOf: (id) => groupByLane.get(id) ?? "all",
    onReorder: actions.reorderFlow,
  });
  const trackWidth = Math.ceil(((t1 - t0) / DAY_MS) * pxPerDay);
  // x of the now-line, pinned to the right edge once now passes the window.
  // Shared by the ruler's "Now" pill and the tick-label collision guard.
  const nowX = xForTime(Math.min(nowMs, t1), t0, pxPerDay);
  // Fill the canvas so the gutter + track don't stop at the last lane; grow
  // past it (and scroll) when there are more lanes than fit. canvasH already
  // excludes the frozen header row.
  const fillHeight = Math.max(totalHeight, canvasH);

  const ticks = useMemo(
    () => buildTicks(t0, t1, pxPerDay, timeZone, locale),
    [t0, t1, pxPerDay, timeZone, locale],
  );
  const gridMs = useMemo(() => ticks.map((tk) => tk.ms), [ticks]);

  // Measure the canvas + wire its non-passive Ctrl/⌘-wheel zoom when it mounts.
  // A callback ref (not an effect) so it fires even when the view first renders
  // as the loading skeleton and the canvas appears only later.
  const attachCanvas = useCallback((node: HTMLDivElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    canvasRef.current = node;
    if (!node) return;
    const measure = () => {
      setCanvasW(node.clientWidth);
      setCanvasH(node.clientHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return; // plain wheel scrolls; ctrl/⌘ zooms
      e.preventDefault();
      setPxPerDay((p) => clamp(p * (e.deltaY < 0 ? 1.15 : 0.87), ZOOM_MIN, ZOOM_MAX));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    cleanupRef.current = () => {
      ro.disconnect();
      node.removeEventListener("wheel", onWheel);
    };
  }, []);
  useEffect(() => () => cleanupRef.current?.(), []);

  // The canvas is the only scroller; mirror its offsets onto the ruler
  // (horizontal) and gutter (vertical). Both are overflow-hidden, so this is the
  // only thing that moves them — the side panel never scrolls horizontally.
  function syncScroll() {
    const c = canvasRef.current;
    if (!c) return;
    if (rulerRef.current) rulerRef.current.scrollLeft = c.scrollLeft;
    if (gutterRef.current) gutterRef.current.scrollTop = c.scrollTop;
  }

  function scrollToNow() {
    const c = canvasRef.current;
    if (!c) return;
    c.scrollLeft = Math.max(0, nowX - c.clientWidth / 2);
    syncScroll();
  }

  // Centre the canvas on a row's activity: the midpoint of its span (clamped to
  // the render window so a long-open or long-finished task still lands on
  // screen). Works on a trunk or a branch, whether or not it's expanded.
  function scrollToTask(taskId: string) {
    const c = canvasRef.current;
    if (!c) return;
    let seg: FlowSegment | undefined;
    for (const lane of lanes) {
      if (lane.task.id === taskId) {
        seg = lane;
        break;
      }
      const branch = lane.branches.find((b) => b.task.id === taskId);
      if (branch) {
        seg = branch;
        break;
      }
    }
    if (!seg) return;
    const mid = clamp((seg.startMs + (seg.endMs ?? nowMs)) / 2, t0, t1);
    const x = xForTime(mid, t0, pxPerDay);
    c.scrollLeft = Math.max(0, x - c.clientWidth / 2);
    syncScroll();
  }

  const anyExpandable = useMemo(() => filtered.some((l) => l.branches.length > 0), [filtered]);
  const expandAll = () =>
    setExpanded(new Set(filtered.filter((l) => l.branches.length > 0).map((l) => l.task.id)));
  const collapseAll = () => setExpanded(new Set());

  // Centre the now-line once the canvas is measured and there's data — in a
  // layout effect (before paint) so the padded track is already in the DOM and
  // there's no left-aligned flash before it settles on centre.
  useLayoutEffect(() => {
    if (didCenter.current || canvasW === 0 || rows.length === 0) return;
    didCenter.current = true;
    scrollToNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot centering on first layout
  }, [canvasW, rows.length]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Localized tooltip / accessible name for a node. */
  function nodeLabel(node: FlowNode, task: TaskRow): string {
    const kindKey =
      node.kind === "due" ? (node.overdue ? "overdue" : "due") : node.kind;
    const when =
      node.kind === "due"
        ? formatWeekdayDayMonth(node.ms, timeZone, locale)
        : `${formatWeekdayDayMonth(node.ms, timeZone, locale)} · ${formatTime(node.ms, timeZone)}`;
    return `${task.title}: ${t(`flows.node.${kindKey}`)} · ${when}`;
  }

  /** Localized tooltip / accessible name for a milestone or planned-start marker. */
  function segmentLabel(seg: FlowSegment): string {
    const when = formatWeekdayDayMonth(seg.startMs, timeZone, locale);
    if (seg.milestone) {
      const key =
        seg.task.completedAt != null ? "done" : seg.startMs > nowMs ? "upcoming" : "moment";
      return `${seg.task.title}: ${t(`flows.milestone.${key}`)} · ${when}`;
    }
    return `${seg.task.title}: ${t("flows.plannedStart")} · ${when}`;
  }

  /** Localized tooltip / accessible name for a checkpoint marker. */
  function checkpointLabel(cp: FlowCheckpoint, task: TaskRow): string {
    const when = formatWeekdayDayMonth(cp.ms, timeZone, locale);
    const title = cp.title.trim() || t("flows.checkpoint.untitled");
    const state = cp.reached
      ? t("flows.checkpoint.reached")
      : cp.ms > nowMs
        ? t("flows.checkpoint.upcoming")
        : t("flows.checkpoint.label");
    return `${task.title}: ${title} · ${state} · ${when}`;
  }

  /** Default date for a checkpoint added from a lane's row menu: the lane's
   *  mid-span, but never before today (a fresh lane defaults to ~now). */
  function defaultCheckpointDate(lane: FlowLane): string {
    const mid = (lane.startMs + (lane.endMs ?? nowMs)) / 2;
    return msToDateInput(Math.max(mid, nowMs), timeZone);
  }

  if (loading) return <FlowsSkeleton />;

  if (tasks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <CalendarRange className="mx-auto mb-3 size-6 text-muted-foreground" />
          <h3 className="text-base font-medium">{t("flows.empty.title")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("flows.empty.body")}</p>
          <Button size="sm" className="mt-4" onClick={() => actions.create()}>
            {t("toolbar.newTask")}
          </Button>
        </div>
      </div>
    );
  }

  // The Display control (filter / group / sort) is portaled into the shared
  // header so the cramped 272px gutter corner keeps just zoom + Today.
  const displayMenu = (
    <ToolbarSlot name="trailing">
      <FlowsDisplayMenu
        display={display}
        onChange={onDisplayChange}
        onReset={onResetDisplay}
        boards={boards}
        categories={categories}
        totalCount={tasks.length}
        filteredCount={orderedLanes.length}
      />
    </ToolbarSlot>
  );

  // Tasks exist, but the filters hide them all — keep the Display menu reachable
  // so the user can clear the filter without leaving the view.
  if (orderedLanes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        {displayMenu}
        <div className="max-w-sm text-center">
          <Filter className="mx-auto mb-3 size-6 text-muted-foreground" />
          <h3 className="text-base font-medium">{t("flows.filtered.emptyTitle")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("flows.filtered.emptyBody")}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={onResetDisplay}>
            {t("flows.filtered.clear")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {displayMenu}
      {/* Frozen header: zoom controls (corner) + the date ruler */}
      <div className="flex shrink-0 border-b border-border" style={{ height: G.rulerHeight }}>
        <div
          className="flex shrink-0 items-center gap-1 overflow-hidden border-r border-border bg-card px-2"
          style={{ width: G.gutterWidth }}
        >
          <ToggleGroup
            type="single"
            value={densityFor(pxPerDay)}
            onValueChange={(v) => v && setPxPerDay(ZOOM[v as Density])}
            variant="outline"
            size="sm"
            aria-label={t("flows.zoom.label")}
          >
            <ToggleGroupItem value="month">{t("flows.zoom.month")}</ToggleGroupItem>
            <ToggleGroupItem value="week">{t("flows.zoom.week")}</ToggleGroupItem>
            <ToggleGroupItem value="day">{t("flows.zoom.day")}</ToggleGroupItem>
          </ToggleGroup>
          <Button
            variant="ghost"
            size="icon"
            onClick={scrollToNow}
            aria-label={t("flows.today")}
            title={t("flows.today")}
            className="ml-auto size-7 shrink-0"
          >
            <LocateFixed className="size-4" />
          </Button>
        </div>
        <div ref={rulerRef} className="relative flex-1 overflow-hidden bg-background">
          <div className="relative h-full" style={{ width: trackWidth }}>
            {ticks.map((tk, i) => {
              const x = xForTime(tk.ms, t0, pxPerDay);
              // A boundary tick can land before the window start (negative x);
              // its gridline is clipped, and its label would bleed under the
              // corner, so skip it.
              if (x < 0) return null;
              // The "Now" pill is the accent horizon and takes the row; a tick
              // label landing under it would collide ("19·Now"), so the tick
              // yields its label here. Its gridline still draws on the canvas.
              if (Math.abs(x - nowX) < NOW_LABEL_GUARD_PX) return null;
              return (
                <div
                  key={i}
                  className="absolute top-0 flex h-full items-center pl-1.5 text-[11px] tabular-nums text-muted-foreground"
                  style={{ left: x }}
                >
                  {tk.label}
                </div>
              );
            })}
            {/* "Now" marker — the horizon between past and ahead, in the accent */}
            {nowX >= 0 && (
              <div
                className="absolute top-0 flex h-full items-center gap-1 pl-1.5 text-[11px] font-medium tabular-nums text-primary"
                style={{ left: nowX }}
              >
                <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                {t("flows.now")}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body: frozen gutter (left) + the scrolling canvas (right) */}
      <div className="flex min-h-0 flex-1">
        <div
          ref={gutterRef}
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey) return; // zoom is canvas-only
            const c = canvasRef.current;
            if (c) c.scrollTop += e.deltaY; // wheel over the panel scrolls lanes
          }}
          className="shrink-0 overflow-hidden border-r border-border bg-card"
          style={{ width: G.gutterWidth }}
        >
          <div className="relative" style={{ width: G.gutterWidth, height: fillHeight }}>
            <DndContext
              sensors={dnd.sensors}
              collisionDetection={closestCenter}
              autoScroll={false}
              onDragStart={dnd.onDragStart}
              onDragEnd={dnd.onDragEnd}
            >
              <SortableContext items={dnd.ids} strategy={verticalListSortingStrategy}>
                {rows.map((row) =>
                  row.kind === "group" ? (
                    <GutterGroupHeader key={`group-${row.key}`} row={row} />
                  ) : (
                    <GutterLaneRow
                      key={row.lane.task.id}
                      row={row}
                      canReorder={canReorder}
                      ownerColor={
                        members.get(row.lane.task.ownerId)?.color ?? colorOf(row.lane.task)
                      }
                      t={t}
                      actions={actions}
                      scrollToTask={scrollToTask}
                      addCheckpoint={() =>
                        actions.addCheckpoint(row.lane.task, defaultCheckpointDate(row.lane))
                      }
                      toggle={toggle}
                      anyExpandable={anyExpandable}
                      expandAll={expandAll}
                      collapseAll={collapseAll}
                    />
                  ),
                )}
              </SortableContext>
              <DragOverlay>
                {dnd.activeLane ? (
                  <div className="flex items-center gap-1.5 rounded-md bg-card px-2 py-1.5 text-sm shadow-soft-lg ring-1 ring-border">
                    <GripVertical
                      className="size-4 shrink-0 text-muted-foreground/60"
                      aria-hidden
                    />
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          members.get(dnd.activeLane.task.ownerId)?.color ??
                          colorOf(dnd.activeLane.task),
                      }}
                      aria-hidden
                    />
                    <span className="truncate">{dnd.activeLane.task.title}</span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
            {/* Add-task affordance, parked in the empty filler below the last lane
                so it never offsets the gutter/track row alignment. */}
            <button
              type="button"
              onClick={() => actions.create()}
              className="group absolute flex items-center gap-2 rounded px-2 text-left text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              style={{ left: 0, top: totalHeight, width: G.gutterWidth, height: G.laneHeight }}
            >
              <span className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors group-hover:bg-muted group-hover:text-foreground">
                <Plus className="size-4" />
              </span>
              <span className="truncate">{t("toolbar.newTask")}</span>
            </button>
          </div>
        </div>

        <div ref={attachCanvas} onScroll={syncScroll} className="flex-1 overflow-auto">
          <FlowTrack
            rows={rows}
            height={fillHeight}
            t0={t0}
            t1={t1}
            pxPerDay={pxPerDay}
            trackWidth={trackWidth}
            nowMs={nowMs}
            gridMs={gridMs}
            colorOf={colorOf}
            lineStyleOf={lineStyleOf}
            currentMemberId={currentMemberId}
            timeZone={timeZone}
            nodeLabel={nodeLabel}
            segmentLabel={segmentLabel}
            checkpointLabel={checkpointLabel}
            onOpenTask={actions.open}
            onOpenCheckpoint={(cp) => actions.openCheckpoint(cp.id)}
            onCanvasPlace={(taskId, atDate) => {
              const task = tasks.find((t) => t.id === taskId);
              if (task) actions.addCheckpoint(task, atDate);
            }}
          />
        </div>
      </div>
    </div>
  );
}

type Translator = ReturnType<typeof useTranslations>;

/** A group-by section header band in the gutter (mirrors the canvas band). */
function GutterGroupHeader({ row }: { row: GroupHeaderRow }) {
  return (
    <div
      className="absolute flex items-center gap-2 border-b border-border bg-muted/40 px-2"
      style={{ left: 0, top: row.top, width: G.gutterWidth, height: G.groupHeaderHeight }}
    >
      {row.color && (
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: toPaletteColor(row.color) }}
          aria-hidden
        />
      )}
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {row.label}
      </span>
      <span className="shrink-0 text-[11px] font-medium text-muted-foreground/70 tabular-nums">
        {row.count}
      </span>
    </div>
  );
}

/**
 * One gutter lane row. A `useSortable` node (disabled unless reordering is
 * possible) carries the absolute `top` plus the drag transform; the grip handle
 * is the only drag activator, so the title stays click-to-open. Subtask branch
 * rows render beneath, outside the sortable node.
 */
function GutterLaneRow({
  row,
  canReorder,
  ownerColor,
  t,
  actions,
  scrollToTask,
  addCheckpoint,
  toggle,
  anyExpandable,
  expandAll,
  collapseAll,
}: {
  row: LaneRow;
  canReorder: boolean;
  ownerColor: string;
  t: Translator;
  actions: TaskActions;
  scrollToTask: (id: string) => void;
  addCheckpoint: () => void;
  toggle: (id: string) => void;
  anyExpandable: boolean;
  expandAll: () => void;
  collapseAll: () => void;
}) {
  const { lane, top, isExpanded, branchRows } = row;
  const hasChildren = lane.branches.length > 0;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lane.task.id,
    disabled: !canReorder,
  });

  return (
    <div>
      <div
        ref={setNodeRef}
        className={cn(
          "absolute flex items-center gap-1.5 px-2",
          lane.done && "opacity-60",
          isDragging && "z-10 opacity-50",
        )}
        style={{
          left: 0,
          top,
          width: G.gutterWidth,
          height: G.laneHeight,
          transform: CSS.Transform.toString(transform),
          transition,
        }}
      >
        {canReorder && (
          <button
            type="button"
            aria-label={t("flows.dnd.handle", { title: lane.task.title })}
            className="grid size-5 shrink-0 cursor-grab touch-none place-items-center rounded text-muted-foreground/40 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        )}
        {hasChildren ? (
          <button
            type="button"
            aria-label={isExpanded ? t("flows.collapse") : t("flows.expand")}
            aria-expanded={isExpanded}
            onClick={() => toggle(lane.task.id)}
            className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronRight
              className={cn("size-4 transition-transform", isExpanded && "rotate-90")}
            />
          </button>
        ) : (
          <span className="w-5 shrink-0" aria-hidden />
        )}
        {lane.task.isMilestone ? (
          <CircleDot
            className="size-3 shrink-0"
            style={{ color: ownerColor }}
            aria-label={t("flows.milestone.label")}
          />
        ) : (
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: ownerColor }}
            aria-hidden
          />
        )}
        <FlowRowMenu
          task={lane.task}
          onOpen={() => actions.open(lane.task)}
          onToggleDone={() => actions.toggleDone(lane.task)}
          onCenter={() => scrollToTask(lane.task.id)}
          onDelete={() => actions.remove(lane.task)}
          onChangeColor={(c) => actions.changeColor(lane.task, c)}
          onAddSubtask={() => actions.addSubtask(lane.task)}
          onAddCheckpoint={addCheckpoint}
          onExpandAll={anyExpandable ? expandAll : undefined}
          onCollapseAll={anyExpandable ? collapseAll : undefined}
        >
          <button
            type="button"
            onClick={() => actions.open(lane.task)}
            className={cn(
              "min-w-0 flex-1 truncate rounded text-left text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              lane.done && "line-through",
            )}
          >
            {lane.task.title}
          </button>
        </FlowRowMenu>
      </div>

      {isExpanded &&
        branchRows.map(({ branch, subTop }) => (
          <FlowRowMenu
            key={branch.task.id}
            task={branch.task}
            onOpen={() => actions.open(branch.task)}
            onToggleDone={() => actions.toggleDone(branch.task)}
            onCenter={() => scrollToTask(branch.task.id)}
            onDelete={() => actions.remove(branch.task)}
            onChangeColor={(c) => actions.changeColor(branch.task, c)}
          >
            <button
              type="button"
              onClick={() => actions.open(branch.task)}
              className={cn(
                "absolute truncate rounded pr-2 pl-9 text-left text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                branch.task.completedAt != null && "line-through",
              )}
              style={{ left: 0, top: subTop, width: G.gutterWidth, height: G.subRowHeight }}
            >
              {branch.task.title}
            </button>
          </FlowRowMenu>
        ))}
    </div>
  );
}

function densityFor(pxPerDay: number): Density {
  if (pxPerDay >= 48) return "day";
  if (pxPerDay >= 14) return "week";
  return "month";
}

/** Day/week/month axis ticks in the viewer's zone, labeled in the app locale. */
function buildTicks(
  t0: number,
  t1: number,
  pxPerDay: number,
  timeZone: string,
  locale: string,
): { ms: number; label: string }[] {
  const inTz = { in: tz(timeZone) };
  const loc = dateFnsLocale(locale);
  const unit = densityFor(pxPerDay);
  let cur =
    unit === "day"
      ? startOfDay(t0, inTz)
      : unit === "week"
        ? startOfWeek(t0, { ...inTz, weekStartsOn: 1 })
        : startOfMonth(t0, inTz);

  const ticks: { ms: number; label: string }[] = [];
  for (let guard = 0; cur.getTime() <= t1 && guard < 600; guard++) {
    const ms = cur.getTime();
    const label =
      unit === "month"
        ? format(cur, "LLL yyyy", { ...inTz, locale: loc })
        : format(cur, "d MMM", { ...inTz, locale: loc });
    ticks.push({ ms, label });
    cur =
      unit === "day"
        ? addDays(cur, 1, inTz)
        : unit === "week"
          ? addDays(cur, 7, inTz)
          : addMonths(cur, 1, inTz);
  }
  return ticks;
}

/** Placeholder lanes while the status-event history loads. */
function FlowsSkeleton() {
  return (
    <div className="space-y-3 p-4" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-3 w-40 shrink-0 rounded bg-muted motion-safe:animate-pulse" />
          <div
            className="h-2.5 rounded-full bg-muted motion-safe:animate-pulse"
            style={{ width: `${30 + ((i * 13) % 55)}%` }}
          />
        </div>
      ))}
    </div>
  );
}
