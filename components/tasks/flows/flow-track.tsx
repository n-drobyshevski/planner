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

import { useState, type ReactNode } from "react";
import type {
  FlowNode,
  FlowSegment,
  LaidOutLane,
} from "@/lib/tasks/flows-layout";
import { FLOW_GEOM, xForTime } from "@/lib/tasks/flows-layout";
import {
  lineStyleStroke,
  wavePath,
  type FlowLineStyle,
} from "@/lib/tasks/flow-line-styles";
import type { TaskRow } from "@/lib/types";

const G = FLOW_GEOM;
const HIT = 26; // node hit-target (px); Flows is desktop-only, so < 44 is fine
const ELBOW = 12; // horizontal run of a branch diverge/merge curve
const DOTS = "2 2.5"; // dash pattern for "planned / not yet real" strokes

export interface FlowTrackProps {
  rows: LaidOutLane[];
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
  /** the active board's line style, applied to every trunk/branch span stroke */
  lineStyle: FlowLineStyle;
  currentMemberId: string | null;
  /** localized tooltip / aria text for a node */
  nodeLabel: (node: FlowNode, task: TaskRow) => string;
  /** localized tooltip / aria text for a milestone or planned-start marker */
  segmentLabel: (seg: FlowSegment) => string;
  onOpenTask: (t: TaskRow) => void;
}

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
  lineStyle,
  currentMemberId,
  nodeLabel,
  segmentLabel,
  onOpenTask,
}: FlowTrackProps) {
  const [hover, setHover] = useState<Hover | null>(null);
  const x = (ms: number) => xForTime(ms, t0, pxPerDay);
  const nowX = x(Math.min(nowMs, t1));
  // The board's stroke recipe, shared by every trunk and branch span. A subtask
  // branch can't carry a true sine, so wavy falls back to a fine dash there.
  const stroke = lineStyleStroke(lineStyle);
  const branchDash = stroke.wavy ? "2 3" : stroke.dasharray;

  return (
    <div
      className="relative shrink-0"
      style={{ width: trackWidth, height }}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        width={trackWidth}
        height={height}
        className="absolute inset-0"
        aria-hidden
      >
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
        {rows.map(({ lane, top, branchRows }) => {
          const color = colorOf(lane.task);
          const mine = lane.task.ownerId === currentMemberId;
          const trunkY = top + G.laneHeight / 2;
          const startX = x(lane.startMs);
          const isFuture = lane.startMs > nowMs;
          // A not-yet-started task with a future start has no elapsed span to draw.
          const planned = !lane.milestone && isFuture && lane.endMs === null;
          const endX = x(lane.endMs ?? Math.min(nowMs, t1));
          // A milestone / planned-start segment carries its status in the marker,
          // so only a `due` marker is drawn as a node; a real span shows them all.
          const trunkNodes =
            lane.milestone || planned
              ? lane.nodes.filter((n) => n.kind === "due")
              : lane.nodes;
          return (
            <g key={lane.task.id} opacity={lane.done ? 0.55 : 1}>
              {lane.milestone ? (
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
                  <DottedLead x1={nowX} x2={startX} y={trunkY} color={color} mine={mine} />
                  <PlannedStartRing cx={startX} cy={trunkY} color={color} mine={mine} />
                </>
              ) : (
                <>
                  {/* trunk — drawn in the board's line style (wavy = sine path) */}
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
                  {/* open-task cap: a soft chevron at the now end */}
                  {lane.endMs === null && (
                    <OpenCap x={endX} y={trunkY} color={color} mine={mine} />
                  )}
                </>
              )}
              {/* subtask branches (only present when the lane is expanded) */}
              {branchRows.map(({ branch, subTop }) => (
                <Branch
                  key={branch.task.id}
                  branch={branch}
                  trunkY={trunkY}
                  subY={subTop + G.subRowHeight / 2}
                  x={x}
                  color={color}
                  mine={branch.task.ownerId === currentMemberId}
                  nowMs={nowMs}
                  t1={t1}
                  dasharray={branchDash}
                  opacityScale={stroke.opacityScale}
                />
              ))}
              {/* trunk nodes */}
              {trunkNodes.map((n, i) => (
                <NodeShape key={i} node={n} cx={x(n.ms)} cy={trunkY} color={color} />
              ))}
              {/* branch nodes (a milestone branch carries its status in its marker) */}
              {branchRows.map(({ branch, subTop }) =>
                (branch.milestone
                  ? branch.nodes.filter((n) => n.kind === "due")
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
      {rows.map(({ lane, top, branchRows }) => {
        const trunkY = top + G.laneHeight / 2;
        const hits: ReactNode[] = [];
        const planned = !lane.milestone && lane.startMs > nowMs && lane.endMs === null;
        if (lane.milestone || planned) {
          hits.push(renderHitAt(lane.task, segmentLabel(lane), x(lane.startMs), trunkY, "marker"));
        }
        const trunkNodes =
          lane.milestone || planned
            ? lane.nodes.filter((n) => n.kind === "due")
            : lane.nodes;
        trunkNodes.forEach((n, i) => hits.push(renderHit(lane.task, n, x(n.ms), trunkY, i)));
        branchRows.forEach(({ branch, subTop }) => {
          const subY = subTop + G.subRowHeight / 2;
          const bPlanned = !branch.milestone && branch.startMs > nowMs && branch.endMs === null;
          if (branch.milestone || bPlanned) {
            // marker sits just past the diverge elbow (see <Branch>)
            const mx = x(branch.startMs) + ELBOW;
            hits.push(renderHitAt(branch.task, segmentLabel(branch), mx, subY, "marker"));
          }
          const bNodes =
            branch.milestone || bPlanned
              ? branch.nodes.filter((n) => n.kind === "due")
              : branch.nodes;
          bNodes.forEach((n, i) => hits.push(renderHit(branch.task, n, x(n.ms), subY, i)));
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
    key: number,
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
    return (
      <button
        key={`${task.id}-${key}`}
        type="button"
        aria-label={text}
        title={text}
        onClick={() => onOpenTask(task)}
        onMouseEnter={() => setHover({ x: cx, y: cy, text })}
        onFocus={() => setHover({ x: cx, y: cy, text })}
        onMouseLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        className="absolute rounded-full focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        style={{ left: cx - HIT / 2, top: cy - HIT / 2, width: HIT, height: HIT }}
      />
    );
  }
}

/**
 * A subtask branch. A span branch runs to its merge (or to `now` while open); a
 * milestone or not-yet-started future branch is a point — diverge to it, then a
 * marker, no run/merge.
 */
function Branch({
  branch,
  trunkY,
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
  trunkY: number;
  subY: number;
  x: (ms: number) => number;
  color: string;
  mine: boolean;
  nowMs: number;
  t1: number;
  /** the board line style's dash pattern, applied to the span run */
  dasharray?: string;
  /** the board line style's opacity multiplier (e.g. `faded`) */
  opacityScale: number;
}) {
  const divergeX = x(branch.startMs);
  const open = branch.endMs === null;
  const opacity = mine ? 0.85 : 0.45;
  // diverge from the trunk down to the sub-row at the branch's start x
  const diverge = `M ${divergeX} ${trunkY} C ${divergeX + ELBOW} ${trunkY} ${divergeX} ${subY} ${divergeX + ELBOW} ${subY}`;

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
            done={branch.task.status === "done"}
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
  // Diverge: trunk -> sub-row via a short S-curve; run flat; merge back (or cap).
  const d = [
    diverge,
    `L ${Math.max(divergeX + ELBOW, mergeX - (open ? 0 : ELBOW))} ${subY}`,
  ];
  if (!open) {
    d.push(
      `C ${mergeX} ${subY} ${mergeX - ELBOW} ${trunkY} ${mergeX} ${trunkY}`,
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
      {open && <OpenCap x={mergeX} y={subY} color={color} mine={mine} small />}
    </>
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
 *   reopened = ring + dash · due = hollow diamond (overdue = filled + "!").
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
