import "server-only";
import type { Board, Category, Collection, Member, TaskDependency, TaskRow } from "@/lib/types";
import type { AttentionMode } from "@/lib/tasks/attention";
import { buildFlowLanes } from "@/lib/tasks/flows-layout";
import {
  DEFAULT_FLOWS_FILTER,
  filterLanes,
  groupLanes,
  type FlowsDisplay,
  type FlowsDisplayCtx,
  type FlowsFilter,
  type FlowsGroupBy,
} from "@/lib/tasks/flows-display";
import { buildStreams, rankStreams } from "@/lib/tasks/flows-streams";
import { laneAttention } from "@/lib/tasks/attention";
import { MAX_DEPTH, flattenTree, groupByParent, progressDeep, subtreeIds } from "@/lib/tasks/tree";
import { blockedIds, openBlockersOf } from "@/lib/tasks/blocking";
import { clipTitle } from "./projection";

/** The groupings `get_flows` offers ("none" is the web app's headerless mode, not a stream split). */
export type McpFlowsGroupBy = Exclude<FlowsGroupBy, "none">;
export const MCP_FLOWS_GROUP_BYS = [
  "tag",
  "category",
  "collection",
  "assignee",
  "status",
  "priority",
] as const satisfies readonly McpFlowsGroupBy[];

/** Streams returned at most; more than this and the output is cut to the top-ranked. */
export const MAX_STREAMS = 30;

/** A task another one waits for, as `waitingOn` names it. */
export interface FlowBlockerOut {
  id: string;
  title: string;
}

/** Open blockers named per task at most (`waitingOn`). */
export const MAX_WAITING_ON = 3;
/** Subtasks `show_flows` hands its view per top-level task at most. */
export const MAX_FLOW_SUBTASKS = 100;

export interface FlowTaskOut {
  id: string;
  title: string;
  /** when the task's runway begins: its planned start, else its first activity ("yyyy-MM-dd") */
  start?: string;
  dueDate?: string;
  /** subtasks done / total, over the whole subtree; absent when it has none */
  progress?: { done: number; total: number };
  priority?: number;
  score: number;
  overdue: boolean;
  tags?: string[];
  /** set only while the task waits for an unfinished dependency */
  blocked?: true;
  /** its unfinished blockers, most pressing (earliest due) first, at most MAX_WAITING_ON */
  waitingOn?: FlowBlockerOut[];
  /** how many open tasks wait for this one; absent when none */
  holds?: number;
  /**
   * `show_flows`' view only (FlowsInput.withSubtasks): the whole subtask tree,
   * flattened pre-order, done ones included, at most MAX_FLOW_SUBTASKS.
   */
  subtasks?: FlowSubtaskOut[];
}

/** One subtask of a Flows task, for the view. */
export interface FlowSubtaskOut {
  id: string;
  title: string;
  parentId: string;
  /** 1 = a direct child of the top-level task (never more than MAX_DEPTH) */
  depth: number;
  done: boolean;
  /** planned start, "yyyy-MM-dd" */
  start?: string;
  /** due date, "yyyy-MM-dd" */
  due?: string;
  /** set only while open and waiting: on an unfinished dependency, or on an earlier sibling under a "do in order" parent */
  blocked?: true;
  /** its unfinished dependency blockers, most pressing first, at most MAX_WAITING_ON */
  waitingOn?: FlowBlockerOut[];
}

export interface FlowStreamOut {
  key: string;
  label: string;
  open: number;
  done: number;
  overdue: number;
  needsAttention: number;
  nextDue?: string;
  score: number;
  tasks: FlowTaskOut[];
}

export interface FlowsOut {
  date: string;
  groupBy: McpFlowsGroupBy;
  attention: AttentionMode;
  stream?: string;
  streams: FlowStreamOut[];
  truncated?: true;
}

export interface FlowsInput {
  /** every task the caller can see (RLS-scoped), subtasks included */
  tasks: TaskRow[];
  boards: Board[];
  categories: Category[];
  collections: Collection[];
  members: Member[];
  memberId: string;
  /** the caller's local today, "yyyy-MM-dd" */
  date: string;
  nowMs: number;
  groupBy: McpFlowsGroupBy;
  attention: AttentionMode;
  /** only top-level tasks the caller owns or is assigned to */
  mine: boolean;
  /** tasks returned per stream */
  limit: number;
  /** a saved stream's filter; default = everything */
  filter?: FlowsFilter;
  /** echoed back as `stream` */
  streamName?: string;
  /** every blocks/blocked-by edge the caller can see (RLS-scoped) */
  dependencies: TaskDependency[];
  /** add each task's flattened subtask tree (`show_flows`' view); default false */
  withSubtasks?: boolean;
}

/** Plain English: this output is read by a machine/LLM, not localized. */
const LABELS: FlowsDisplayCtx["labels"] = {
  noStatus: "No status",
  noCategory: "No category",
  noTag: "No tag",
  noCollection: "No collection",
  unassigned: "Unassigned",
  priority: { 0: "No priority", 1: "Low", 2: "Medium", 3: "High" },
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

function progressOf(
  taskId: string,
  byParent: Map<string | null, TaskRow[]>,
): Pick<FlowTaskOut, "progress"> {
  const { done, total } = progressDeep(taskId, byParent);
  return total > 0 ? { progress: { done, total } } : {};
}

/** Dependency lookups shared by the Flows and task-detail projections. */
interface DepIndex {
  byId: Map<string, TaskRow>;
  deps: readonly TaskDependency[];
  /** blocker id -> ids of the tasks waiting for it */
  waiters: Map<string, string[]>;
}

function indexDeps(tasks: readonly TaskRow[], deps: readonly TaskDependency[]): DepIndex {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const waiters = new Map<string, string[]>();
  for (const d of deps) {
    const arr = waiters.get(d.dependsOnTaskId);
    if (arr) {
      if (!arr.includes(d.taskId)) arr.push(d.taskId);
    } else waiters.set(d.dependsOnTaskId, [d.taskId]);
  }
  return { byId, deps, waiters };
}

/** `blocked` / `waitingOn` from the task's unfinished dependency blockers (nothing once done). */
function waitingOf(t: TaskRow, ix: DepIndex): { blocked?: true; waitingOn?: FlowBlockerOut[] } {
  if (t.completedAt != null) return {};
  const open = openBlockersOf(t.id, ix.deps, ix.byId);
  if (open.length === 0) return {};
  return {
    blocked: true,
    waitingOn: open.slice(0, MAX_WAITING_ON).map((b) => ({ id: b.id, title: clipTitle(b.title) })),
  };
}

/** Open tasks (visible to the caller) that wait for `t`. */
function holdsOf(t: TaskRow, ix: DepIndex): number {
  let n = 0;
  for (const id of ix.waiters.get(t.id) ?? []) {
    const w = ix.byId.get(id);
    if (w && w.completedAt == null) n++;
  }
  return n;
}

/** Ids blocked by sequential order among each parent's children ("do in order"). */
function sequentialBlocked(
  rootId: string,
  byParent: Map<string | null, TaskRow[]>,
  byId: ReadonlyMap<string, TaskRow>,
): Set<string> {
  const out = new Set<string>();
  for (const id of subtreeIds(rootId, byParent)) {
    const parent = byId.get(id);
    if (!parent?.sequential) continue;
    for (const b of blockedIds(byParent.get(id) ?? [], true)) out.add(b);
  }
  return out;
}

/** A top-level task's subtree for the view: pre-order, depth ≤ MAX_DEPTH, capped. */
function flowSubtasks(
  root: TaskRow,
  byParent: Map<string | null, TaskRow[]>,
  ix: DepIndex,
): FlowSubtaskOut[] {
  const nodes = flattenTree(root.id, byParent, subtreeIds(root.id, byParent));
  const seqBlocked = sequentialBlocked(root.id, byParent, ix.byId);
  const out: FlowSubtaskOut[] = [];
  for (const { task: s, depth: d0 } of nodes) {
    const depth = d0 + 1;
    if (depth > MAX_DEPTH) continue;
    if (out.length >= MAX_FLOW_SUBTASKS) break;
    const done = s.completedAt != null;
    const wait = waitingOf(s, ix);
    out.push({
      id: s.id,
      title: clipTitle(s.title),
      parentId: s.parentId ?? root.id,
      depth,
      done,
      ...(s.startDate ? { start: s.startDate } : {}),
      ...(s.dueDate ? { due: s.dueDate } : {}),
      ...(!done && (wait.blocked || seqBlocked.has(s.id)) ? { blocked: true as const } : {}),
      ...(wait.waitingOn ? { waitingOn: wait.waitingOn } : {}),
    });
  }
  return out;
}

/**
 * Resolve the effective options of a `get_flows` call. A saved stream's
 * definition supplies filter, groupBy and attention; explicit arguments win.
 * A saved `groupBy: "none"` (one ungrouped lane list) has no stream split to
 * report, so it falls back to the default, "tag".
 */
export function resolveFlowOptions(
  args: { groupBy?: McpFlowsGroupBy; attention?: AttentionMode },
  saved?: FlowsDisplay,
): { groupBy: McpFlowsGroupBy; attention: AttentionMode; filter: FlowsFilter } {
  const savedGroup = saved && saved.groupBy !== "none" ? saved.groupBy : undefined;
  return {
    groupBy: args.groupBy ?? savedGroup ?? "tag",
    attention: args.attention ?? saved?.attention ?? "combined",
    filter: saved?.filter ?? DEFAULT_FLOWS_FILTER,
  };
}

/**
 * Project the caller's tasks into `get_flows`' streams, on the same pure
 * pipeline the web app's Streams view uses (buildFlowLanes -> filterLanes ->
 * groupLanes -> buildStreams -> rankStreams) so the numbers agree. Status
 * events are not needed: attention reads only a task's due date, priority and
 * completion, none of which come from the event history (an empty events map
 * just gives each lane a birth node). A subtask raises its parent's attention
 * (laneAttention). Pure: no I/O, no clock. Never reads a task description.
 */
export function projectFlows(input: FlowsInput): FlowsOut {
  const { date, groupBy, attention, nowMs } = input;

  const byParent = groupByParent(input.tasks);
  const ix = indexDeps(input.tasks, input.dependencies);
  const topLevel = (byParent.get(null) ?? []).filter(
    (t) => !input.mine || t.ownerId === input.memberId || t.assigneeId === input.memberId,
  );

  const lanes = buildFlowLanes({
    topLevel,
    childrenByParent: byParent,
    eventsByTask: new Map(),
    nowMs,
  });
  const filtered = filterLanes(lanes, input.filter ?? DEFAULT_FLOWS_FILTER);

  const ctx: FlowsDisplayCtx = {
    boardsById: new Map(input.boards.map((b) => [b.id, b])),
    boardOrder: new Map(input.boards.map((b, i) => [b.id, i])),
    categoriesById: new Map(input.categories.map((c) => [c.id, c])),
    collectionsById: new Map(input.collections.map((c) => [c.id, c])),
    collectionOrder: new Map(input.collections.map((c, i) => [c.id, i])),
    membersById: new Map(input.members.map((m) => [m.id, m])),
    memberOrder: new Map(input.members.map((m, i) => [m.id, i])),
    today: date,
    attention,
    labels: LABELS,
  };

  const groups = groupLanes(filtered, groupBy, "manual", "asc", ctx);
  const ranked = rankStreams(buildStreams(groups, { nowMs, today: date, mode: attention }));

  const out: FlowStreamOut[] = ranked.slice(0, MAX_STREAMS).map((s) => {
    const tasks = s.lanes
      .filter((l) => !l.done)
      .map((l) => ({ lane: l, info: laneAttention(l, date, attention) }))
      .sort((a, b) => {
        if (a.info.score !== b.info.score) return b.info.score - a.info.score;
        // Equal pressure: the sooner deadline first, undated last.
        const da = a.info.daysToDue;
        const db = b.info.daysToDue;
        if (da === db) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      })
      .slice(0, input.limit)
      .map(({ lane, info }): FlowTaskOut => {
        const t = lane.task;
        const holds = holdsOf(t, ix);
        return {
          id: t.id,
          title: clipTitle(t.title),
          start: new Date(lane.startMs).toISOString().slice(0, 10),
          ...(t.dueDate ? { dueDate: t.dueDate } : {}),
          ...progressOf(t.id, byParent),
          ...(t.priority != null ? { priority: t.priority } : {}),
          score: round2(info.score),
          overdue: info.overdue,
          ...(t.tags.length > 0 ? { tags: t.tags } : {}),
          ...waitingOf(t, ix),
          ...(holds > 0 ? { holds } : {}),
          ...(input.withSubtasks ? { subtasks: flowSubtasks(t, byParent, ix) } : {}),
        };
      });
    return {
      key: s.key,
      label: s.label,
      open: s.open,
      done: s.done,
      overdue: s.overdue,
      needsAttention: s.attentionCount,
      ...(s.nextDue ? { nextDue: s.nextDue } : {}),
      score: round2(s.attention.score),
      tasks,
    };
  });

  return {
    date,
    groupBy,
    attention,
    ...(input.streamName !== undefined ? { stream: input.streamName } : {}),
    streams: out,
    ...(ranked.length > MAX_STREAMS ? { truncated: true as const } : {}),
  };
}

// -- one task, for editing ------------------------------------------------------

export interface TaskDetailSubtask {
  id: string;
  title: string;
  done: boolean;
  /** 1 = a direct child */
  depth: number;
  /** its own subtasks are "do in order" */
  sequential: boolean;
  /** open and waiting: on an unfinished dependency, or on an earlier sibling under a "do in order" parent */
  blocked: boolean;
  /** planned start, "yyyy-MM-dd" */
  start?: string;
  /** due date, "yyyy-MM-dd" */
  due?: string;
  /** ids of the tasks it waits for (done or not); absent when none */
  blockedBy?: string[];
}

/** A task on either end of a dependency, as `get_task` lists it. */
export interface TaskDetailLink {
  id: string;
  title: string;
  done: boolean;
}

export interface TaskDetailOut {
  id: string;
  title: string;
  done: boolean;
  dueDate?: string;
  startDate?: string;
  priority?: number;
  /** absent = the task is in no collection */
  collectionId?: string;
  tags: string[];
  /** its subtasks are "do in order" */
  sequential: boolean;
  /** the tasks this one waits for (done or not) */
  blockedBy: TaskDetailLink[];
  /** the tasks waiting for this one (done or not) */
  blocks: TaskDetailLink[];
  /** the whole subtree, parent before child, siblings in their stored order */
  subtasks: TaskDetailSubtask[];
}

/** How deep a subtree `get_task` walks, and how many subtasks it returns at most. */
const DETAIL_MAX_DEPTH = 6;
const DETAIL_MAX_SUBTASKS = 100;

/**
 * `get_task`'s output: the fields the Flows app edits, and the subtask tree
 * flattened pre-order. Pure. Never reads a description.
 */
export function projectTaskDetail(
  task: TaskRow,
  all: TaskRow[],
  dependencies: readonly TaskDependency[] = [],
): TaskDetailOut {
  const byParent = groupByParent(all);
  const ix = indexDeps(all, dependencies);
  const link = (t: TaskRow): TaskDetailLink => ({
    id: t.id,
    title: clipTitle(t.title),
    done: t.completedAt != null,
  });
  const blockersOf = (id: string): TaskRow[] => {
    const out: TaskRow[] = [];
    for (const d of dependencies) {
      const b = d.taskId === id ? ix.byId.get(d.dependsOnTaskId) : undefined;
      if (b && !out.includes(b)) out.push(b);
    }
    return out;
  };
  const subtasks: TaskDetailSubtask[] = [];
  const seen = new Set<string>([task.id]);
  const walk = (parentId: string, depth: number) => {
    if (depth > DETAIL_MAX_DEPTH) return;
    const kids = [...(byParent.get(parentId) ?? [])].sort((a, b) => a.position - b.position);
    const seqBlocked = blockedIds(kids, ix.byId.get(parentId)?.sequential ?? false);
    for (const kid of kids) {
      if (seen.has(kid.id) || subtasks.length >= DETAIL_MAX_SUBTASKS) continue;
      seen.add(kid.id);
      const done = kid.completedAt != null;
      const blockers = blockersOf(kid.id);
      subtasks.push({
        id: kid.id,
        title: clipTitle(kid.title),
        done,
        depth,
        sequential: kid.sequential,
        blocked: !done && (seqBlocked.has(kid.id) || blockers.some((b) => b.completedAt == null)),
        ...(kid.startDate ? { start: kid.startDate } : {}),
        ...(kid.dueDate ? { due: kid.dueDate } : {}),
        ...(blockers.length > 0 ? { blockedBy: blockers.map((b) => b.id) } : {}),
      });
      walk(kid.id, depth + 1);
    }
  };
  walk(task.id, 1);
  return {
    id: task.id,
    title: task.title,
    done: task.completedAt != null,
    ...(task.dueDate ? { dueDate: task.dueDate } : {}),
    ...(task.startDate ? { startDate: task.startDate } : {}),
    ...(task.priority != null ? { priority: task.priority } : {}),
    ...(task.collectionId ? { collectionId: task.collectionId } : {}),
    tags: task.tags,
    sequential: task.sequential,
    blockedBy: blockersOf(task.id).map(link),
    blocks: (ix.waiters.get(task.id) ?? [])
      .map((id) => ix.byId.get(id))
      .filter((t): t is TaskRow => t != null)
      .map(link),
    subtasks,
  };
}

/**
 * The column a task lands in when it enters `collectionId`: the collection's
 * done column for a finished task, else its first open one. Null for no
 * collection, or a collection with no such column.
 */
export function landingBoardId(
  boards: readonly Board[],
  collectionId: string | null,
  done: boolean,
): string | null {
  if (!collectionId) return null;
  const cols = boards
    .filter((b) => b.collectionId === collectionId)
    .sort((a, b) => a.position - b.position);
  return (cols.find((b) => b.isDone === done) ?? null)?.id ?? null;
}

/** A task and its whole subtree, parents before children, siblings in order. */
export function subtreeInOrder(root: TaskRow, all: TaskRow[]): TaskRow[] {
  const byParent = groupByParent(all);
  const out: TaskRow[] = [];
  const seen = new Set<string>();
  const walk = (task: TaskRow) => {
    if (seen.has(task.id)) return;
    seen.add(task.id);
    out.push(task);
    for (const kid of [...(byParent.get(task.id) ?? [])].sort((a, b) => a.position - b.position)) walk(kid);
  };
  walk(root);
  return out;
}
