// Pure layout math for the Flows view (GitKraken-style task lifecycle graph).
// No I/O, no current-time reads — `nowMs` is passed in so the module stays
// deterministic and testable (mirrors lib/datetime/grid-math.ts).
//
// Time runs left -> right. Each top-level task is a horizontal *trunk* spanning
// its first status event (created) to its completion (or to `now` while open).
// Subtasks are *branches* that diverge from the trunk at their own creation and
// merge back at completion. *Nodes* sit at each recorded status transition.

import type {
  CheckpointShape,
  EventRow,
  TaskCheckpoint,
  TaskRow,
  TaskStatusEvent,
} from "@/lib/types";
import { dateInputToUtcMs } from "@/lib/datetime/local";

export const DAY_MS = 86_400_000;

/**
 * Node kinds rendered on a trunk/branch. `due` is a deadline marker, not a
 * transition; `scheduled` marks a calendar block linked to the task (booked
 * time) and is likewise not a status transition.
 */
export type FlowNodeKind =
  | "created"
  | "started"
  | "done"
  | "reopened"
  | "due"
  | "scheduled";

export interface FlowNode {
  ms: number;
  kind: FlowNodeKind;
  /** a `due` marker that has passed while the task is still open */
  overdue?: boolean;
}

/**
 * A user-placed milestone checkpoint on a segment's trunk — its own overlay,
 * separate from `nodes` because it carries identity (id/title/reached/color/
 * shape) and opens the checkpoint editor, not the task. `ms` is the at_date
 * resolved to UTC midnight.
 */
export interface FlowCheckpoint {
  id: string;
  ms: number;
  title: string;
  reached: boolean;
  shape: CheckpointShape;
  /** hex/swatch override; null = inherit the lane color */
  color: string | null;
  taskId: string;
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
  /** user-placed milestone checkpoints on this trunk, sorted by ms (default []) */
  checkpoints: FlowCheckpoint[];
}

export interface FlowLane extends FlowSegment {
  /** subtask branches, in sibling order */
  branches: FlowSegment[];
  /** convenience: completedAt != null (drives dimming) */
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
  groupHeaderHeight: 28, // a group-by section header band (gutter + canvas)
  rulerHeight: 36,
  minDaySpan: 7,
  defaultLookbackDays: 90,
  padDays: 1,
} as const;

/**
 * Classify a transition. `done` (entering a completion column) is checked first
 * so a backfilled completion event (recorded with from_board_id null because the
 * prior board was never known) reads as a Done node, not a creation node. With
 * user-defined columns we can't tell "started" from "reopened" purely (that would
 * need the source column's is_done, which isn't recorded), so every non-done,
 * non-creation move reads as "started".
 */
function nodeKindOf(ev: TaskStatusEvent): FlowNodeKind {
  if (ev.toIsDone) return "done";
  if (ev.fromBoardId === null) return "created";
  return "started";
}

const byMs = (a: { ms: number }, b: { ms: number }) => a.ms - b.ms;

/** Build one trunk/branch segment for a task from its status events. */
function buildSegment(
  task: TaskRow,
  events: TaskStatusEvent[] | undefined,
  nowMs: number,
  blocks?: EventRow[],
  checkpoints?: TaskCheckpoint[],
): FlowSegment {
  const evs = (events ?? []).slice().sort((a, b) => a.changedAt - b.changedAt);

  const nodes: FlowNode[] = evs.map((ev) => ({
    ms: ev.changedAt,
    kind: nodeKindOf(ev),
  }));
  // Defensive: a task with no recorded history (shouldn't happen post-backfill)
  // still gets a birth node so its lane renders.
  if (nodes.length === 0) {
    nodes.push({ ms: task.createdAt, kind: "created" });
  }

  // Left anchor: the explicit planned start (zone-free date -> UTC midnight) when
  // set, else the creation event. A milestone sits exactly at its planned start;
  // a span never clips work that actually began before the planned date.
  const plannedStart = task.startDate ? dateInputToUtcMs(task.startDate) : nodes[0].ms;
  const firstActivity = nodes.find((n) => n.kind === "started" || n.kind === "done")?.ms;
  const startMs = task.isMilestone
    ? plannedStart
    : Math.min(plannedStart, firstActivity ?? plannedStart);

  const done = task.completedAt != null;
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
      overdue: !done && dueMs < nowMs,
    });
  }

  // Scheduled markers: one per linked calendar block, at the block's start.
  // Non-destructive — they never move the planned span (startMs/endMs); they
  // just record "this task is booked then". `flowsWindow` visits every node, so
  // a future block still extends the window and keeps the lane in view.
  for (const block of blocks ?? []) {
    nodes.push({ ms: block.start, kind: "scheduled" });
  }
  nodes.sort(byMs);

  // User-placed checkpoints: an independent overlay on the trunk, sorted by date
  // (then position, preserved from the query order). Resolved to UTC midnight so
  // they land on the same day gridline for every viewer, like due/start.
  const points: FlowCheckpoint[] = (checkpoints ?? []).map((c) => ({
    id: c.id,
    ms: dateInputToUtcMs(c.atDate),
    title: c.title,
    reached: c.reached,
    shape: c.shape,
    color: c.color,
    taskId: c.taskId,
  }));
  points.sort(byMs);

  return { task, startMs, endMs, nodes, milestone: task.isMilestone, checkpoints: points };
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
  /** task id -> its linked calendar blocks, for scheduled-block markers */
  blocksByTask?: Map<string, EventRow[]>;
  /** task id -> its milestone checkpoints (top-level lanes only in v1) */
  checkpointsByTask?: Map<string, TaskCheckpoint[]>;
  nowMs: number;
}): FlowLane[] {
  const { topLevel, childrenByParent, eventsByTask, blocksByTask, checkpointsByTask, nowMs } =
    args;

  const lanes: FlowLane[] = topLevel.map((task) => {
    const trunk = buildSegment(
      task,
      eventsByTask.get(task.id),
      nowMs,
      blocksByTask?.get(task.id),
      checkpointsByTask?.get(task.id),
    );
    const children = childrenByParent.get(task.id) ?? [];
    // Branches don't carry checkpoints in v1 (the menu offers them on trunks
    // only); they get an empty checkpoint overlay.
    const branches = children.map((c) =>
      buildSegment(c, eventsByTask.get(c.id), nowMs, blocksByTask?.get(c.id)),
    );
    return { ...trunk, branches, done: task.completedAt != null };
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
    // A checkpoint can sit far in the future/past; include it so its lane and
    // marker stay reachable (mirrors the node loop above).
    for (const c of s.checkpoints) {
      min = Math.min(min, c.ms);
      max = Math.max(max, c.ms);
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

/** Inverse of `xForTime`: an x offset (px) within the track back to a timestamp. */
export function timeForX(x: number, t0: number, pxPerDay: number): number {
  return t0 + (x / pxPerDay) * DAY_MS;
}

export interface LaidOutLane {
  lane: FlowLane;
  /** y of the lane's top edge (px, within the track) */
  top: number;
  isExpanded: boolean;
  branchRows: { branch: FlowSegment; subTop: number }[];
  height: number;
}

/** A laid-out lane row (the discriminated `kind` lets headers share the list). */
export interface LaneRow extends LaidOutLane {
  kind: "lane";
}

/** A group-by section header band, spanning the gutter and the canvas. */
export interface GroupHeaderRow {
  kind: "group";
  key: string;
  label: string;
  /** swatch color for the bucket (category only); never the sole signal */
  color?: string;
  top: number;
  height: number;
  count: number;
}

export type FlowRow = LaneRow | GroupHeaderRow;

/**
 * One bucket of lanes produced by the display pipeline (lib/tasks/flows-display).
 * `header: false` is the implicit single bucket used when grouping is off — it
 * emits no header row, so the ungrouped view is pixel-identical to before.
 */
export interface LaneGroup {
  key: string;
  label: string;
  color?: string;
  lanes: FlowLane[];
  header: boolean;
}

/**
 * Stack groups into rows. Each group optionally opens with a header row, then
 * stacks its lanes; an expanded lane reserves a sub-row per branch beneath its
 * trunk. Headers and lanes share one vertical coordinate space, so the gutter
 * and the SVG canvas (both iterating these rows) stay pixel-aligned. Returns the
 * flat row list plus the total track height.
 */
export function layoutRows(
  groups: LaneGroup[],
  expanded: ReadonlySet<string>,
  geom: typeof FLOW_GEOM = FLOW_GEOM,
): { rows: FlowRow[]; totalHeight: number } {
  let y = 0;
  const rows: FlowRow[] = [];
  for (const group of groups) {
    if (group.header) {
      rows.push({
        kind: "group",
        key: group.key,
        label: group.label,
        color: group.color,
        top: y,
        height: geom.groupHeaderHeight,
        count: group.lanes.length,
      });
      y += geom.groupHeaderHeight;
    }
    for (const lane of group.lanes) {
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
      rows.push({ kind: "lane", lane, top, isExpanded, branchRows, height: y - top });
    }
  }
  return { rows, totalHeight: y };
}
