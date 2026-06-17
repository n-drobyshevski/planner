// Drag-to-nest rules shared by the three task views (board / list / flows).
// The product models exactly two levels — a task and its subtasks — so these
// guards keep a drop from ever creating a third (grandchild) level. Pure: no I/O.
import type { TaskRow } from "@/lib/types";

/** What a drag-over a row resolves to. Edges reorder; the centre nests. */
export type DropMode = "nest" | "before" | "after";

/**
 * Whether `child` may become a subtask of `parent` without deepening the tree
 * past two levels:
 * - not onto itself, and not onto its current parent (a no-op);
 * - `parent` must be top-level (nesting under a subtask would make a grandchild);
 * - `child` must be a leaf (nesting a parent would orphan its subtasks as
 *   invisible grandchildren).
 */
export function canNest(
  child: TaskRow,
  parent: TaskRow,
  hasChildren: (taskId: string) => boolean,
): boolean {
  if (child.id === parent.id) return false;
  if (child.parentId === parent.id) return false;
  if (parent.parentId !== null) return false;
  if (hasChildren(child.id)) return false;
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
