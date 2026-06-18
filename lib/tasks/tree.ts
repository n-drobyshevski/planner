// Pure helpers for the task tree (N-level: a task and its nested subtasks). No I/O.
import type { TaskRow } from "@/lib/types";

/**
 * Maximum nesting depth, counted in edges from a root (depth 0). MAX_DEPTH = 3
 * means four visible levels (root → child → grandchild → great-grandchild). The
 * DB trigger `tasks_check_nesting` (20260701) mirrors this value — keep them in
 * sync.
 */
export const MAX_DEPTH = 3;

/** Id → task lookup for the whole tree. */
export type ById = Map<string, TaskRow>;

/** Build an id→task map over the full task list. */
export function indexById(tasks: TaskRow[]): ById {
  return new Map(tasks.map((t) => [t.id, t]));
}

/** Stable order: by position, then creation time as a tiebreak. */
export function sortByPosition(tasks: TaskRow[]): TaskRow[] {
  return [...tasks].sort(
    (a, b) => a.position - b.position || a.createdAt - b.createdAt,
  );
}

/**
 * Group tasks by parentId. The `null` key holds top-level tasks; every list is
 * sorted by position. One pass, so callers can look up children cheaply.
 */
export function groupByParent(tasks: TaskRow[]): Map<string | null, TaskRow[]> {
  const map = new Map<string | null, TaskRow[]>();
  for (const t of tasks) {
    const arr = map.get(t.parentId);
    if (arr) arr.push(t);
    else map.set(t.parentId, [t]);
  }
  for (const [key, arr] of map) map.set(key, sortByPosition(arr));
  return map;
}

/** Children of a parent, sorted by position. */
export function childrenOf(tasks: TaskRow[], parentId: string): TaskRow[] {
  return sortByPosition(tasks.filter((t) => t.parentId === parentId));
}

/** Completion progress of a list of subtasks (direct children only). */
export function progressOf(children: TaskRow[]): { done: number; total: number } {
  let done = 0;
  for (const c of children) if (c.completedAt != null) done++;
  return { done, total: children.length };
}

// --- N-level helpers ------------------------------------------------------
// All tree walks are cycle-safe (bounded / visited-guarded) so a malformed
// `parentId` chain can never hang the UI, even though the DB now forbids cycles.

/** Depth of a task in edges from its root (top-level task → 0). */
export function depthOf(task: TaskRow, byId: ById): number {
  let depth = 0;
  let cur = task.parentId;
  let guard = 0;
  while (cur != null) {
    const parent = byId.get(cur);
    if (!parent) break;
    depth++;
    cur = parent.parentId;
    if (++guard > byId.size) break; // cycle guard
  }
  return depth;
}

/**
 * Whether `ancestorId` sits above `nodeId` in the tree — i.e. walking up from
 * `nodeId` reaches `ancestorId`. Used to reject nesting a task under one of its
 * own descendants (that would create a cycle).
 */
export function isDescendant(
  ancestorId: string,
  nodeId: string,
  byId: ById,
): boolean {
  let cur = byId.get(nodeId)?.parentId ?? null;
  let guard = 0;
  while (cur != null) {
    if (cur === ancestorId) return true;
    cur = byId.get(cur)?.parentId ?? null;
    if (++guard > byId.size) break; // cycle guard
  }
  return false;
}

/** Deepest path below a node, in edges (a leaf → 0). */
export function maxSubtreeDepth(
  rootId: string,
  byParent: Map<string | null, TaskRow[]>,
  seen: Set<string> = new Set(),
): number {
  if (seen.has(rootId)) return 0; // cycle guard
  seen.add(rootId);
  const kids = byParent.get(rootId);
  if (!kids || kids.length === 0) return 0;
  let max = 0;
  for (const k of kids) max = Math.max(max, 1 + maxSubtreeDepth(k.id, byParent, seen));
  return max;
}

/** Every id in a subtree, including `rootId`. Cycle-safe. */
export function subtreeIds(
  rootId: string,
  byParent: Map<string | null, TaskRow[]>,
): Set<string> {
  const out = new Set<string>();
  const walk = (id: string) => {
    if (out.has(id)) return;
    out.add(id);
    for (const k of byParent.get(id) ?? []) walk(k.id);
  };
  walk(rootId);
  return out;
}

/** Completion progress over a whole subtree (all descendants, excluding root). */
export function progressDeep(
  rootId: string,
  byParent: Map<string | null, TaskRow[]>,
): { done: number; total: number } {
  let done = 0;
  let total = 0;
  const seen = new Set<string>();
  const walk = (id: string) => {
    for (const k of byParent.get(id) ?? []) {
      if (seen.has(k.id)) continue;
      seen.add(k.id);
      total++;
      if (k.completedAt != null) done++;
      walk(k.id);
    }
  };
  walk(rootId);
  return { done, total };
}

/** A task flattened for a recursive list, with its render depth. */
export interface FlatNode {
  task: TaskRow;
  depth: number;
  hasChildren: boolean;
}

/**
 * Pre-order DFS over the descendants of `parentId` (direct children at depth 0).
 * A node's children are emitted only when its id is in `expanded`, so collapsed
 * subtrees are skipped. Lists from `byParent` are already position-sorted.
 */
export function flattenTree(
  parentId: string | null,
  byParent: Map<string | null, TaskRow[]>,
  expanded: ReadonlySet<string>,
): FlatNode[] {
  const out: FlatNode[] = [];
  const seen = new Set<string>();
  const walk = (pid: string | null, depth: number) => {
    for (const task of byParent.get(pid) ?? []) {
      if (seen.has(task.id)) continue; // cycle guard
      seen.add(task.id);
      const kids = byParent.get(task.id);
      const hasChildren = !!kids && kids.length > 0;
      out.push({ task, depth, hasChildren });
      if (hasChildren && expanded.has(task.id)) walk(task.id, depth + 1);
    }
  };
  walk(parentId, 0);
  return out;
}
