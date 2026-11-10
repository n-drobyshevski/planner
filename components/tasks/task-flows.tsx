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
  ChevronUp,
  ChevronsUp,
  CalendarRange,
  CornerDownRight,
  Filter,
  GripVertical,
  LocateFixed,
  Plus,
  CircleDot,
} from "lucide-react";
import { startOfDay, startOfWeek, startOfMonth, addDays, addMonths, format } from "date-fns";
import { tz } from "@date-fns/tz";
import { DndContext, DragOverlay, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { NEST_PREFIX } from "@/lib/tasks/nest-collision";
import { cn } from "@/lib/utils";
import { toPaletteColor, toPaletteStroke } from "@/lib/theme/appearance";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useViewerTimeZone } from "@/lib/datetime/timezone-context";
import { dateFnsLocale } from "@/lib/datetime/date-locale";
import { formatDayMonthToken, formatTime, formatWeekdayDayMonth } from "@/lib/datetime/format";
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
  type LaneGroup,
  type LaneRow,
  type StreamRow,
} from "@/lib/tasks/flows-layout";
import { progressDeep, type ById } from "@/lib/tasks/tree";
import { runwayDueLabel, type Runway } from "@/lib/tasks/flows-runway";
import {
  filterLanes,
  flowOrderOf,
  groupLanes,
  type FlowsDisplay,
  type FlowsDisplayCtx,
} from "@/lib/tasks/flows-display";
import { buildStreams, rankStreams, type StreamSummary } from "@/lib/tasks/flows-streams";
import { attentionReason, type AttentionReason } from "@/lib/tasks/attention-reason";
import { daysUntil } from "@/lib/tasks/attention";
import { collectTags } from "@/lib/tasks/tags";
import { useFlowsDnd, type FlowsDndItem } from "@/lib/hooks/use-flows-dnd";
import type { FlowLineStyle } from "@/lib/tasks/flow-line-styles";
import { FlowTrack } from "./flows/flow-track";
import { FlowRowMenu } from "./flows/flow-row-menu";
import { FlowsDisplayMenu, type SavedStreamsApi } from "./flows/flows-display-menu";
import type { TaskActions } from "./task-actions";
import { dateInputToUtcMs, msToDateInput } from "@/lib/datetime/local";
import type {
  Board,
  Category,
  Collection,
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
  /** Whole-tree id lookup (all collection tasks) for drag-to-nest cycle/depth checks. */
  treeById: ById;
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
  /**
   * The columns of the collections on screen (ordered) — for status grouping +
   * filter. With scope "all" these span collections, so their names arrive
   * already qualified by collection.
   */
  boards: Board[];
  /** the collections the viewer can see, in switcher order — for collection grouping */
  collections: Collection[];
  /** the workspace's categories — for category grouping/filter + swatches */
  categories: Category[];
  /** filter / group / sort settings (owned + persisted by the shell) */
  display: FlowsDisplay;
  onDisplayChange: (next: FlowsDisplay) => void;
  onResetDisplay: () => void;
  /** the viewer's saved streams (member-private) and their writes; omitted = section hidden */
  savedStreams?: SavedStreamsApi;
  /** Bumped by the shell after a subtask is added here, to auto-expand its lane. */
  expandLane?: { id: string; key: number } | null;
  /** status-event history still loading (tasks may already be ready) */
  loading?: boolean;
  /** stream keys open on first render (the dev preview presets one) */
  initialExpandedStreams?: string[];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function TaskFlows({
  tasks,
  childrenByParent,
  treeById,
  eventsByTask,
  blocksByTask,
  checkpointsByTask,
  colorOf,
  lineStyleOf,
  members,
  currentMemberId,
  actions,
  boards,
  collections,
  categories,
  display,
  onDisplayChange,
  onResetDisplay,
  savedStreams,
  expandLane,
  loading,
  initialExpandedStreams,
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

  // The viewer's calendar day ("yyyy-MM-dd" in their zone) — what "due
  // tomorrow" and "overdue" are measured against.
  const today = useMemo(() => msToDateInput(nowMs, timeZone), [nowMs, timeZone]);
  const [expandedStreams, setExpandedStreams] = useState<ReadonlySet<string>>(
    () => new Set(initialExpandedStreams ?? []),
  );

  // Lookups + localized bucket labels the grouping needs (pure data; the
  // pipeline stays unit-testable).
  const groupCtx = useMemo<FlowsDisplayCtx>(
    () => ({
      boardsById: new Map(boards.map((b) => [b.id, b])),
      boardOrder: new Map(boards.map((b, i) => [b.id, i])),
      categoriesById: new Map(categories.map((c) => [c.id, c])),
      collectionsById: new Map(collections.map((c) => [c.id, c])),
      collectionOrder: new Map(collections.map((c, i) => [c.id, i])),
      membersById: members,
      memberOrder: new Map([...members.keys()].map((id, i) => [id, i])),
      today,
      attention: display.attention,
      labels: {
        noStatus: t("flows.display.noStatus"),
        noCategory: t("flows.display.noCategory"),
        noTag: t("flows.display.noTag"),
        noCollection: t("flows.display.noCollection"),
        unassigned: t("flows.display.unassigned"),
        priority: {
          0: t("priority.none"),
          1: t("priority.low"),
          2: t("priority.medium"),
          3: t("priority.high"),
        },
      },
    }),
    [boards, categories, collections, members, t, today, display.attention],
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

  const streamsMode = display.mode === "streams";
  // Group, summarize, and (sorting by attention) put the most pressing group
  // first. Streams mode with no grouping is one stream of everything, which
  // needs a name the headerless bucket doesn't carry.
  const { groups, streams } = useMemo(() => {
    let gs: LaneGroup[] = groupLanes(
      filtered,
      display.groupBy,
      display.sortBy,
      display.sortDir,
      groupCtx,
      manualAnchor,
    );
    if (streamsMode) {
      gs = gs.map((g) => (g.header ? g : { ...g, label: t("flows.streams.all") }));
    }
    let ss: StreamSummary[] = buildStreams(gs, { nowMs, today, mode: display.attention });
    if (display.sortBy === "attention" && gs.length > 1) {
      const ranked = rankStreams(ss);
      if (display.sortDir === "asc") ranked.reverse();
      const byKey = new Map(gs.map((g) => [g.key, g]));
      gs = ranked.map((r) => byKey.get(r.key)!);
      ss = ranked;
    }
    return { groups: gs, streams: ss };
  }, [
    filtered,
    display.groupBy,
    display.sortBy,
    display.sortDir,
    display.attention,
    groupCtx,
    manualAnchor,
    streamsMode,
    nowMs,
    today,
    t,
  ]);

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
    () =>
      layoutRows(groups, expanded, {
        mode: display.mode,
        streams,
        expandedStreams,
      }),
    [groups, expanded, display.mode, streams, expandedStreams],
  );

  // Lane rows in their current visual order (across groups) — the DnD set.
  // Keyed by row, not task: a multi-tag task has a row in each tag's group.
  const dndItems = useMemo<FlowsDndItem[]>(
    () =>
      rows.flatMap((r) =>
        r.kind === "lane"
          ? [{ key: r.rowKey, lane: r.lane, group: groupKeyOf(r) }]
          : [],
      ),
    [rows],
  );
  // Each lane's attention reason (by task id: it is the same in every group).
  const reasons = useMemo(() => {
    const map = new Map<string, AttentionReason>();
    for (const l of filtered) {
      const r = attentionReason(l, today, display.attention);
      if (r) map.set(l.task.id, r);
    }
    return map;
  }, [filtered, today, display.attention]);
  // Tags in use on the lanes in scope, for the tag filter.
  const tagOptions = useMemo(() => collectTags(tasks), [tasks]);

  // Hand-reordering writes a global `flowPos`, so it works in every grouping —
  // it just needs the manual sort (otherwise the chosen sort owns the order).
  const canReorder = display.sortBy === "manual";
  const dnd = useFlowsDnd(dndItems, {
    anchorOf: (id) => flowAnchor.get(id) ?? 0,
    onReorder: actions.reorderFlow,
    onReparent: actions.reparent,
    treeById,
    treeByParent: childrenByParent,
    canReorder,
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

  // Expansion is per TASK, not per row: a multi-tag task opens its subtasks in
  // every group it appears in, so the two copies never disagree.
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleStream = (key: string) =>
    setExpandedStreams((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /** "Needs attention now: due tomorrow · high priority" — the marker's accessible name. */
  function attentionLabel(r: AttentionReason): string {
    const parts: string[] = [];
    if (r.days !== null) parts.push(dueWords(r.days));
    if (r.priority === 3) parts.push(t("flows.attention.highPriority"));
    else if (r.priority === 2) parts.push(t("flows.attention.mediumPriority"));
    return t(r.level === "high" ? "flows.attention.now" : "flows.attention.soon", {
      reasons: parts.join(" · "),
    });
  }
  /** "due today" / "due tomorrow" / "due in 3 days" / "overdue 2 days". */
  function dueWords(days: number): string {
    if (days < 0) return t("flows.attention.overdue", { count: -days });
    if (days === 0) return t("flows.attention.dueToday");
    if (days === 1) return t("flows.attention.dueTomorrow");
    return t("flows.attention.dueIn", { count: days });
  }
  /** The marker's visible short text: the deadline if it counts, else the priority. */
  function attentionShort(r: AttentionReason): string {
    if (r.days !== null) {
      if (r.days < 0) return t("flows.attention.shortOverdue", { count: -r.days });
      if (r.days === 0) return t("flows.attention.shortToday");
      if (r.days === 1) return t("flows.attention.shortTomorrow");
      return t("flows.attention.shortIn", { count: r.days });
    }
    return t(r.priority === 3 ? "priority.high" : "priority.medium");
  }
  const dueDate = (token: string) =>
    formatWeekdayDayMonth(dateInputToUtcMs(token), "UTC", locale);
  const shortDue = (token: string) => formatDayMonthToken(token, locale);

  /** Spoken summary of a stream / group: counts, attention and the next deadline. */
  function streamSummaryLabel(s: StreamSummary): string {
    const parts = [
      t("flows.streams.openCount", { count: s.open }),
      t("flows.streams.doneCount", { count: s.done }),
    ];
    if (s.attentionCount > 0)
      parts.push(t("flows.streams.attentionCount", { count: s.attentionCount }));
    parts.push(
      s.nextDue ? t("flows.streams.nextDue", { date: dueDate(s.nextDue) }) : t("flows.streams.noDue"),
    );
    return parts.join(", ");
  }

  /** Tooltip / accessible name for a marker on a collapsed stream line. */
  function streamNodeLabel(s: StreamSummary, node: FlowNode, count: number): string {
    const when = formatWeekdayDayMonth(node.ms, node.kind === "due" ? "UTC" : timeZone, locale);
    const what =
      node.kind === "done"
        ? t("flows.streams.nodeDone", { count })
        : node.overdue
          ? t("flows.streams.nodeOverdue", { count })
          : t("flows.streams.nodeDue", { count });
    return `${s.label}: ${what} · ${when}`;
  }

  /** Localized tooltip / accessible name for a node. */
  function nodeLabel(node: FlowNode, task: TaskRow): string {
    const kindKey =
      node.kind === "due" ? (node.overdue ? "overdue" : "due") : node.kind;
    // A due marker sits at the date token's UTC midnight, so it is formatted
    // in UTC to name the same calendar day in every zone.
    const when =
      node.kind === "due"
        ? formatWeekdayDayMonth(node.ms, "UTC", locale)
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

  /** A task's whole-subtree progress, for its runway's fill. */
  const progressOf = useCallback(
    (taskId: string) => progressDeep(taskId, childrenByParent),
    [childrenByParent],
  );

  /** The short label beside a runway: "due tomorrow", "Sat", "19 Nov", "2 days over". */
  function runwayShort(seg: FlowSegment, r: Runway): string | null {
    const label = runwayDueLabel(r, seg.task.dueDate, today);
    if (!label) return null;
    switch (label.kind) {
      case "today":
        return t("flows.runway.dueToday");
      case "tomorrow":
        return t("flows.runway.dueTomorrow");
      case "over":
        return t("flows.runway.over", { count: label.days });
      case "weekday":
        return format(dateInputToUtcMs(label.dueDate), "EEE", {
          in: tz("UTC"),
          locale: dateFnsLocale(locale),
        });
      case "date":
        return formatDayMonthToken(label.dueDate, locale);
    }
  }

  /** "Draft the literature review: due tomorrow, 2 of 5 subtasks done". */
  function runwayLabel(seg: FlowSegment, r: Runway): string {
    const parts: string[] = [];
    const due = seg.task.dueDate;
    if (r.state === "done") {
      parts.push(
        t("flows.runway.doneOn", { date: formatWeekdayDayMonth(r.endMs, timeZone, locale) }),
      );
    } else {
      if (r.state === "planned") {
        parts.push(
          t("flows.runway.startsOn", {
            date: formatWeekdayDayMonth(r.startMs, timeZone, locale),
          }),
        );
      }
      if (!due) parts.push(t("flows.runway.noDeadline"));
      else if (r.state === "late") {
        parts.push(t("flows.runway.over", { count: Math.max(1, -daysUntil(due, today)) }));
        parts.push(t("flows.runway.dueOn", { date: dueDate(due) }));
      } else {
        const days = daysUntil(due, today);
        parts.push(days >= 2 ? `${dueWords(days)} (${dueDate(due)})` : dueWords(days));
      }
    }
    if (r.subtasks.total > 0) {
      parts.push(
        t("flows.runway.subtasks", { done: r.subtasks.done, total: r.subtasks.total }),
      );
    }
    return `${seg.task.title}: ${parts.join(", ")}`;
  }

  /**
   * A collapsed stream's stack on the canvas: the stream, then each runway it
   * shows ("thesis: Draft…: due tomorrow; Book…: 2 days over; 1 more task").
   * Distinct from the gutter row's "Show the tasks in …", which it mirrors.
   */
  function streamRunwayLabel(s: StreamSummary, runways: string[], hidden: number): string {
    const parts = [...runways];
    if (hidden > 0) parts.push(t("flows.runway.moreLabel", { count: hidden }));
    return `${s.label}: ${parts.join("; ")}`;
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
        collections={collections}
        members={[...members.values()]}
        tags={tagOptions}
        totalCount={tasks.length}
        filteredCount={filtered.length}
        savedStreams={savedStreams}
      />
    </ToolbarSlot>
  );

  // Tasks exist, but the filters hide them all — keep the Display menu reachable
  // so the user can clear the filter without leaving the view.
  if (filtered.length === 0) {
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
            variant="segmented"
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
              collisionDetection={dnd.collisionDetection}
              autoScroll={false}
              onDragStart={dnd.onDragStart}
              onDragOver={dnd.onDragOver}
              onDragEnd={dnd.onDragEnd}
              onDragCancel={dnd.onDragCancel}
            >
              <SortableContext items={dnd.ids} strategy={verticalListSortingStrategy}>
                {rows.map((row) =>
                  row.kind === "group" ? (
                    <GutterGroupHeader
                      key={`group-${row.key}`}
                      row={row}
                      t={t}
                      summaryLabel={row.summary ? streamSummaryLabel(row.summary) : null}
                      dueDate={shortDue}
                    />
                  ) : row.kind === "stream" ? (
                    <GutterStreamRow
                      key={`stream-${row.key}`}
                      row={row}
                      t={t}
                      summaryLabel={streamSummaryLabel(row.stream)}
                      dueDate={shortDue}
                      onToggle={() => toggleStream(row.key)}
                    />
                  ) : (
                    <GutterLaneRow
                      key={row.rowKey}
                      row={row}
                      nesting={dnd.nestTargetId === row.rowKey}
                      attention={reasons.get(row.lane.task.id) ?? null}
                      attentionLabel={attentionLabel}
                      attentionShort={attentionShort}
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
                  <div
                    style={{ opacity: dnd.nestTargetId ? 0.4 : 1 }}
                    className="flex items-center gap-1.5 rounded-md bg-card px-2 py-1.5 text-sm shadow-soft-lg ring-1 ring-border transition-opacity"
                  >
                    <GripVertical
                      className="size-4 shrink-0 text-muted-foreground/60"
                      aria-hidden
                    />
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: toPaletteStroke(
                          members.get(dnd.activeLane.task.ownerId)?.color ??
                            colorOf(dnd.activeLane.task),
                        ),
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
            streamNodeLabel={streamNodeLabel}
            onToggleStream={toggleStream}
            onOpenTask={actions.open}
            onOpenCheckpoint={(cp) => actions.openCheckpoint(cp.id)}
            onCanvasPlace={(taskId, atDate) => {
              const task = tasks.find((t) => t.id === taskId);
              if (task) actions.addCheckpoint(task, atDate);
            }}
            laneStyle={display.laneStyle}
            today={today}
            progressOf={progressOf}
            runwayLabel={runwayLabel}
            runwayShort={runwayShort}
            streamLabel={streamRunwayLabel}
            moreShort={(count) => t("flows.runway.more", { count })}
          />
        </div>
      </div>
    </div>
  );
}

type Translator = ReturnType<typeof useTranslations>;

/** The row's group key: `rowKey` is `${groupKey}:${taskId}` (a tag key may itself hold a colon). */
function groupKeyOf(row: LaneRow): string {
  return row.rowKey.slice(0, row.rowKey.length - row.lane.task.id.length - 1);
}

/**
 * A quiet "needs attention" mark: a chevron (one = soon, two = now) plus a
 * short text, so the level never rests on colour; overdue also turns the text
 * destructive and says "late" in words. The full reason is the accessible name.
 */
function AttentionMark({
  level,
  text,
  label,
  overdue,
}: {
  level: "high" | "medium";
  text: string;
  label: string;
  overdue?: boolean;
}) {
  const Icon = level === "high" ? ChevronsUp : ChevronUp;
  return (
    <span
      title={label}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-0.5 rounded-md pr-1.5 pl-0.5 text-[11px] leading-none tabular-nums",
        level === "high"
          ? "font-semibold text-foreground ring-1 ring-foreground/25 ring-inset"
          : "font-medium text-muted-foreground",
        overdue && "text-destructive ring-destructive/40",
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span aria-hidden>{text}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Attention level of a stream / group summary, when it reaches the bar. */
function summaryLevel(s: StreamSummary): "high" | "medium" | null {
  if (s.attentionCount === 0) return null;
  return s.attention.level === "high" ? "high" : "medium";
}

/** A group-by section header band in the gutter (mirrors the canvas band). */
function GutterGroupHeader({
  row,
  t,
  summaryLabel,
  dueDate,
}: {
  row: GroupHeaderRow;
  t: Translator;
  /** the group's spoken summary, when streams were built for it */
  summaryLabel: string | null;
  dueDate: (token: string) => string;
}) {
  const s = row.summary;
  const level = s ? summaryLevel(s) : null;
  return (
    <div
      className="absolute flex items-center gap-2 border-b border-border bg-muted/40 px-2"
      style={{ left: 0, top: row.top, width: G.gutterWidth, height: G.groupHeaderHeight }}
      title={summaryLabel ?? undefined}
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
      {s ? (
        <>
          <span
            className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground tabular-nums"
            aria-hidden
          >
            <span>{t("flows.streams.openCount", { count: s.open })}</span>
            {level && (
              <span
                className={cn(
                  "inline-flex items-center",
                  level === "high" && "font-semibold text-foreground",
                )}
              >
                {level === "high" ? (
                  <ChevronsUp className="size-3.5" />
                ) : (
                  <ChevronUp className="size-3.5" />
                )}
                {s.attentionCount}
              </span>
            )}
            {s.nextDue && <span>{dueDate(s.nextDue)}</span>}
          </span>
          <span className="sr-only">{summaryLabel}</span>
        </>
      ) : (
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground tabular-nums">
          {t("flows.streams.openCount", { count: row.count })}
        </span>
      )}
    </div>
  );
}

/**
 * A collapsed stream in the gutter: name (with its swatch where it has one),
 * counts, the attention mark and the next deadline. The whole row is the
 * expand control; its lanes follow beneath when open.
 */
function GutterStreamRow({
  row,
  t,
  summaryLabel,
  dueDate,
  onToggle,
}: {
  row: StreamRow;
  t: Translator;
  summaryLabel: string;
  dueDate: (token: string) => string;
  onToggle: () => void;
}) {
  const s = row.stream;
  const level = summaryLevel(s);
  return (
    <div
      className="absolute border-b border-border bg-muted/25"
      style={{ left: 0, top: row.top, width: G.gutterWidth, height: G.streamHeight }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={row.isExpanded}
        aria-label={`${t(row.isExpanded ? "flows.streams.collapse" : "flows.streams.expand", {
          name: row.label,
        })}. ${summaryLabel}`}
        title={summaryLabel}
        className="flex size-full items-start gap-1.5 px-2 pt-2 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset hover:bg-muted/50"
      >
        <span className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground">
          <ChevronRight
            className={cn(
              "size-4 transition-transform motion-reduce:transition-none",
              row.isExpanded && "rotate-90",
            )}
            aria-hidden
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5" aria-hidden>
          <span className="flex h-5 min-w-0 items-center gap-1.5">
            {row.color && (
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: toPaletteStroke(row.color) }}
              />
            )}
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.label}</span>
            {level && (
              <AttentionMark
                level={level}
                text={String(s.attentionCount)}
                label={t("flows.streams.attentionCount", { count: s.attentionCount })}
                overdue={s.overdue > 0}
              />
            )}
          </span>
          <span className="truncate text-xs text-muted-foreground tabular-nums">
            {t("flows.streams.openCount", { count: s.open })}
            {/* Done counts only lead when nothing is open; otherwise the done
                marks on the line (and the spoken summary) carry them, which keeps
                the next deadline on screen in Russian too. */}
            {s.open === 0 && s.done > 0 && (
              <> · {t("flows.streams.doneCount", { count: s.done })}</>
            )}
            {s.overdue > 0 && (
              <span className="text-destructive">
                {" "}
                · {t("flows.streams.overdueCount", { count: s.overdue })}
              </span>
            )}
            {s.nextDue && <> · {t("flows.streams.nextDueShort", { date: dueDate(s.nextDue) })}</>}
          </span>
        </span>
      </button>
    </div>
  );
}

/**
 * One gutter lane row. A `useSortable` node carries the absolute `top` plus the
 * drag transform; the grip handle is the only drag activator, so the title stays
 * click-to-open. Dragging always works (it powers drag-to-nest); reordering only
 * persists in manual sort. `nesting` highlights this row as a pending drop
 * target. Subtask branch rows render beneath, outside the sortable node.
 */
function GutterLaneRow({
  row,
  nesting,
  attention,
  attentionLabel,
  attentionShort,
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
  nesting: boolean;
  /** why this lane needs attention now, or null */
  attention: AttentionReason | null;
  attentionLabel: (r: AttentionReason) => string;
  attentionShort: (r: AttentionReason) => string;
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
  // Row-keyed (not task-keyed): a multi-tag task has one row per tag group.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.rowKey,
  });
  // A second droppable over the lane row, so the centre-band collision can resolve
  // a nest without the sortable reorder reflow sliding the target away.
  const { setNodeRef: setNestRef } = useDroppable({ id: `${NEST_PREFIX}${row.rowKey}` });
  const setRefs = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    setNestRef(node);
  };

  return (
    <div>
      <div
        ref={setRefs}
        className={cn(
          "absolute flex items-center gap-1.5 px-2",
          lane.done && "opacity-60",
          isDragging && "z-10 opacity-50",
          nesting && "z-10 rounded-md bg-primary/10 ring-2 ring-primary",
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
        <button
          type="button"
          aria-label={t("flows.dnd.handle", { title: lane.task.title })}
          className="grid size-5 shrink-0 cursor-grab touch-none place-items-center rounded text-muted-foreground/40 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
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
            style={{ color: toPaletteStroke(ownerColor) }}
            aria-label={t("flows.milestone.label")}
          />
        ) : (
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: toPaletteStroke(ownerColor) }}
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
        {attention && attention.level !== "none" && attention.level !== "low" && (
          <AttentionMark
            level={attention.level}
            text={attentionShort(attention)}
            label={attentionLabel(attention)}
            overdue={attention.days !== null && attention.days < 0}
          />
        )}
        {nesting && (
          <CornerDownRight className="size-4 shrink-0 text-primary" aria-hidden />
        )}
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
            onPromote={() => actions.promote(branch.task)}
          >
            <button
              type="button"
              onClick={() => actions.open(branch.task)}
              className={cn(
                "absolute truncate rounded pr-2 text-left text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                branch.task.completedAt != null && "line-through",
              )}
              style={{
                left: 0,
                top: subTop,
                width: G.gutterWidth,
                height: G.subRowHeight,
                // base indent (past the lane's grip/twisty) + one step per level
                paddingLeft: 36 + (branch.depth - 1) * 16,
              }}
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
