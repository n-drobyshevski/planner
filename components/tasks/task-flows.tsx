"use client";

// Flows — the third task view. A GitKraken-style lifecycle graph: each
// top-level task is a horizontal trunk on a left->right timeline, subtasks
// branch off and merge back, and nodes mark recorded status changes. Desktop-
// only (the shell falls back to List on phones); time runs left->right over a
// scrollable, zoomable date axis. Layout math is pure (lib/tasks/flows-layout);
// this file owns the scroll frame, ruler, gutter, zoom, and empty/loading.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronRight, CalendarRange, LocateFixed } from "lucide-react";
import { startOfDay, startOfWeek, startOfMonth, addDays, addMonths, format } from "date-fns";
import { tz } from "@date-fns/tz";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useViewerTimeZone } from "@/lib/datetime/timezone-context";
import { dateFnsLocale } from "@/lib/datetime/date-locale";
import { formatTime, formatWeekdayDayMonth } from "@/lib/datetime/format";
import {
  DAY_MS,
  FLOW_GEOM,
  buildFlowLanes,
  flowsWindow,
  layoutRows,
  xForTime,
  type FlowNode,
} from "@/lib/tasks/flows-layout";
import { FlowTrack } from "./flows/flow-track";
import { TaskContextMenu } from "./task-context-menu";
import type { TaskActions } from "./task-actions";
import type { Member, TaskRow, TaskStatusEvent } from "@/lib/types";

const G = FLOW_GEOM;
const ZOOM = { month: 9, week: 26, day: 80 } as const;
const ZOOM_MIN = 6;
const ZOOM_MAX = 160;
type Density = keyof typeof ZOOM;

export interface TaskFlowsProps {
  tasks: TaskRow[]; // top-level tasks only
  childrenByParent: Map<string | null, TaskRow[]>;
  eventsByTask: Map<string, TaskStatusEvent[]>;
  colorOf: (t: TaskRow) => string;
  members: Map<string, Member>;
  currentMemberId: string | null;
  actions: TaskActions;
  /** status-event history still loading (tasks may already be ready) */
  loading?: boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function TaskFlows({
  tasks,
  childrenByParent,
  eventsByTask,
  colorOf,
  members,
  currentMemberId,
  actions,
  loading,
}: TaskFlowsProps) {
  const t = useTranslations("tasks");
  const locale = useLocale();
  const timeZone = useViewerTimeZone();
  const scrollRef = useRef<HTMLDivElement>(null);
  const didCenter = useRef(false);

  // Captured once: a minute of drift in the now-line is invisible, and a stable
  // value keeps the memoized model from thrashing.
  const [nowMs] = useState(() => Date.now());
  const [pxPerDay, setPxPerDay] = useState<number>(ZOOM.week);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // Measured scroll-viewport size. Width drives the side padding that lets the
  // now-line reach the track centre even when the data is narrower than the
  // screen; height lets the gutter + track fill the view instead of stopping at
  // the last lane. Measured before paint so centring doesn't flicker.
  const [viewportW, setViewportW] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  const lanes = useMemo(
    () => buildFlowLanes({ topLevel: tasks, childrenByParent, eventsByTask, nowMs }),
    [tasks, childrenByParent, eventsByTask, nowMs],
  );
  // The data window is the meaningful extent; the render window pads each side
  // by half the visible track so any point (incl. "now") can be scrolled to the
  // centre. The pad is empty but dated — it reads as scroll/planning slack.
  const data = useMemo(() => flowsWindow(lanes, nowMs), [lanes, nowMs]);
  const visibleTrack = Math.max(0, viewportW - G.gutterWidth);
  const padMs = pxPerDay > 0 ? ((visibleTrack / 2) / pxPerDay) * DAY_MS : 0;
  const t0 = data.t0 - padMs; // render origin (left pad)
  const t1 = data.t1 + padMs; // render right edge (right pad)
  const { rows, totalHeight } = useMemo(
    () => layoutRows(lanes, expanded),
    [lanes, expanded],
  );
  const trackWidth = Math.ceil(((t1 - t0) / DAY_MS) * pxPerDay);
  // Fill the viewport below the ruler so the gutter + track don't stop at the
  // last lane; grow past it (and scroll) when there are more lanes than fit.
  const fillHeight = Math.max(totalHeight, viewportH - G.rulerHeight);

  const ticks = useMemo(
    () => buildTicks(t0, t1, pxPerDay, timeZone, locale),
    [t0, t1, pxPerDay, timeZone, locale],
  );
  const gridMs = useMemo(() => ticks.map((tk) => tk.ms), [ticks]);

  // Track the viewport width (initial + on resize) for the side padding.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      setViewportW(el.clientWidth);
      setViewportH(el.clientHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Ctrl/Cmd + wheel zooms the time axis (a non-passive listener so we can
  // preventDefault the page scroll).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setPxPerDay((p) => clamp(p * (e.deltaY < 0 ? 1.15 : 0.87), ZOOM_MIN, ZOOM_MAX));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function scrollToNow() {
    const el = scrollRef.current;
    if (!el) return;
    const nowX = xForTime(Math.min(nowMs, t1), t0, pxPerDay);
    const viewport = el.clientWidth - G.gutterWidth;
    el.scrollLeft = Math.max(0, nowX - viewport / 2);
  }

  // Centre the now-line once the viewport is measured and there's data — in a
  // layout effect (before paint) so the padded track is already in the DOM and
  // there's no left-aligned flash before it settles on centre.
  useLayoutEffect(() => {
    if (didCenter.current || viewportW === 0 || rows.length === 0) return;
    didCenter.current = true;
    scrollToNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot centering on first layout
  }, [viewportW, rows.length]);

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

  return (
    <div ref={scrollRef} className="relative h-full overflow-auto">
      {/* sticky ruler */}
      <div className="sticky top-0 z-20 flex" style={{ height: G.rulerHeight }}>
        <div
          className="sticky left-0 z-30 flex shrink-0 items-center gap-1 overflow-hidden border-r border-b border-border bg-card px-2"
          style={{ width: G.gutterWidth, height: G.rulerHeight }}
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
        <div
          className="relative shrink-0 border-b border-border bg-background"
          style={{ width: trackWidth, height: G.rulerHeight }}
        >
          {ticks.map((tk, i) => {
            const x = xForTime(tk.ms, t0, pxPerDay);
            // A boundary tick can land before the window start (negative x);
            // its gridline is clipped by the SVG, and the label would bleed
            // under the sticky corner, so skip it.
            if (x < 0) return null;
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
        </div>
      </div>

      {/* body: sticky gutter + graph track */}
      <div className="flex">
        <div
          className="sticky left-0 z-10 shrink-0 border-r border-border bg-card"
          style={{ width: G.gutterWidth, height: fillHeight }}
        >
          {rows.map(({ lane, top, isExpanded, branchRows }) => {
            const ownerColor = members.get(lane.task.ownerId)?.color ?? colorOf(lane.task);
            const hasChildren = lane.branches.length > 0;
            return (
              <div key={lane.task.id}>
                <div
                  className={cn(
                    "absolute flex items-center gap-2 px-2",
                    lane.done && "opacity-60",
                  )}
                  style={{ left: 0, top, width: G.gutterWidth, height: G.laneHeight }}
                >
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
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: ownerColor }}
                    aria-hidden
                  />
                  <TaskContextMenu
                    task={lane.task}
                    onOpen={() => actions.open(lane.task)}
                    onToggleDone={() => actions.toggleDone(lane.task)}
                    onDelete={() => actions.remove(lane.task)}
                    onChangeColor={(c) => actions.changeColor(lane.task, c)}
                  >
                    <button
                      type="button"
                      onClick={() => actions.open(lane.task)}
                      className={cn(
                        "min-w-0 flex-1 truncate text-left text-sm rounded focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        lane.done && "line-through",
                      )}
                    >
                      {lane.task.title}
                    </button>
                  </TaskContextMenu>
                </div>

                {isExpanded &&
                  branchRows.map(({ branch, subTop }) => (
                    <button
                      key={branch.task.id}
                      type="button"
                      onClick={() => actions.open(branch.task)}
                      className={cn(
                        "absolute truncate pl-9 pr-2 text-left text-xs text-muted-foreground rounded focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        branch.task.status === "done" && "line-through",
                      )}
                      style={{ left: 0, top: subTop, width: G.gutterWidth, height: G.subRowHeight }}
                    >
                      {branch.task.title}
                    </button>
                  ))}
              </div>
            );
          })}
        </div>

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
          currentMemberId={currentMemberId}
          nodeLabel={nodeLabel}
          onOpenTask={actions.open}
        />
      </div>
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
