"use client";

import { useCallback, useMemo, useState } from "react";
import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { positionBetween } from "@/lib/tasks/ordering";
import { canNest } from "@/lib/tasks/nesting";
import { nestCollision, nestTargetId } from "@/lib/tasks/nest-collision";
import type { FlowLane } from "@/lib/tasks/flows-layout";
import type { TaskRow } from "@/lib/types";

/**
 * Drag state for the Flows gutter. One gesture, two outcomes: dropping a lane on
 * the *middle* of another files it as a subtask (`onReparent`, available in any
 * sort mode); dropping on an edge reorders the lanes (`onReorder`, only in manual
 * sort). Reorder reports a fractional `flowPos` — the midpoint between the
 * dragged lane's neighbors within the same group, so it respects grouping and
 * never changes a task's status/category. The custom collision routes a
 * centre-band hover to a per-lane `nest:` droppable, driving the highlight
 * (`nestTargetId`) without the reorder reflow stealing the target.
 */
export function useFlowsDnd(
  orderedLanes: FlowLane[],
  opts: {
    /** the lane's current sort anchor (flowPos ?? baseline index) */
    anchorOf: (id: string) => number;
    /** the group bucket a lane sits in (so reorder stays within a group) */
    groupOf: (id: string) => string;
    onReorder: (task: TaskRow, flowPos: number) => void;
    onReparent: (child: TaskRow, parentId: string) => void;
    hasChildren: (taskId: string) => boolean;
    /** reorder only persists in manual sort; nesting works regardless */
    canReorder: boolean;
  },
) {
  const { anchorOf, groupOf, onReorder, onReparent, hasChildren, canReorder } = opts;
  const ids = useMemo(() => orderedLanes.map((l) => l.task.id), [orderedLanes]);
  const byId = useMemo(
    () => new Map(orderedLanes.map((l) => [l.task.id, l.task])),
    [orderedLanes],
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [nestTarget, setNestTarget] = useState<string | null>(null);

  // Mirror the board: mouse drags at 5px, touch after a 200ms long-press,
  // keyboard via the sortable coordinate getter.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const canNestInto = useCallback(
    (childId: string, parentId: string) => {
      const child = byId.get(childId);
      const parent = byId.get(parentId);
      return !!child && !!parent && canNest(child, parent, hasChildren);
    },
    [byId, hasChildren],
  );
  const collisionDetection = useMemo(
    () => nestCollision(canNestInto, closestCenter),
    [canNestInto],
  );

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragOver(e: DragOverEvent) {
    setNestTarget(nestTargetId(e.over ? String(e.over.id) : null));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    setNestTarget(null);
    if (!over) return;

    const activeStr = String(active.id);

    // Centre-drop → nest as a subtask (works in any sort mode).
    const nestId = nestTargetId(String(over.id));
    if (nestId) {
      const child = byId.get(activeStr);
      if (child) onReparent(child, nestId);
      return;
    }

    if (!canReorder) return; // edges only reorder, and only in manual sort

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

  function onDragCancel() {
    setActiveId(null);
    setNestTarget(null);
  }

  const activeLane = activeId
    ? orderedLanes.find((l) => l.task.id === activeId) ?? null
    : null;

  return {
    ids,
    sensors,
    activeId,
    activeLane,
    nestTargetId: nestTarget,
    collisionDetection,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  };
}
