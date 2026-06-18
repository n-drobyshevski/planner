// Drag-to-nest rules shared by the three task views (board / list / flows).
// The product allows N-level nesting (a task and its nested subtasks); these
// guards keep a drop from creating a cycle or exceeding the max depth. Pure: no I/O.
import type { TaskRow } from "@/lib/types";
import {
  MAX_DEPTH,
  depthOf,
  isDescendant,
  maxSubtreeDepth,
  type ById,
} from "@/lib/tasks/tree";

/** What a drag-over a row resolves to. Edges reorder; the centre nests. */
export type DropMode = "nest" | "before" | "after";

/**
 * Whether `child` may become a subtask of `parent`:
 * - not onto itself, and not onto its current parent (a no-op);
 * - never under one of `child`'s own descendants (CYCLE prevention);
 * - the resulting deepest leaf must stay within MAX_DEPTH — the parent's depth
 *   plus one (the child's new depth) plus the child's own subtree depth.
 * `byId` / `byParent` describe the whole task tree (build once per view).
 */
export function canNest(
  child: TaskRow,
  parent: TaskRow,
  byId: ById,
  byParent: Map<string | null, TaskRow[]>,
): boolean {
  if (child.id === parent.id) return false;
  if (child.parentId === parent.id) return false;
  if (isDescendant(child.id, parent.id, byId)) return false; // CYCLE
  const newChildDepth = depthOf(parent, byId) + 1;
  if (newChildDepth + maxSubtreeDepth(child.id, byParent) > MAX_DEPTH) return false; // MAX-DEPTH
  return true;
}

/**
 * Resolve drop intent from the pointer's vertical position over a target row.
 * The middle band nests (when nesting is allowed); the outer quarters reorder.
 * `pointerY` and `rect` are viewport coordinates (getBoundingClientRect space).
 */
export function dropModeFromPointer(
  pointerY: number,
  rect: { top: number; height: number },
  nestable: boolean,
): DropMode {
  if (rect.height <= 0) return "after";
  const ratio = (pointerY - rect.top) / rect.height;
  if (nestable && ratio > 0.25 && ratio < 0.75) return "nest";
  return ratio < 0.5 ? "before" : "after";
}
