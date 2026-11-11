"use client";

// The graph track: trunks, subtask branches, and status nodes drawn in one SVG
// (purely visual, aria-hidden), with an HTML <button> over each node for the
// real focus ring, keyboard access, and hover tooltip. Pixel math comes from
// lib/tasks/flows-layout (pure); this file only paints.
//
// Three task archetypes share the track:
//   · span         — a trunk line from start to completion / now (the default).
//   · planned span — a future start that hasn't begun: a dotted lead from the
//                    now-line to a hollow planned-start ring (no trunk yet).
//   · milestone    — a point-in-time task: a single "moment" marker, no line.
// Future / not-yet-real markers borrow the calendar's dotted = "pencilled in"
// language; ownership reads as filled (mine) vs outlined (a partner's).

import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import type {
  FlowBranch,
  FlowCheckpoint,
  FlowNode,
  FlowRow,
  FlowSegment,
  StreamRow,
} from "@/lib/tasks/flows-layout";
import type { StreamSummary } from "@/lib/tasks/flows-streams";
import { DAY_MS, FLOW_GEOM, xForTime, timeForX } from "@/lib/tasks/flows-layout";
import { runwayOf, stackSlots, type Runway } from "@/lib/tasks/flows-runway";
import type { FlowsLaneStyle } from "@/lib/tasks/flows-display";
import { RunwayBar, RunwayHatch, labelWidth, runwayExtent } from "./flow-runway";
import {
  depAnchors,
  depArrows,
  depDimmed,
  type DepEdgeIn,
} from "@/lib/tasks/flows-deps";
import {
  lineStyleStroke,
  wavePath,
  type FlowLineStyle,
} from "@/lib/tasks/flow-line-styles";
import { toPaletteStroke } from "@/lib/theme/appearance";
import { msToDateInput } from "@/lib/datetime/local";
import type { TaskRow } from "@/lib/types";
import type { Phase } from "@/lib/tasks/task-state";

const G = FLOW_GEOM;
const HIT = 26; // node hit-target (px); Flows is desktop-only, so < 44 is fine
const ELBOW = 12; // horizontal run of a branch diverge/merge curve
const DOTS = "2 2.5"; // dash pattern for "planned / not yet real" strokes
const RUNWAY_FADE_PX = 64; // how far an open-ended runway reaches past now before it has faded

export interface FlowTrackProps {
  rows: FlowRow[];
  /** full canvas height — fills the viewport so gridlines/now-line run the whole height */
  height: number;
  t0: number;
  t1: number;
  pxPerDay: number;
  trackWidth: number;
  nowMs: number;
  /** day/week/month tick timestamps; drawn as faint vertical gridlines */
  gridMs: number[];
  colorOf: (t: TaskRow) => string;
  /** the Flows line style for a task, resolved from its board (state). */
  lineStyleOf: (t: TaskRow) => FlowLineStyle;
  currentMemberId: string | null;
  /** viewer's IANA zone — maps a canvas click x to a zone-correct date token */
  timeZone: string;
  /** localized tooltip / aria text for a node */
  nodeLabel: (node: FlowNode, task: TaskRow) => string;
  /** localized tooltip / aria text for a milestone or planned-start marker */
  segmentLabel: (seg: FlowSegment) => string;
  /** localized tooltip / aria text for a checkpoint marker */
  checkpointLabel: (cp: FlowCheckpoint, task: TaskRow) => string;
  /** localized tooltip / aria text for a (possibly stacked) marker on a stream line */
  streamNodeLabel: (stream: StreamSummary, node: FlowNode, count: number) => string;
  /** expand / collapse a stream's lanes (a stream marker's click) */
  onToggleStream: (key: string) => void;
  onOpenTask: (t: TaskRow) => void;
  /** open the checkpoint editor for an existing marker */
  onOpenCheckpoint: (cp: FlowCheckpoint) => void;
  /** click on empty trunk at a date: place a new checkpoint there (create mode) */
  onCanvasPlace: (taskId: string, atDate: string) => void;
  /** "runway" (default): bars from start to deadline; "line": the thin trunk lines */
  laneStyle?: FlowsLaneStyle;
  /** the viewer's calendar day ("yyyy-MM-dd"): what "late" and "due tomorrow" count from */
  today?: string;
  /** a task's subtree progress (done / total subtasks), for the runway fill */
  progressOf?: (taskId: string) => { done: number; total: number };
  /** localized tooltip / accessible name for a runway bar */
  runwayLabel?: (seg: FlowSegment, r: Runway) => string;
  /** the short deadline label drawn beside a bar, or null for none */
  runwayShort?: (seg: FlowSegment, r: Runway) => string | null;
  /**
   * accessible name for a collapsed stream's runway stack (it expands the
   * stream): the stream, each shown runway's own label, and how many more
   */
  streamLabel?: (stream: StreamSummary, runways: string[], hidden: number) => string;
  /** the visible "+N" after a stream's stack when not every runway fits */
  moreShort?: (count: number) => string;
  /**
   * Every waits-for edge in scope. While a runway is hovered or focused, its
   * links to bars on screen are drawn as elbow arrows and other bars dim.
   */
  deps?: readonly DepEdgeIn[];
  /** tasks waiting on an unfinished dependency: their bars carry a padlock */
  blockedIds?: ReadonlySet<string>;
  /** a task's states over time (runway style): its bar is cut where they change */
  phasesOf?: (task: TaskRow) => readonly Phase[] | undefined;
}

const NO_PROGRESS = { done: 0, total: 0 };

interface Hover {
  x: number;
  y: number;
  text: string;
}

export function FlowTrack({
  rows,
  height,
  t0,
  t1,
  pxPerDay,
  trackWidth,
  nowMs,
  gridMs,
  colorOf,
  lineStyleOf,
  currentMemberId,
  timeZone,
  nodeLabel,
  segmentLabel,
  checkpointLabel,
  streamNodeLabel,
  onToggleStream,
  onOpenTask,
  onOpenCheckpoint,
  onCanvasPlace,
  laneStyle = "line",
  today,
  progressOf,
  runwayLabel,
  runwayShort,
  streamLabel,
  moreShort,
  deps,
  blockedIds,
  phasesOf,
}: FlowTrackProps) {
  const [hover, setHover] = useState<Hover | null>(null);
  // The runway under the pointer or keyboard focus: its dependency links show.
  const [activeId, setActiveId] = useState<string | null>(null);
  // The canvas's horizontal scroll offset (runway style only): a bar that starts
  // off screen keeps its title at the visible left edge instead of clipping it.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [viewLeft, setViewLeft] = useState(0);
  useEffect(() => {
    const scroller = rootRef.current?.parentElement;
    if (laneStyle !== "runway" || !scroller) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      setViewLeft(scroller.scrollLeft);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [laneStyle]);
  const x = (ms: number) => xForTime(ms, t0, pxPerDay);
  const nowX = x(Math.min(nowMs, t1));
  // SVG ids (clip paths, masks, the hatch) must be unique in the document and
  // url-safe; React's useId carries colons / guillemets, so strip them.
  const uid = `fr${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const hatchId = `${uid}-hatch`;
  const runways = laneStyle === "runway";
  const fadeMs = (RUNWAY_FADE_PX / pxPerDay) * DAY_MS;
  /** A segment's runway in runway style (null in line style, or for a milestone). */
  const runwayFor = (seg: FlowSegment): Runway | null =>
    runways
      ? runwayOf(seg, nowMs, progressOf?.(seg.task.id) ?? NO_PROGRESS, { today, fadeMs })
      : null;
  /**
   * A collapsed stream's stack (runway style): its open tasks' runways, or its
   * finished ones when nothing is open, as many as fit the row; the rest are "+N".
   */
  const streamStack = (row: StreamRow) => {
    const open = row.stream.lanes.filter((l) => !l.done);
    const pool = open.length > 0 ? open : row.stream.lanes;
    const items = pool.flatMap((lane) => {
      const r = runwayFor(lane);
      return r ? [{ lane, r }] : [];
    });
    const slots = stackSlots(items.length, row.height);
    const shown = items.slice(0, slots.shown).map((it, i) => ({
      ...it,
      cy: row.top + slots.tops[i] + slots.barHeight / 2,
      ...runwayExtent(it.r, x, slots.barHeight),
    }));
    const minX = shown.length ? Math.min(...shown.map((s) => s.x1)) : 0;
    const maxX = shown.length ? Math.max(...shown.map((s) => s.reach)) : 0;
    return { shown, hidden: slots.hidden, barHeight: slots.barHeight, minX, maxX };
  };

  // Dependency connectors for the active runway (runway style only).
  const anchors = runways
    ? depAnchors(rows, (seg, h) => {
        const r = runwayFor(seg);
        if (!r) return null;
        const e = runwayExtent(r, x, h);
        return { x1: e.x1, x2: e.x2 };
      })
    : new Map();
  const arrows = depArrows(activeId, deps ?? [], anchors);
  // Dim only when there is a link to show; a lone task needs no spotlight.
  const dimmed = arrows.length > 0 ? depDimmed(activeId, deps ?? [], anchors) : new Set<string>();
  const dimOf = (id: string) => (dimmed.has(id) ? 0.35 : 1);

  // Click on empty trunk → place a checkpoint at that date. A click that landed
  // on a node/marker/checkpoint hit-button is ignored (that button opens/edits
  // instead); only a band centered on a lane's trunk line (not the row's edges
  // or the branch area below) accepts a placement, so it reads as "click the
  // trunk", not "click anywhere".
  function onTrackClick(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    for (const row of rows) {
      if (row.kind !== "lane") continue;
      const trunkY = row.top + G.laneHeight / 2;
      if (Math.abs(py - trunkY) > HIT / 2) continue; // not on this lane's trunk band
      onCanvasPlace(row.lane.task.id, msToDateInput(timeForX(px, t0, pxPerDay), timeZone));
      return;
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      style={{ width: trackWidth, height }}
      onMouseLeave={() => setHover(null)}
      onClick={onTrackClick}
    >
      <svg
        width={trackWidth}
        height={height}
        className="absolute inset-0"
        aria-hidden
      >
        {runways && (
          <defs>
            <RunwayHatch id={hatchId} />
          </defs>
        )}
        {/* faint day/week/month gridlines behind the lanes */}
        {gridMs.map((ms, i) => {
          const gx = x(ms);
          return (
            <line
              key={`grid-${i}`}
              x1={gx}
              y1={0}
              x2={gx}
              y2={height}
              stroke="var(--border)"
              strokeOpacity={0.6}
            />
          );
        })}
        {rows.map((row, ri) => {
          // A group-by section band: a faint full-width tint + a divider under
          // it, aligned to the gutter's header row by sharing `top`/`height`.
          if (row.kind === "group") {
            return (
              <g key={`group-${row.key}`} aria-hidden>
                <rect
                  x={0}
                  y={row.top}
                  width={trackWidth}
                  height={row.height}
                  fill="var(--muted)"
                  opacity={0.35}
                />
                <line
                  x1={0}
                  y1={row.top + row.height}
                  x2={trackWidth}
                  y2={row.top + row.height}
                  stroke="var(--border)"
                />
              </g>
            );
          }
          if (row.kind === "stream" && runways) {
            const stack = streamStack(row);
            return (
              <g key={`stream-${row.key}`} aria-hidden>
                <StreamBand row={row} trackWidth={trackWidth} />
                {stack.shown.map(({ lane, r, cy }, i) => (
                  <RunwayBar
                    key={lane.task.id}
                    uid={`${uid}-s${row.top}-${i}`}
                    r={r}
                    x={x}
                    cy={cy}
                    h={stack.barHeight}
                    color={toPaletteStroke(colorOf(lane.task))}
                    mine={lane.task.ownerId === currentMemberId}
                    nowX={nowX}
                    hatchId={hatchId}
                    small
                  />
                ))}
                {stack.hidden > 0 && moreShort && (
                  <text
                    x={plusX(stack.maxX, nowX, moreShort(stack.hidden))}
                    y={row.top + row.height / 2}
                    dominantBaseline="central"
                    fontSize={11}
                    fontWeight={600}
                    fill="var(--muted-foreground)"
                    className="tabular-nums"
                  >
                    {moreShort(stack.hidden)}
                  </text>
                )}
              </g>
            );
          }
          if (row.kind === "stream") {
            return (
              <StreamLine
                key={`stream-${row.key}`}
                row={row}
                x={x}
                nowMs={nowMs}
                t1={t1}
                trackWidth={trackWidth}
              />
            );
          }
          const { lane, top, branchRows } = row;
          // Theme-mapped, stroke-legible color — feeds every trunk/branch/node
          // stroke and the checkpoint lane fallback below, so the whole lane
          // re-tints with the palette and stays visible on light pastel surfaces.
          const color = toPaletteStroke(colorOf(lane.task));
          const mine = lane.task.ownerId === currentMemberId;
          const trunkY = top + G.laneHeight / 2;
          const startX = x(lane.startMs);
          const isFuture = lane.startMs > nowMs;
          // Stroke recipe for this lane's state (its board's line style). A
          // subtask branch can't carry a true sine, so wavy falls back to a fine
          // dash there; each branch uses its own task's state below.
          const stroke = lineStyleStroke(lineStyleOf(lane.task));
          // A not-yet-started task with a future start has no elapsed span to draw.
          const planned = !lane.milestone && isFuture && lane.endMs === null;
          const endX = x(lane.endMs ?? Math.min(nowMs, t1));
          // How far an open line reaches into the future: the furthest booked block
          // or deadline ahead of now (else just `now`). Drives the grayed, dotted
          // "planned ahead" extension past the now-line.
          const reach = lane.endMs === null ? futureReachMs(lane, nowMs) : nowMs;
          const reachX = x(Math.min(reach, t1));
          const hasFuture = reach > nowMs;
          // A milestone / planned-start segment carries its status in the marker,
          // so only deadline (`due`) and scheduled-block markers are drawn as
          // nodes; a real span shows every node.
          // Runway style: the bar's edges and fill carry start, deadline and
          // progress, so only booked-time tiles stay on it as nodes (status
          // dots would sit on the title); checkpoints stay as their own overlay.
          const rw = runwayFor(lane);
          const trunkNodes = rw
            ? lane.nodes.filter((n) => n.kind === "scheduled")
            : lane.milestone || planned
              ? lane.nodes.filter((n) => n.kind === "due" || n.kind === "scheduled")
              : lane.nodes;
          return (
            // A runway draws its own muted "done" state; dimming the whole group
            // would also dim the title inside the bar below AAA.
            <g key={row.rowKey} opacity={lane.done && !rw ? 0.55 : 1}>
              {rw ? (
                <g opacity={dimOf(lane.task.id)} className="transition-opacity motion-reduce:transition-none">
                <RunwayBar
                  uid={`${uid}-l${ri}`}
                  r={rw}
                  x={x}
                  cy={trunkY}
                  h={G.runwayHeight}
                  color={color}
                  mine={mine}
                  nowX={nowX}
                  hatchId={hatchId}
                  viewLeft={viewLeft}
                  title={lane.task.title}
                  short={runwayShort?.(lane, rw) ?? null}
                  blocked={blockedIds?.has(lane.task.id)}
                  phases={phasesOf?.(lane.task)}
                />
                </g>
              ) : lane.milestone ? (
                <>
                  {!lane.done && (
                    <DottedLead x1={nowX} x2={startX} y={trunkY} color={color} mine={mine} />
                  )}
                  <MomentMarker
                    cx={startX}
                    cy={trunkY}
                    color={color}
                    mine={mine}
                    done={lane.done}
                    future={isFuture}
                  />
                </>
              ) : planned ? (
                <>
                  {/* lead reaches the furthest of the planned start and any booked
                      block / deadline ahead, so those markers connect too */}
                  <DottedLead
                    x1={nowX}
                    x2={Math.max(startX, reachX)}
                    y={trunkY}
                    color={color}
                    mine={mine}
                  />
                  <PlannedStartRing cx={startX} cy={trunkY} color={color} mine={mine} />
                </>
              ) : (
                <>
                  {/* trunk — drawn in the collection's line style (wavy = sine path) */}
                  {stroke.wavy ? (
                    <path
                      d={wavePath(startX, endX, trunkY)}
                      fill="none"
                      stroke={color}
                      strokeWidth={G.trunkWidth}
                      strokeOpacity={(mine ? 1 : 0.5) * stroke.opacityScale}
                      strokeLinecap="round"
                    />
                  ) : (
                    <line
                      x1={startX}
                      y1={trunkY}
                      x2={endX}
                      y2={trunkY}
                      stroke={color}
                      strokeWidth={G.trunkWidth}
                      strokeOpacity={(mine ? 1 : 0.5) * stroke.opacityScale}
                      strokeDasharray={stroke.dasharray}
                      strokeLinecap="round"
                    />
                  )}
                  {/* open end: a grayed, dotted continuation out to the next booked
                      block / deadline ahead, else a soft "still open" chevron at now */}
                  {lane.endMs === null &&
                    (hasFuture ? (
                      <FutureExtension
                        x1={nowX}
                        x2={reachX}
                        y={trunkY}
                        color={color}
                        mine={mine}
                        width={G.trunkWidth}
                      />
                    ) : (
                      <OpenCap x={endX} y={trunkY} color={color} mine={mine} />
                    ))}
                </>
              )}
              {/* subtask branches (only present when the lane is expanded), each
                  drawn in its own state's line style. A branch diverges from its
                  PARENT's row (the trunk at depth 1, else its parent branch row)
                  so nested branches read as a tree, not all off the trunk. */}
              {(() => {
                const branchY = new Map<string, number>();
                for (const { branch, subTop } of branchRows)
                  branchY.set(branch.task.id, subTop + G.subRowHeight / 2);
                const fromYOf = (b: FlowBranch) =>
                  b.depth <= 1 ? trunkY : branchY.get(b.parentId) ?? trunkY;
                // Runway style: a thin tick from the parent's bar down to each
                // branch bar at the branch's start, so nested runways still read
                // as a tree. All ticks go first, so the bars cover any tick that
                // passes behind a sibling's bar on its way down.
                const ticks = branchRows.map(({ branch, subTop }) => {
                  const brw = runwayFor(branch);
                  if (!brw) return null;
                  const parentH = branch.depth <= 1 ? G.runwayHeight : G.branchRunwayHeight;
                  const bx = Math.max(0, x(brw.startMs)) + 3;
                  return (
                    <line
                      key={`tick-${branch.task.id}`}
                      x1={bx}
                      y1={fromYOf(branch) + parentH / 2}
                      x2={bx}
                      y2={subTop + G.subRowHeight / 2 - G.branchRunwayHeight / 2}
                      stroke={color}
                      strokeOpacity={0.45}
                      strokeWidth={1}
                    />
                  );
                });
                return [...ticks, ...branchRows.map(({ branch, subTop }, bi) => {
                  const brw = runwayFor(branch);
                  if (brw) {
                    const subY = subTop + G.subRowHeight / 2;
                    return (
                      <g
                        key={branch.task.id}
                        opacity={dimOf(branch.task.id)}
                        className="transition-opacity motion-reduce:transition-none"
                      >
                        <RunwayBar
                          uid={`${uid}-l${ri}-b${bi}`}
                          r={brw}
                          x={x}
                          cy={subY}
                          h={G.branchRunwayHeight}
                          color={color}
                          mine={branch.task.ownerId === currentMemberId}
                          nowX={nowX}
                          hatchId={hatchId}
                          viewLeft={viewLeft}
                          title={branch.task.title}
                          short={runwayShort?.(branch, brw) ?? null}
                          blocked={blockedIds?.has(branch.task.id)}
                          phases={phasesOf?.(branch.task)}
                          small
                        />
                      </g>
                    );
                  }
                  const bStroke = lineStyleStroke(lineStyleOf(branch.task));
                  return (
                    <Branch
                      key={branch.task.id}
                      branch={branch}
                      fromY={fromYOf(branch)}
                      subY={subTop + G.subRowHeight / 2}
                      x={x}
                      color={color}
                      mine={branch.task.ownerId === currentMemberId}
                      nowMs={nowMs}
                      t1={t1}
                      dasharray={bStroke.wavy ? "2 3" : bStroke.dasharray}
                      opacityScale={bStroke.opacityScale}
                    />
                  );
                })];
              })()}
              {/* trunk nodes */}
              {trunkNodes.map((n, i) => (
                <NodeShape key={i} node={n} cx={x(n.ms)} cy={trunkY} color={color} />
              ))}
              {/* user-placed checkpoints — an independent overlay drawn on the
                  trunk regardless of the lane archetype (span / milestone / planned) */}
              {lane.checkpoints.map((cp) => (
                <CheckpointMarker
                  key={cp.id}
                  cp={cp}
                  cx={x(cp.ms)}
                  cy={trunkY}
                  laneColor={color}
                  mine={mine}
                  nowMs={nowMs}
                />
              ))}
              {/* branch nodes (a milestone branch carries its status in its marker) */}
              {branchRows.map(({ branch, subTop }) =>
                (runways && !branch.milestone
                  ? branch.nodes.filter((n) => n.kind === "scheduled")
                  : branch.milestone
                    ? branch.nodes.filter((n) => n.kind === "due" || n.kind === "scheduled")
                    : branch.nodes
                ).map((n, i) => (
                  <NodeShape
                    key={`${branch.task.id}-${i}`}
                    node={n}
                    cx={x(n.ms)}
                    cy={subTop + G.subRowHeight / 2}
                    color={color}
                    small
                  />
                )),
              )}
            </g>
          );
        })}
        {/* the active runway's waits-for links: blocker end → waiting start */}
        {arrows.map((a) => (
          <g key={`dep-${a.from}-${a.to}`} className="pointer-events-none">
            <path
              d={a.d}
              fill="none"
              stroke="var(--foreground)"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
            <path
              d={`M ${a.head.x} ${a.head.y} l -6 -4 v 8 z`}
              fill="var(--foreground)"
            />
          </g>
        ))}
      </svg>

      {/* now-line — the one place the terracotta accent appears (a state marker) */}
      {nowX >= 0 && nowX <= trackWidth && (
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-primary/70"
          style={{ left: nowX }}
          aria-hidden
        >
          {/* a small cap so "now" reads as the horizon between past and ahead */}
          <span className="absolute -left-[3px] top-0 size-[7px] rounded-full bg-primary" />
        </div>
      )}

      {/* interactive hit-targets (focus ring + tooltip + open) */}
      {rows.map((row) => {
        if (row.kind === "stream" && runways) {
          const stack = streamStack(row);
          if (stack.shown.length === 0) return null;
          const top = stack.shown[0].cy - stack.barHeight / 2 - 2;
          const bottom = stack.shown[stack.shown.length - 1].cy + stack.barHeight / 2 + 2;
          const text =
            streamLabel?.(
              row.stream,
              stack.shown.map(({ lane, r }) => runwayLabel?.(lane, r) ?? lane.task.title),
              stack.hidden,
            ) ?? row.stream.label;
          return rectButton(
            `stream-${row.key}-runways`,
            text,
            stack.minX - 2,
            top,
            stack.maxX - stack.minX + 4,
            bottom - top,
            () => onToggleStream(row.key),
            row.isExpanded,
          );
        }
        if (row.kind === "stream") {
          const y = row.top + G.streamHeight / 2;
          return stackNodes(row.stream.nodes).map(({ node, count }) =>
            hitButton(
              `stream-${row.key}-${node.kind}-${node.ms}`,
              streamNodeLabel(row.stream, node, count),
              x(node.ms),
              y,
              () => onToggleStream(row.key),
              row.isExpanded,
            ),
          );
        }
        if (row.kind !== "lane") return null;
        const { lane, top, branchRows } = row;
        // Keys carry the row key: a multi-tag task has a row in each group.
        const rk = row.rowKey;
        const trunkY = top + G.laneHeight / 2;
        const hits: ReactNode[] = [];
        const planned = !lane.milestone && lane.startMs > nowMs && lane.endMs === null;
        const rw = runwayFor(lane);
        if (rw) {
          // The bar itself is the target: it opens the task. Booked-time tiles
          // and checkpoints come after it, so they stay on top and reachable.
          const { x1, reach } = runwayExtent(rw, x, G.runwayHeight);
          hits.push(
            rectButton(
              `${rk}-runway`,
              runwayLabel?.(lane, rw) ?? lane.task.title,
              x1,
              trunkY - G.runwayHeight / 2,
              reach - x1,
              G.runwayHeight,
              () => onOpenTask(lane.task),
              undefined,
              lane.task.id,
            ),
          );
        } else if (lane.milestone || planned) {
          hits.push(
            renderHitAt(lane.task, segmentLabel(lane), x(lane.startMs), trunkY, `${rk}-marker`),
          );
        }
        const trunkNodes = rw
          ? lane.nodes.filter((n) => n.kind === "scheduled")
          : lane.milestone || planned
            ? lane.nodes.filter((n) => n.kind === "due" || n.kind === "scheduled")
            : lane.nodes;
        trunkNodes.forEach((n, i) =>
          hits.push(renderHit(lane.task, n, x(n.ms), trunkY, `${rk}-${i}`)),
        );
        // Checkpoint hits last so a marker co-located with a status node wins
        // the click (it opens the checkpoint editor, not the task).
        lane.checkpoints.forEach((cp) =>
          hits.push(
            hitButton(`${rk}-cp-${cp.id}`, checkpointLabel(cp, lane.task), x(cp.ms), trunkY, () =>
              onOpenCheckpoint(cp),
            ),
          ),
        );
        branchRows.forEach(({ branch, subTop }) => {
          const subY = subTop + G.subRowHeight / 2;
          const bPlanned = !branch.milestone && branch.startMs > nowMs && branch.endMs === null;
          const brw = runwayFor(branch);
          if (brw) {
            const { x1, reach } = runwayExtent(brw, x, G.branchRunwayHeight);
            hits.push(
              rectButton(
                `${rk}-${branch.task.id}-runway`,
                runwayLabel?.(branch, brw) ?? branch.task.title,
                x1,
                subY - G.branchRunwayHeight / 2,
                reach - x1,
                G.branchRunwayHeight,
                () => onOpenTask(branch.task),
                undefined,
                branch.task.id,
              ),
            );
          } else if (branch.milestone || bPlanned) {
            // marker sits just past the diverge elbow (see <Branch>)
            const mx = x(branch.startMs) + ELBOW;
            hits.push(
              renderHitAt(branch.task, segmentLabel(branch), mx, subY, `${rk}-marker`),
            );
          }
          const bNodes = brw
            ? branch.nodes.filter((n) => n.kind === "scheduled")
            : branch.milestone || bPlanned
              ? branch.nodes.filter((n) => n.kind === "due" || n.kind === "scheduled")
              : branch.nodes;
          bNodes.forEach((n, i) =>
            hits.push(renderHit(branch.task, n, x(n.ms), subY, `${rk}-${i}`)),
          );
        });
        return hits;
      })}

      {hover && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground shadow-soft-lg"
          style={{ left: hover.x, top: hover.y - HIT / 2 - 4 }}
        >
          <span className="tabular-nums">{hover.text}</span>
        </div>
      )}
    </div>
  );

  function renderHit(
    task: TaskRow,
    node: FlowNode,
    cx: number,
    cy: number,
    key: string,
  ) {
    return renderHitAt(task, nodeLabel(node, task), cx, cy, `${node.kind}-${key}`);
  }

  function renderHitAt(
    task: TaskRow,
    text: string,
    cx: number,
    cy: number,
    key: string,
  ) {
    return hitButton(`${task.id}-${key}`, text, cx, cy, () => onOpenTask(task));
  }

  /** A focusable hit-target over a marker: focus ring + hover tooltip + action. */
  function hitButton(
    key: string,
    text: string,
    cx: number,
    cy: number,
    onClick: () => void,
    /** a stream marker toggles its stream: report the state like a disclosure */
    expanded?: boolean,
  ) {
    return (
      <button
        key={key}
        type="button"
        aria-label={text}
        aria-expanded={expanded}
        title={text}
        onClick={onClick}
        onMouseEnter={() => setHover({ x: cx, y: cy, text })}
        onFocus={() => setHover({ x: cx, y: cy, text })}
        onMouseLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        className="absolute rounded-full focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        style={{ left: cx - HIT / 2, top: cy - HIT / 2, width: HIT, height: HIT }}
      />
    );
  }

  /**
   * A focusable hit-target over a whole bar (a runway, or a stream's stack).
   * The tooltip follows the pointer along the bar (a long runway's centre can be
   * off screen) and sits at the bar's visible start on keyboard focus.
   */
  function rectButton(
    key: string,
    text: string,
    left: number,
    top: number,
    width: number,
    height: number,
    onClick: () => void,
    expanded?: boolean,
    /** a runway's task: hovering or focusing it shows its dependency links */
    taskId?: string,
  ) {
    const w = Math.max(width, HIT);
    const focusX = Math.min(left + w / 2, Math.max(left, 0) + 48);
    const tipY = top + height / 2;
    return (
      <button
        key={key}
        type="button"
        aria-label={text}
        aria-expanded={expanded}
        title={text}
        onClick={onClick}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          setHover({ x: left + (e.clientX - box.left), y: tipY, text });
        }}
        onMouseEnter={taskId ? () => setActiveId(taskId) : undefined}
        onFocus={() => {
          setHover({ x: focusX, y: tipY, text });
          if (taskId) setActiveId(taskId);
        }}
        onMouseLeave={() => {
          setHover(null);
          if (taskId) setActiveId((cur) => (cur === taskId ? null : cur));
        }}
        onBlur={() => {
          setHover(null);
          if (taskId) setActiveId((cur) => (cur === taskId ? null : cur));
        }}
        className="absolute rounded-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        style={{ left, top, width: w, height }}
      />
    );
  }
}

/** x of a stream stack's "+N", past its furthest bar and clear of the now-line. */
function plusX(maxX: number, nowX: number, text: string): number {
  const lx = maxX + 8;
  const w = labelWidth(text, 11);
  return nowX > lx - 3 && nowX < lx + w + 3 ? nowX + 6 : lx;
}

/** A stream row's faint band and its bottom divider (both lane styles). */
function StreamBand({ row, trackWidth }: { row: StreamRow; trackWidth: number }) {
  return (
    <>
      <rect
        x={0}
        y={row.top}
        width={trackWidth}
        height={row.height}
        fill="var(--muted)"
        opacity={0.25}
      />
      <line
        x1={0}
        y1={row.top + row.height}
        x2={trackWidth}
        y2={row.top + row.height}
        stroke="var(--border)"
      />
    </>
  );
}

/**
 * A subtask branch. A span branch runs to its merge (or to `now` while open); a
 * milestone or not-yet-started future branch is a point — diverge to it, then a
 * marker, no run/merge.
 */
function Branch({
  branch,
  fromY,
  subY,
  x,
  color,
  mine,
  nowMs,
  t1,
  dasharray,
  opacityScale,
}: {
  branch: FlowSegment;
  /** y of the parent line this branch diverges from (trunk, or a parent branch). */
  fromY: number;
  subY: number;
  x: (ms: number) => number;
  color: string;
  mine: boolean;
  nowMs: number;
  t1: number;
  /** the collection line style's dash pattern, applied to the span run */
  dasharray?: string;
  /** the collection line style's opacity multiplier (e.g. `faded`) */
  opacityScale: number;
}) {
  const divergeX = x(branch.startMs);
  const open = branch.endMs === null;
  const opacity = mine ? 0.85 : 0.45;
  // diverge from the parent line down to the sub-row at the branch's start x
  const diverge = `M ${divergeX} ${fromY} C ${divergeX + ELBOW} ${fromY} ${divergeX} ${subY} ${divergeX + ELBOW} ${subY}`;

  const future = branch.startMs > nowMs && open;
  if (branch.milestone || future) {
    const mx = divergeX + ELBOW;
    return (
      <>
        <path
          d={diverge}
          fill="none"
          stroke={color}
          strokeWidth={G.branchWidth}
          strokeOpacity={opacity}
          strokeLinecap="round"
          {...(future && !branch.milestone ? { strokeDasharray: DOTS } : {})}
        />
        {branch.milestone ? (
          <MomentMarker
            cx={mx}
            cy={subY}
            color={color}
            mine={mine}
            done={branch.task.completedAt != null}
            future={branch.startMs > nowMs}
            small
          />
        ) : (
          <PlannedStartRing cx={mx} cy={subY} color={color} mine={mine} small />
        )}
      </>
    );
  }

  const mergeX = x(branch.endMs ?? Math.min(nowMs, t1));
  // A still-open branch reaches its next booked block / deadline ahead, the same
  // way a trunk does (see <FutureExtension>).
  const reach = open ? futureReachMs(branch, nowMs) : nowMs;
  const hasFuture = open && reach > nowMs;
  const reachX = x(Math.min(reach, t1));
  // Diverge: trunk -> sub-row via a short S-curve; run flat; merge back (or cap).
  const d = [
    diverge,
    `L ${Math.max(divergeX + ELBOW, mergeX - (open ? 0 : ELBOW))} ${subY}`,
  ];
  if (!open) {
    d.push(
      `C ${mergeX} ${subY} ${mergeX - ELBOW} ${fromY} ${mergeX} ${fromY}`,
    );
  }
  return (
    <>
      <path
        d={d.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={G.branchWidth}
        strokeOpacity={opacity * opacityScale}
        strokeDasharray={dasharray}
        strokeLinecap="round"
      />
      {hasFuture ? (
        <FutureExtension
          x1={mergeX}
          x2={reachX}
          y={subY}
          color={color}
          mine={mine}
          width={G.branchWidth}
        />
      ) : (
        open && <OpenCap x={mergeX} y={subY} color={color} mine={mine} small />
      )}
    </>
  );
}

/**
 * Markers on a stream line, stacked: same kind, same day, same overdue state
 * collapse into one marker with a count, so a week with three deadlines reads
 * as "3" at that day rather than three overlapping diamonds.
 */
function stackNodes(nodes: FlowNode[]): { node: FlowNode; count: number }[] {
  const out: { node: FlowNode; count: number }[] = [];
  const seen = new Map<string, { node: FlowNode; count: number }>();
  for (const n of nodes) {
    const k = `${n.kind}:${n.ms}:${n.overdue ? 1 : 0}`;
    const hit = seen.get(k);
    if (hit) hit.count++;
    else {
      const entry = { node: n, count: 1 };
      seen.set(k, entry);
      out.push(entry);
    }
  }
  return out;
}

/**
 * One collapsed stream: a single line from the stream's first start to now
 * (or to its last finish once every lane is done), then the dotted "planned"
 * continuation out to its furthest open deadline. On it sit the open lanes' due
 * diamonds and the finished lanes' done marks; done marks are drawn small and
 * faded so the cluster of deadlines ahead of the now-line is what reads first.
 */
function StreamLine({
  row,
  x,
  nowMs,
  t1,
  trackWidth,
}: {
  row: StreamRow;
  x: (ms: number) => number;
  nowMs: number;
  t1: number;
  trackWidth: number;
}) {
  const s = row.stream;
  const y = row.top + G.streamHeight / 2;
  const color = row.color ? toPaletteStroke(row.color) : "var(--muted-foreground)";
  const open = s.endMs === null;
  const startX = x(s.startMs);
  const endX = x(open ? Math.min(nowMs, t1) : (s.endMs as number));
  let reach = nowMs;
  for (const n of s.nodes) if (n.kind === "due" && n.ms > reach) reach = n.ms;
  const stacks = stackNodes(s.nodes);
  return (
    <g aria-hidden>
      <StreamBand row={row} trackWidth={trackWidth} />
      <g opacity={open ? 1 : 0.55}>
        {endX - startX > 0.5 && (
          <line
            x1={startX}
            y1={y}
            x2={endX}
            y2={y}
            stroke={color}
            strokeWidth={G.trunkWidth + 1}
            strokeOpacity={0.8}
            strokeLinecap="round"
          />
        )}
        {open && reach > nowMs && (
          <FutureExtension
            x1={x(Math.min(nowMs, t1))}
            x2={x(Math.min(reach, t1))}
            y={y}
            color={color}
            mine
            width={G.trunkWidth + 1}
          />
        )}
        {open && reach <= nowMs && <OpenCap x={endX} y={y} color={color} mine />}
        {/* done marks first (underneath), then the deadlines on top */}
        {[...stacks]
          .sort((a, b) => (a.node.kind === "done" ? 0 : 1) - (b.node.kind === "done" ? 0 : 1))
          .map(({ node, count }) => {
            const cx = x(node.ms);
            const done = node.kind === "done";
            return (
              <g key={`${node.kind}-${node.ms}-${node.overdue ? 1 : 0}`} opacity={done ? 0.6 : 1}>
                <NodeShape node={node} cx={cx} cy={y} color={color} small={done} />
                {count > 1 && (
                  <text
                    x={cx}
                    y={y - G.nodeRadius - 5}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={600}
                    fill={node.overdue ? "var(--destructive)" : "var(--foreground)"}
                    className="tabular-nums"
                  >
                    {count}
                  </text>
                )}
              </g>
            );
          })}
      </g>
    </g>
  );
}

/**
 * How far an open line should reach into the future: the furthest scheduled block
 * or deadline ahead of `now`, or `now` itself when nothing is booked ahead. Past /
 * overdue markers (ms <= now) never extend the line — they already sit on the
 * solid span behind the now-line.
 */
function futureReachMs(seg: FlowSegment, nowMs: number): number {
  let reach = nowMs;
  for (const n of seg.nodes) {
    if ((n.kind === "scheduled" || n.kind === "due") && n.ms > reach) {
      reach = n.ms;
    }
  }
  return reach;
}

/**
 * The grayed, dotted continuation of an open line past the now-line, out to its
 * next booked block / deadline. Same weight as the line it continues (so it reads
 * as the same line, not a separate thread) but low-opacity and dotted — the
 * calendar's "pencilled in / not yet real" language. The terracotta now-line
 * divides this future portion from the solid, real span behind it.
 */
function FutureExtension({
  x1,
  x2,
  y,
  color,
  mine,
  width,
}: {
  x1: number;
  x2: number;
  y: number;
  color: string;
  mine: boolean;
  width: number;
}) {
  if (x2 - x1 < 1) return null;
  return (
    <line
      x1={x1}
      y1={y}
      x2={x2}
      y2={y}
      stroke={color}
      strokeWidth={width}
      strokeOpacity={mine ? 0.4 : 0.26}
      strokeDasharray={DOTS}
      strokeLinecap="round"
    />
  );
}

/** A faint dotted thread tying a future / waiting marker to the now-line. */
function DottedLead({
  x1,
  x2,
  y,
  color,
  mine,
}: {
  x1: number;
  x2: number;
  y: number;
  color: string;
  mine: boolean;
}) {
  if (Math.abs(x2 - x1) < 6) return null; // marker already sits on the now-line
  return (
    <line
      x1={x1}
      y1={y}
      x2={x2}
      y2={y}
      stroke={color}
      strokeWidth={1.5}
      strokeOpacity={mine ? 0.4 : 0.26}
      strokeDasharray="2 4"
      strokeLinecap="round"
    />
  );
}

/** Where a future span will begin: a hollow, dotted ring ("pencilled in"). */
function PlannedStartRing({
  cx,
  cy,
  color,
  mine,
  small,
}: {
  cx: number;
  cy: number;
  color: string;
  mine: boolean;
  small?: boolean;
}) {
  const r = small ? G.nodeRadius - 1 : G.nodeRadius;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill="var(--card)"
      stroke={color}
      strokeWidth={2}
      strokeOpacity={mine ? 1 : 0.6}
      strokeDasharray={DOTS}
    />
  );
}

/**
 * A point-in-time task: a concentric "moment" marker (outer ring + core). The
 * core reads ownership (filled = mine, hollow = a partner's); a done milestone
 * carries the check; a future one dots its ring. Distinct from the `due`
 * diamond so the two never collide.
 */
function MomentMarker({
  cx,
  cy,
  color,
  mine,
  done,
  future,
  small,
}: {
  cx: number;
  cy: number;
  color: string;
  mine: boolean;
  done: boolean;
  future: boolean;
  small?: boolean;
}) {
  const r = small ? G.nodeRadius + 0.5 : G.nodeRadius + 2;
  const card = "var(--card)";
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={card}
        stroke={color}
        strokeWidth={1.75}
        strokeOpacity={mine ? 1 : 0.6}
        {...(future && !done ? { strokeDasharray: DOTS } : {})}
      />
      {done ? (
        <path
          d={`M ${cx - r * 0.42} ${cy} l ${r * 0.32} ${r * 0.38} l ${r * 0.56} ${-r * 0.7}`}
          fill="none"
          stroke={color}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <circle
          cx={cx}
          cy={cy}
          r={r * 0.42}
          fill={mine ? color : card}
          stroke={color}
          strokeWidth={mine ? 0 : 1.25}
          strokeOpacity={mine ? 1 : 0.6}
        />
      )}
    </g>
  );
}

function OpenCap({
  x,
  y,
  color,
  mine,
  small,
}: {
  x: number;
  y: number;
  color: string;
  mine: boolean;
  small?: boolean;
}) {
  const s = small ? 3 : 4;
  return (
    <path
      d={`M ${x - s} ${y - s} L ${x} ${y} L ${x - s} ${y + s}`}
      fill="none"
      stroke={color}
      strokeOpacity={mine ? 0.9 : 0.5}
      strokeWidth={small ? G.branchWidth : G.trunkWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/**
 * Status node. Shape carries meaning so it never relies on color alone:
 *   created = hollow ring · started = solid dot · done = solid dot + check ·
 *   reopened = ring + dash · due = hollow diamond (overdue = filled + "!") ·
 *   scheduled = small rounded square (a booked-time "tile", distinct from the
 *   diamond/ring/dot above).
 */
function NodeShape({
  node,
  cx,
  cy,
  color,
  small,
}: {
  node: FlowNode;
  cx: number;
  cy: number;
  color: string;
  small?: boolean;
}) {
  const r = (small ? G.nodeRadius - 1 : G.nodeRadius) + (node.kind === "due" ? 0.5 : 0);
  const card = "var(--card)";

  if (node.kind === "due") {
    const d = r + 0.5;
    const pts = `${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}`;
    const stroke = node.overdue ? "var(--destructive)" : "var(--muted-foreground)";
    return (
      <g>
        <polygon
          points={pts}
          fill={node.overdue ? "var(--destructive)" : card}
          stroke={stroke}
          strokeWidth={1.5}
        />
        {node.overdue && (
          <text
            x={cx}
            y={cy + 0.5}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={8}
            fontWeight={700}
            fill="var(--card)"
          >
            !
          </text>
        )}
      </g>
    );
  }

  if (node.kind === "scheduled") {
    // A booked-time tile: rounded square, lane-colored outline on the card fill.
    const s = r * 1.7;
    return (
      <rect
        x={cx - s / 2}
        y={cy - s / 2}
        width={s}
        height={s}
        rx={1.5}
        fill={card}
        stroke={color}
        strokeWidth={2}
      />
    );
  }

  if (node.kind === "created") {
    return <circle cx={cx} cy={cy} r={r} fill={card} stroke={color} strokeWidth={2} />;
  }
  if (node.kind === "reopened") {
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill={card} stroke={color} strokeWidth={2} />
        <line x1={cx - r / 2} y1={cy} x2={cx + r / 2} y2={cy} stroke={color} strokeWidth={1.5} />
      </g>
    );
  }
  if (node.kind === "done") {
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill={color} />
        <path
          d={`M ${cx - r * 0.45} ${cy} l ${r * 0.35} ${r * 0.4} l ${r * 0.6} ${-r * 0.75}`}
          fill="none"
          stroke="var(--card)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    );
  }
  // started
  return <circle cx={cx} cy={cy} r={r} fill={color} />;
}

/** A 5-point star path centered at (cx,cy), outer radius R. */
function starPath(cx: number, cy: number, R: number): string {
  const inner = R * 0.42;
  let d = "";
  for (let i = 0; i < 10; i++) {
    const ang = ((-90 + i * 36) * Math.PI) / 180;
    const rad = i % 2 === 0 ? R : inner;
    d += `${i === 0 ? "M" : "L"} ${(cx + rad * Math.cos(ang)).toFixed(2)} ${(
      cy +
      rad * Math.sin(ang)
    ).toFixed(2)} `;
  }
  return d + "Z";
}

/**
 * A user-placed milestone checkpoint. Shape carries the type (flag/diamond/star/
 * dot/triangle), fill carries the reached state (filled = reached, hollow = not),
 * so the marker never relies on color alone. Color = the per-checkpoint override
 * or the lane color; ownership dims a partner's marker. A not-yet-reached future
 * marker dots its outline, borrowing the calendar's "pencilled in" language.
 */
function CheckpointMarker({
  cp,
  cx,
  cy,
  laneColor,
  mine,
  nowMs,
}: {
  cp: FlowCheckpoint;
  cx: number;
  cy: number;
  laneColor: string;
  mine: boolean;
  nowMs: number;
}) {
  // A checkpoint's own color uses the stroke shade too (it's a stroked ring), so
  // it matches the lane and stays legible; null inherits the already-mapped lane.
  const color = cp.color ? toPaletteStroke(cp.color) : laneColor;
  const card = "var(--card)";
  const r = FLOW_GEOM.nodeRadius + 0.5;
  const future = cp.ms > nowMs && !cp.reached;
  const fill = cp.reached ? color : card;
  const common = {
    fill,
    stroke: color,
    strokeWidth: 1.75,
    strokeOpacity: mine ? 1 : 0.6,
    ...(future ? { strokeDasharray: DOTS } : {}),
  } as const;

  let body: ReactNode;
  switch (cp.shape) {
    case "diamond": {
      // Larger than the muted `due` diamond and lane-colored, so the two read apart.
      const d = r + 1.5;
      body = (
        <polygon
          points={`${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}`}
          {...common}
        />
      );
      break;
    }
    case "triangle": {
      const h = r + 1.5;
      body = (
        <polygon
          points={`${cx},${cy - h} ${cx + h * 0.95},${cy + h * 0.75} ${cx - h * 0.95},${cy + h * 0.75}`}
          strokeLinejoin="round"
          {...common}
        />
      );
      break;
    }
    case "star":
      body = <path d={starPath(cx, cy, r + 1.5)} strokeLinejoin="round" {...common} />;
      break;
    case "dot":
      body = <circle cx={cx} cy={cy} r={r} {...common} />;
      break;
    case "flag":
    default: {
      // A pole with a pennant — the canonical "milestone" glyph.
      const top = cy - r - 2;
      const bottom = cy + r + 1;
      body = (
        <g>
          <line
            x1={cx}
            y1={top}
            x2={cx}
            y2={bottom}
            stroke={color}
            strokeWidth={1.5}
            strokeOpacity={mine ? 1 : 0.6}
            strokeLinecap="round"
          />
          <path
            d={`M ${cx} ${top} L ${cx + r * 1.8} ${top + r * 0.7} L ${cx} ${top + r * 1.4} Z`}
            {...common}
          />
        </g>
      );
      break;
    }
  }

  return (
    <g opacity={mine ? 1 : 0.85}>
      {body}
      {/* reached check — a second, fill-independent signal on the geometric
          shapes (the flag's filled pennant already reads reached) */}
      {cp.reached && cp.shape !== "flag" && (
        <path
          d={`M ${cx - r * 0.4} ${cy} l ${r * 0.3} ${r * 0.36} l ${r * 0.55} ${-r * 0.68}`}
          fill="none"
          stroke={card}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </g>
  );
}
