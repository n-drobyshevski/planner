// A task's state by its column's role, and its states over time. Pure: no
// I/O, no clock. Shared by the MCP tools (list_tasks, update_task, show_flows),
// the Flows MCP App and the web Flows runways.
//
// A collection's columns are user-defined, so a column's meaning comes from
// its place, not its name: the done column (`isDone`) is "done", the first
// open column (lowest position) is "planned", every other open column is
// "wip" (in progress). A task in no column is planned unless it is completed.
//
// No imports beyond types: the Flows MCP App bundles this file.

import type { Board, TaskRow, TaskStatusEvent } from "@/lib/types";

export type TaskState = "planned" | "wip" | "done";

export const TASK_STATES = ["planned", "wip", "done"] as const satisfies readonly TaskState[];

type BoardRole = Pick<Board, "id" | "position" | "isDone">;
type BoardLike = Pick<Board, "id" | "collectionId" | "position" | "isDone">;

/** A column's role among its collection's columns (`boardsOfCollection` may include it). */
export function stateOfBoard(board: BoardRole, boardsOfCollection: readonly BoardRole[]): TaskState {
  if (board.isDone) return "done";
  // The first open column; equal positions fall back to the id, so it is one column.
  let first: BoardRole = board;
  for (const b of boardsOfCollection) {
    if (b.isDone) continue;
    if (b.position < first.position || (b.position === first.position && b.id < first.id)) first = b;
  }
  return first.id === board.id ? "planned" : "wip";
}

/** Every column's role, by id. */
export function boardStates(boards: readonly BoardLike[]): Map<string, TaskState> {
  const byCollection = new Map<string, BoardRole[]>();
  for (const b of boards) {
    const list = byCollection.get(b.collectionId);
    if (list) list.push(b);
    else byCollection.set(b.collectionId, [b]);
  }
  const out = new Map<string, TaskState>();
  for (const b of boards) out.set(b.id, stateOfBoard(b, byCollection.get(b.collectionId) ?? [b]));
  return out;
}

/** A task's state now: its column's role, else done when completed, planned when not. */
export function taskState(
  task: Pick<TaskRow, "boardId" | "completedAt">,
  states: ReadonlyMap<string, TaskState>,
): TaskState {
  const byBoard = task.boardId ? states.get(task.boardId) : undefined;
  return byBoard ?? (task.completedAt != null ? "done" : "planned");
}

/** A stretch of a task's history: in `state` from `from` (epoch ms) until the next phase. */
export interface Phase {
  state: TaskState;
  from: number;
}

/** Where a recorded move landed: the done flag it recorded, else its column's role. */
function stateAfter(ev: TaskStatusEvent, states: ReadonlyMap<string, TaskState>): TaskState {
  if (ev.toIsDone) return "done";
  return (ev.toBoardId ? states.get(ev.toBoardId) : undefined) ?? "planned";
}

/**
 * A task's states over time, from its recorded column moves: ordered, with
 * no two neighbours in the same state. The first phase starts at the task's
 * planned start (else its creation) in the state it was in then; moves at or
 * before that moment only set that first state. The last phase is always the
 * task's state now (a history that ends elsewhere, say a column since
 * deleted, is corrected to it).
 */
export function phasesOf(
  task: Pick<TaskRow, "id" | "boardId" | "completedAt" | "startDate" | "createdAt">,
  events: readonly TaskStatusEvent[] | undefined,
  /** the workspace's columns, or their roles already worked out (boardStates) */
  boards: readonly BoardLike[] | ReadonlyMap<string, TaskState>,
): Phase[] {
  const states = boards instanceof Map ? boards : boardStates(boards as readonly BoardLike[]);
  const current = taskState(task, states);
  const parsedStart = task.startDate ? Date.parse(`${task.startDate}T00:00:00Z`) : Number.NaN;
  const anchor = Number.isNaN(parsedStart) ? task.createdAt : parsedStart;
  const evs = (events ?? []).filter((e) => e.taskId === task.id).sort((a, b) => a.changedAt - b.changedAt);

  const first = evs[0];
  const initial: TaskState = !first
    ? current
    : first.fromBoardId
      ? (states.get(first.fromBoardId) ?? "planned")
      : stateAfter(first, states);
  const phases: Phase[] = [{ state: initial, from: anchor }];
  for (const ev of evs) {
    const state = stateAfter(ev, states);
    if (ev.changedAt <= anchor) phases[0].state = state;
    else phases.push({ state, from: ev.changedAt });
  }
  const last = phases[phases.length - 1];
  if (last.state !== current) {
    if (current === "done" && task.completedAt != null && task.completedAt > last.from) {
      phases.push({ state: "done", from: task.completedAt });
    } else last.state = current;
  }
  return mergePhases(phases);
}

function mergePhases(phases: Phase[]): Phase[] {
  const out: Phase[] = [];
  for (const p of phases) {
    if (out.length > 0 && out[out.length - 1].state === p.state) continue;
    out.push({ ...p });
  }
  return out;
}

// -- Segments: a bar cut where the state changed ----------------------------------

/** One stretch of a bar, in whatever unit the caller measures the bar in. */
export interface StateSegment {
  x0: number;
  x1: number;
  state: TaskState;
}

export interface SegmentOpts {
  /** a stretch narrower than this joins its neighbour (the earlier one, else the later) */
  minWidth: number;
  /** the last stretch (the state now) is kept at least this wide; default minWidth */
  currentMinWidth?: number;
  /** changes are never drawn right of this (the now-line): the future keeps the state now */
  maxX?: number;
}

/**
 * Cut the bar [x0, x1] where the state changed. `marks` are the phases in
 * order, each with `x`, where it begins (the first one's is ignored: it
 * covers everything before the second). The stretches tile the bar; the last
 * one is always the state now, at least `currentMinWidth` wide, so a done
 * task always ends in its done stretch; narrower stretches join a neighbour;
 * and a bar too short for two stretches is one stretch in the state now.
 * Empty when there are no phases or the bar has no width.
 */
export function stateSegments(
  marks: readonly { state: TaskState; x: number }[],
  x0: number,
  x1: number,
  opts: SegmentOpts,
): StateSegment[] {
  if (marks.length === 0 || !(x1 > x0)) return [];
  const { minWidth } = opts;
  const current = marks[marks.length - 1].state;
  const width = x1 - x0;
  if (width < 2 * minWidth) return [{ x0, x1, state: current }];
  const cap = opts.maxX ?? Number.POSITIVE_INFINITY;
  const at = (i: number) => {
    const x = marks[i].x;
    return Math.min(Number.isFinite(x) ? x : Number.NEGATIVE_INFINITY, cap);
  };

  let segs: StateSegment[] = [];
  for (let i = 0; i < marks.length; i++) {
    const a = Math.max(x0, i === 0 ? Number.NEGATIVE_INFINITY : at(i));
    const b = Math.min(x1, i === marks.length - 1 ? Number.POSITIVE_INFINITY : at(i + 1));
    if (b > a) segs.push({ x0: a, x1: b, state: marks[i].state });
  }
  if (segs.length === 0) return [{ x0, x1, state: current }];

  // The bar always ends in the state now, at least `currentMinWidth` wide.
  const need = Math.min(width, Math.max(minWidth, opts.currentMinWidth ?? minWidth));
  let last = segs[segs.length - 1];
  if (last.state !== current) {
    last = { x0: x1, x1, state: current };
    segs.push(last);
  }
  if (last.x1 - last.x0 < need) {
    last.x0 = x1 - need;
    segs = segs.filter((s) => s === last || s.x0 < last.x0);
    for (const s of segs) if (s !== last) s.x1 = Math.min(s.x1, last.x0);
  }
  segs = joinSame(segs);

  // Too-narrow stretches join a neighbour, narrowest first; the last never goes.
  for (;;) {
    let pick = -1;
    for (let i = 0; i < segs.length - 1; i++) {
      const w = segs[i].x1 - segs[i].x0;
      if (w < minWidth && (pick < 0 || w < segs[pick].x1 - segs[pick].x0)) pick = i;
    }
    if (pick < 0) break;
    if (pick > 0) segs[pick - 1].x1 = segs[pick].x1;
    else segs[pick + 1].x0 = segs[pick].x0;
    segs.splice(pick, 1);
    segs = joinSame(segs);
  }
  segs[0].x0 = x0;
  return segs;
}

function joinSame(segs: StateSegment[]): StateSegment[] {
  const out: StateSegment[] = [];
  for (const s of segs) {
    const prev = out[out.length - 1];
    if (prev && prev.state === s.state) prev.x1 = s.x1;
    else out.push(s);
  }
  return out;
}
