"use client";

import { useMemo, useState } from "react";
import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { positionBetween } from "@/lib/tasks/ordering";
import type { FlowLane } from "@/lib/tasks/flows-layout";
import type { TaskRow } from "@/lib/types";

/**
 * Drag state for reordering Flows lanes. Reorder is a pure presentation concern:
 * a drop reports the moved lane's new fractional `flowPos` (a global manual
 * order, persisted in the task's attributes) via `onReorder`. The new rank is
 * the midpoint between the dragged lane's neighbors *within the same group*, so
 * reordering respects grouping and never changes a task's status/category.
 */
export function useFlowsDnd(
  orderedLanes: FlowLane[],
  opts: {
    /** the lane's current sort anchor (flowPos ?? baseline index) */
    anchorOf: (id: string) => number;
    /** the group bucket a lane sits in (so reorder stays within a group) */
    groupOf: (id: string) => string;
    onReorder: (task: TaskRow, flowPos: number) => void;
  },
) {
  const { anchorOf, groupOf, onReorder } = opts;
  const ids = useMemo(() => orderedLanes.map((l) => l.task.id), [orderedLanes]);
  const byId = useMemo(
    () => new Map(orderedLanes.map((l) => [l.task.id, l.task])),
    [orderedLanes],
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  // Mirror the board: mouse drags at 5px, touch after a 200ms long-press,
  // keyboard via the sortable coordinate getter.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;

    const activeStr = String(active.id);
    const overStr = String(over.id);
    if (activeStr === overStr) return;

    const oldIndex = ids.indexOf(activeStr);
    const overIndex = ids.indexOf(overStr);
    if (oldIndex < 0 || overIndex < 0 || oldIndex === overIndex) return;

    const task = byId.get(activeStr);
    if (!task) return;

    const order = arrayMove(ids, oldIndex, overIndex);
    const pos = order.indexOf(activeStr);
    const group = groupOf(activeStr);

    // Bracket by the nearest neighbors in the SAME group; the midpoint of their
    // anchors becomes the new global rank.
    let before: number | null = null;
    let after: number | null = null;
    for (let i = pos - 1; i >= 0; i--) {
      if (groupOf(order[i]) === group) {
        before = anchorOf(order[i]);
        break;
      }
    }
    for (let i = pos + 1; i < order.length; i++) {
      if (groupOf(order[i]) === group) {
        after = anchorOf(order[i]);
        break;
      }
    }
    if (before === null && after === null) return; // alone in its group — no move

    onReorder(task, positionBetween(before, after));
  }

  const activeLane = activeId
    ? orderedLanes.find((l) => l.task.id === activeId) ?? null
    : null;

  return { ids, sensors, activeId, activeLane, onDragStart, onDragEnd };
}
