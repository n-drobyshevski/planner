// Pure layout math for the Flows view (GitKraken-style task lifecycle graph).
// No I/O, no current-time reads — `nowMs` is passed in so the module stays
// deterministic and testable (mirrors lib/datetime/grid-math.ts).
//
// Time runs left -> right. Each top-level task is a horizontal *trunk* spanning
// its first status event (created) to its completion (or to `now` while open).
// Subtasks are *branches* that diverge from the trunk at their own creation and
// merge back at completion. *Nodes* sit at each recorded status transition.

import type { TaskRow, TaskStatus, TaskStatusEvent } from "@/lib/types";
import { dateInputToUtcMs } from "@/lib/datetime/local";

export const DAY_MS = 86_400_000;

/** Node kinds rendered on a trunk/branch. `due` is a deadline marker, not a transition. */
export type FlowNodeKind = "created" | "started" | "done" | "reopened" | "due";

export interface FlowNode {
  ms: number;
  kind: FlowNodeKind;
  /** the status entered at this node; null for a `due` marker */
  status: TaskStatus | null;
  /** a `due` marker that has passed while the task is still open */
  overdue?: boolean;
}

/** A trunk or a single subtask branch — one task's span and its nodes. */
export interface FlowSegment {
  task: TaskRow;
  startMs: number;
  /** null = still open (render to `now`) */
  endMs: number | null;
  nodes: FlowNode[];
  /** point-in-time task: render a single moment marker at `startMs`, no span line */
  milestone: boolean;
}

export interface FlowLane extends FlowSegment {
  /** subtask branches, in sibling order */
  branches: FlowSegment[];
  /** convenience: status === "done" (drives dimming) */
  done: boolean;
}

/** Default pixel geometry; shared by the renderer and tests. */
export const FLOW_GEOM = {
  laneHeight: 44, // trunk row
  subRowHeight: 28, // each expanded subtask branch row
  nodeRadius: 5,
  dueRadius: 5,
  trunkWidth: 2.5,
  branchWidth: 1.5,
  gutterWidth: 272, // left label column (fits the ru zoom labels + Today control)
  rulerHeight: 36,
  minDaySpan: 7,
  defaultLookbackDays: 90,
  padDays: 1,
} as const;

/**
 * Classify a transition. `done` is checked before the null-`fromStatus` rule so
 * the backfilled completion event (recorded with from_status null because the
 * prior status was never known) reads as a Done node, not a creation node.
 */
function nodeKindOf(ev: TaskStatusEvent): FlowNodeKind {
  if (ev.toStatus === "done") return "done";
  if (ev.fromStatus === null) return "created";
  if (ev.toStatus === "in_progress") return "started";
  return "reopened"; // -> todo from a later status
}

const byMs = (a: { ms: number }, b: { ms: number }) => a.ms - b.ms;

/** Build one trunk/branch segment for a task from its status events. */
function buildSegment(
  task: TaskRow,
  events: TaskStatusEvent[] | undefined,
  nowMs: number,
): FlowSegment {
  const evs = (events ?? []).slice().sort((a, b) => a.changedAt - b.changedAt);

  const nodes: FlowNode[] = evs.map((ev) => ({
    ms: ev.changedAt,
    kind: nodeKindOf(ev),
    status: ev.toStatus,
  }));
  // Defensive: a task with no recorded history (shouldn't happen post-backfill)
  // still gets a birth node so its lane renders.
  if (nodes.length === 0) {
    nodes.push({ ms: task.createdAt, kind: "created", status: task.status });
  }

  // Left anchor: the explicit planned start (zone-free date -> UTC midnight) when
  // set, else the creation event. A milestone sits exactly at its planned start;
  // a span never clips work that actually began before the planned date.
  const plannedStart = task.startDate ? dateInputToUtcMs(task.startDate) : nodes[0].ms;
  const firstActivity = nodes.find((n) => n.kind === "started" || n.kind === "done")?.ms;
  const startMs = task.isMilestone
    ? plannedStart
    : Math.min(plannedStart, firstActivity ?? plannedStart);

  const done = task.status === "done";
  let endMs: number | null = null;
  if (done) {
    const lastDone = nodes.reduce<number | null>(
      (acc, n) => (n.kind === "done" ? Math.max(acc ?? n.ms, n.ms) : acc),
      null,
    );
    endMs = task.completedAt ?? lastDone ?? startMs;
  }

  // Deadline marker (zone-free date token -> UTC midnight, day-resolution).
  if (task.dueDate) {
    const dueMs = dateInputToUtcMs(task.dueDate);
    nodes.push({
      ms: dueMs,
      kind: "due",
      status: null,
      overdue: !done && dueMs < nowMs,
    });
  }
  nodes.sort(byMs);

  return { task, startMs, endMs, nodes, milestone: task.isMilestone };
}

/**
 * Build the lane model: one lane per top-level task, each carrying its subtask
 * branches. Lanes are ordered open-first (by start time), completed lanes after
 * (by completion time) so the active work reads at the top.
 */
export function buildFlowLanes(args: {
  topLevel: TaskRow[];
  childrenByParent: Map<string | null, TaskRow[]>;
  eventsByTask: Map<string, TaskStatusEvent[]>;
  nowMs: number;
}): FlowLane[] {
  const { topLevel, childrenByParent, eventsByTask, nowMs } = args;

  const lanes: FlowLane[] = topLevel.map((task) => {
    const trunk = buildSegment(task, eventsByTask.get(task.id), nowMs);
    const children = childrenByParent.get(task.id) ?? [];
    const branches = children.map((c) =>
      buildSegment(c, eventsByTask.get(c.id), nowMs),
    );
    return { ...trunk, branches, done: task.status === "done" };
  });

  return lanes.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1; // open first
    if (a.done) return (a.endMs ?? a.startMs) - (b.endMs ?? b.startMs);
    return a.startMs - b.startMs;
  });
}

/**
 * The visible time window. Spans every lane/branch start, end (or `now` if
 * open), and node — clamped on the left to at most `lookbackDays` before now so
 * a years-old task doesn't compress the whole graph, and padded a day each side.
 */
export function flowsWindow(
  lanes: FlowLane[],
  nowMs: number,
  opts?: { lookbackDays?: number; padDays?: number },
): { t0: number; t1: number } {
  const lookback = opts?.lookbackDays ?? FLOW_GEOM.defaultLookbackDays;
  const pad = opts?.padDays ?? FLOW_GEOM.padDays;

  let min = nowMs;
  let max = nowMs;
  const visit = (s: FlowSegment) => {
    min = Math.min(min, s.startMs);
    // `startMs` can sit in the future (a planned start / milestone), so it must
    // extend the right edge too — not just the left.
    max = Math.max(max, s.startMs, s.endMs ?? nowMs);
    for (const n of s.nodes) {
      min = Math.min(min, n.ms);
      max = Math.max(max, n.ms);
    }
  };
  for (const lane of lanes) {
    visit(lane);
    lane.branches.forEach(visit);
  }

  const clampedMin = Math.max(min, nowMs - lookback * DAY_MS);
  const t0 = clampedMin - pad * DAY_MS;
  let t1 = max + pad * DAY_MS;
  // Guarantee a sane minimum span (e.g. a single same-day task).
  if (t1 - t0 < FLOW_GEOM.minDaySpan * DAY_MS) {
    t1 = t0 + FLOW_GEOM.minDaySpan * DAY_MS;
  }
  return { t0, t1 };
}

/** Map a timestamp to an x offset (px) within the graph track. */
export function xForTime(ms: number, t0: number, pxPerDay: number): number {
  return ((ms - t0) / DAY_MS) * pxPerDay;
}

export interface LaidOutLane {
  lane: FlowLane;
  /** y of the lane's top edge (px, within the track) */
  top: number;
  isExpanded: boolean;
  branchRows: { branch: FlowSegment; subTop: number }[];
  height: number;
}

/**
 * Stack lanes into rows. An expanded lane reserves a sub-row per branch beneath
 * its trunk. Returns each lane's vertical box plus the total track height.
 */
export function layoutRows(
  lanes: FlowLane[],
  expanded: ReadonlySet<string>,
  geom: typeof FLOW_GEOM = FLOW_GEOM,
): { rows: LaidOutLane[]; totalHeight: number } {
  let y = 0;
  const rows = lanes.map((lane) => {
    const top = y;
    y += geom.laneHeight;
    const isExpanded = expanded.has(lane.task.id) && lane.branches.length > 0;
    const branchRows = isExpanded
      ? lane.branches.map((branch, i) => ({
          branch,
          subTop: top + geom.laneHeight + i * geom.subRowHeight,
        }))
      : [];
    if (isExpanded) y += lane.branches.length * geom.subRowHeight;
    return { lane, top, isExpanded, branchRows, height: y - top };
  });
  return { rows, totalHeight: y };
}
