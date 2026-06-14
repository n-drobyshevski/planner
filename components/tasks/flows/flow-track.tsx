"use client";

// The graph track: trunks, subtask branches, and status nodes drawn in one SVG
// (purely visual, aria-hidden), with an HTML <button> over each node for the
// real focus ring, keyboard access, and hover tooltip. Pixel math comes from
// lib/tasks/flows-layout (pure); this file only paints.

import { useState } from "react";
import type {
  FlowNode,
  FlowSegment,
  LaidOutLane,
} from "@/lib/tasks/flows-layout";
import { FLOW_GEOM, xForTime } from "@/lib/tasks/flows-layout";
import type { TaskRow } from "@/lib/types";

const G = FLOW_GEOM;
const HIT = 26; // node hit-target (px); Flows is desktop-only, so < 44 is fine
const ELBOW = 12; // horizontal run of a branch diverge/merge curve

export interface FlowTrackProps {
  rows: LaidOutLane[];
  totalHeight: number;
  t0: number;
  t1: number;
  pxPerDay: number;
  trackWidth: number;
  nowMs: number;
  /** day/week/month tick timestamps; drawn as faint vertical gridlines */
  gridMs: number[];
  colorOf: (t: TaskRow) => string;
  currentMemberId: string | null;
  /** localized tooltip / aria text for a node */
  nodeLabel: (node: FlowNode, task: TaskRow) => string;
  onOpenTask: (t: TaskRow) => void;
}

interface Hover {
  x: number;
  y: number;
  text: string;
}

export function FlowTrack({
  rows,
  totalHeight,
  t0,
  t1,
  pxPerDay,
  trackWidth,
  nowMs,
  gridMs,
  colorOf,
  currentMemberId,
  nodeLabel,
  onOpenTask,
}: FlowTrackProps) {
  const [hover, setHover] = useState<Hover | null>(null);
  const x = (ms: number) => xForTime(ms, t0, pxPerDay);
  const nowX = x(Math.min(nowMs, t1));

  return (
    <div
      className="relative"
      style={{ width: trackWidth, height: totalHeight }}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        width={trackWidth}
        height={totalHeight}
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
              y2={totalHeight}
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
          const endX = x(lane.endMs ?? Math.min(nowMs, t1));
          return (
            <g key={lane.task.id} opacity={lane.done ? 0.55 : 1}>
              {/* trunk */}
              <line
                x1={startX}
                y1={trunkY}
                x2={endX}
                y2={trunkY}
                stroke={color}
                strokeWidth={G.trunkWidth}
                strokeOpacity={mine ? 1 : 0.5}
                strokeLinecap="round"
              />
              {/* open-task cap: a soft chevron at the now end */}
              {lane.endMs === null && (
                <OpenCap x={endX} y={trunkY} color={color} mine={mine} />
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
                />
              ))}
              {/* trunk nodes */}
              {lane.nodes.map((n, i) => (
                <NodeShape
                  key={i}
                  node={n}
                  cx={x(n.ms)}
                  cy={trunkY}
                  color={color}
                />
              ))}
              {/* branch nodes */}
              {branchRows.map(({ branch, subTop }) =>
                branch.nodes.map((n, i) => (
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
        />
      )}

      {/* interactive node hit-targets (focus ring + tooltip + open) */}
      {rows.map(({ lane, top, branchRows }) => {
        const trunkY = top + G.laneHeight / 2;
        const nodeButtons = lane.nodes.map((n, i) =>
          renderHit(lane.task, n, x(n.ms), trunkY, i),
        );
        const branchButtons = branchRows.flatMap(({ branch, subTop }) =>
          branch.nodes.map((n, i) =>
            renderHit(branch.task, n, x(n.ms), subTop + G.subRowHeight / 2, i),
          ),
        );
        return [...nodeButtons, ...branchButtons];
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
    const text = nodeLabel(node, task);
    return (
      <button
        key={`${task.id}-${node.kind}-${key}`}
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

/** An open subtask branch runs to `now`; a closed one merges back into the trunk. */
function Branch({
  branch,
  trunkY,
  subY,
  x,
  color,
  mine,
  nowMs,
  t1,
}: {
  branch: FlowSegment;
  trunkY: number;
  subY: number;
  x: (ms: number) => number;
  color: string;
  mine: boolean;
  nowMs: number;
  t1: number;
}) {
  const divergeX = x(branch.startMs);
  const open = branch.endMs === null;
  const mergeX = x(branch.endMs ?? Math.min(nowMs, t1));
  const opacity = mine ? 0.85 : 0.45;

  // Diverge: trunk -> sub-row via a short S-curve; run flat; merge back (or cap).
  const d = [
    `M ${divergeX} ${trunkY}`,
    `C ${divergeX + ELBOW} ${trunkY} ${divergeX} ${subY} ${divergeX + ELBOW} ${subY}`,
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
        strokeOpacity={opacity}
        strokeLinecap="round"
      />
      {open && <OpenCap x={mergeX} y={subY} color={color} mine={mine} small />}
    </>
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
