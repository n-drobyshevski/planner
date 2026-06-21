"use client";

import { useCallback, useMemo, useState } from "react";
import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { positionBetween } from "@/lib/tasks/ordering";
import { canNest } from "@/lib/tasks/nesting";
import type { ById } from "@/lib/tasks/tree";
import { nestCollision, nestTargetId } from "@/lib/tasks/nest-collision";
import { useOptimisticOrder } from "@/lib/hooks/use-optimistic-order";
import type { TaskRow, Board } from "@/lib/types";

/** Card ids per board column (keyed by board id), in display order. */
export type Columns = Record<string, string[]>;

function buildColumns(tasks: TaskRow[], boards: Board[]): Columns {
  const cols: Columns = {};
  for (const b of boards) cols[b.id] = [];
  const sorted = [...tasks].sort(
    (a, b) => a.position - b.position || a.createdAt - b.createdAt,
  );
  for (const t of sorted) {
    if (t.boardId && cols[t.boardId]) cols[t.boardId].push(t.id);
  }
  return cols;
}

/**
 * Drag state + handlers for the kanban board. Two outcomes share one gesture:
 * dropping over the *middle* of another card files the dragged task under it as
 * a subtask (`onReparent`); dropping over a card's edge or a column moves/reorders
 * it (`onMove`). The custom collision routes a centre-band hover to a per-card
 * `nest:` droppable, which both drives the highlight (`nestTargetId`) and keeps
 * the target from reflowing away under the pointer. Column membership is an
 * optimistic local copy (resynced from the tasks prop unless a drag is live).
 */
export function useBoardDnd(
  tasks: TaskRow[],
  boards: Board[],
  onMove: (t: TaskRow, boardId: string, position: number) => void,
  onReparent: (child: TaskRow, parentId: string) => void,
  // Whole-tree maps (all collection tasks, not just the columns) so cycle and
  // max-depth checks see a dragged card's full subtree.
  treeById: ById,
  treeByParent: Map<string | null, TaskRow[]>,
) {
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const boardIds = useMemo(() => new Set(boards.map((b) => b.id)), [boards]);
  const source = useMemo(() => buildColumns(tasks, boards), [tasks, boards]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [nestTarget, setNestTarget] = useState<string | null>(null);
  const [items, setItems] = useOptimisticOrder(source, activeId !== null);

  // Mouse drags immediately (5px); touch requires a 200ms long-press so the
  // board can still be scrolled and swiped between columns on a phone.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const canNestInto = useCallback(
    (childId: string, parentId: string) => {
      const child = treeById.get(childId);
      const parent = treeById.get(parentId);
      return !!child && !!parent && canNest(child, parent, treeById, treeByParent);
    },
    [treeById, treeByParent],
  );
  const collisionDetection = useMemo(() => nestCollision(canNestInto), [canNestInto]);

  const isColumn = (id: string): boolean => boardIds.has(id);

  const findContainer = (id: string): string | null => {
    if (isColumn(id)) return id;
    return Object.keys(items).find((c) => items[c].includes(id)) ?? null;
  };

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragOver(e: DragOverEvent) {
    // Fires on every pointer move during a drag. `setState` bails on an equal
    // value, but compute first and pass the updater so React only schedules a
    // board re-render when the resolved nest target actually changes.
    const next = nestTargetId(e.over ? String(e.over.id) : null);
    setNestTarget((prev) => (prev === next ? prev : next));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    setNestTarget(null);
    if (!over) return;

    const activeIdStr = String(active.id);

    // Centre-drop on another card → nest it as a subtask; skip the reorder math.
    const nestId = nestTargetId(String(over.id));
    if (nestId) {
      const child = byId.get(activeIdStr);
      if (child) onReparent(child, nestId);
      return;
    }

    const overIdStr = String(over.id);
    const activeC = findContainer(activeIdStr);
    const overC = isColumn(overIdStr) ? overIdStr : findContainer(overIdStr);
    if (!activeC || !overC) return;

    const withoutActive = items[activeC].filter((id) => id !== activeIdStr);
    const base = activeC === overC ? withoutActive : items[overC];

    let insertIndex: number;
    if (isColumn(overIdStr)) {
      insertIndex = base.length; // dropped on the column body
    } else {
      const idx = base.indexOf(overIdStr);
      insertIndex = idx >= 0 ? idx : base.length;
    }

    const overArr = [
      ...base.slice(0, insertIndex),
      activeIdStr,
      ...base.slice(insertIndex),
    ];
    const next: Columns = { ...items, [activeC]: withoutActive, [overC]: overArr };
    if (activeC === overC) next[activeC] = overArr;

    // No change at all → nothing to persist.
    if (
      activeC === overC &&
      items[activeC].join() === next[activeC].join()
    ) {
      return;
    }

    setItems(next);

    const finalArr = next[overC];
    const pos = finalArr.indexOf(activeIdStr);
    const before = pos > 0 ? byId.get(finalArr[pos - 1])?.position ?? null : null;
    const after =
      pos < finalArr.length - 1
        ? byId.get(finalArr[pos + 1])?.position ?? null
        : null;
    const task = byId.get(activeIdStr);
    if (task) onMove(task, overC, positionBetween(before, after));
  }

  function onDragCancel() {
    setActiveId(null);
    setNestTarget(null);
  }

  const activeTask = activeId ? byId.get(activeId) ?? null : null;

  return {
    byId,
    items,
    activeTask,
    nestTargetId: nestTarget,
    collisionDetection,
    sensors,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  };
}
