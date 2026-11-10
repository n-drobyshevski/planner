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
import type { ById } from "@/lib/tasks/tree";
import { nestCollision, nestTargetId } from "@/lib/tasks/nest-collision";
import type { FlowLane } from "@/lib/tasks/flows-layout";
import type { TaskRow } from "@/lib/types";

/** One draggable gutter row: a lane as it sits in one group. */
export interface FlowsDndItem {
  /** the row's key (`${groupKey}:${taskId}`); the sortable + nest droppable id */
  key: string;
  lane: FlowLane;
  /** the group bucket this row sits in */
  group: string;
}

/**
 * Drag state for the Flows gutter. One gesture, two outcomes: dropping a lane on
 * the *middle* of another files it as a subtask (`onReparent`, available in any
 * sort mode); dropping on an edge reorders the lanes (`onReorder`, only in manual
 * sort). The custom collision routes a centre-band hover to a per-row `nest:`
 * droppable, driving the highlight (`nestTargetId`, a row key) without the
 * reorder reflow stealing the target.
 *
 * Ids are ROW keys, not task ids: grouping by tag shows a multi-tag task once
 * per tag, so a task id is not unique in the list. What a drop means:
 *  - Reorder stays within the dragged row's group (a drop onto another group's
 *    row is ignored: group membership comes from the task's own fields, so a
 *    drag can't move it between groups). The new rank is the midpoint of the
 *    neighbouring rows' anchors in that group, written to the task's single
 *    global `flowPos`, so the task moves in every group it appears in.
 *  - Nesting targets the task behind the row. Dropping a task onto another
 *    copy of itself is refused, and so is nesting across collections (scope
 *    "all"): a subtask lives in its parent's collection, and the reparent
 *    mutation does not move the child's collection.
 */
export function useFlowsDnd(
  items: FlowsDndItem[],
  opts: {
    /** a task's current sort anchor (flowPos ?? baseline index), by task id */
    anchorOf: (taskId: string) => number;
    onReorder: (task: TaskRow, flowPos: number) => void;
    onReparent: (child: TaskRow, parentId: string) => void;
    /** Whole-tree maps for cycle + max-depth checks. */
    treeById: ById;
    treeByParent: Map<string | null, TaskRow[]>;
    /** reorder only persists in manual sort; nesting works regardless */
    canReorder: boolean;
  },
) {
  const { anchorOf, onReorder, onReparent, treeById, treeByParent, canReorder } = opts;
  const ids = useMemo(() => items.map((i) => i.key), [items]);
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [nestTarget, setNestTarget] = useState<string | null>(null);

  // Mirror the board: mouse drags at 5px, touch after a 200ms long-press,
  // keyboard via the sortable coordinate getter.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const canNestInto = useCallback(
    (childKey: string, parentKey: string) => {
      const childLane = byKey.get(childKey)?.lane;
      const parentLane = byKey.get(parentKey)?.lane;
      if (!childLane || !parentLane) return false;
      if (childLane.task.id === parentLane.task.id) return false; // its own copy
      const child = treeById.get(childLane.task.id);
      const parent = treeById.get(parentLane.task.id);
      if (!child || !parent) return false;
      if (child.collectionId !== parent.collectionId) return false;
      return canNest(child, parent, treeById, treeByParent);
    },
    [byKey, treeById, treeByParent],
  );
  const collisionDetection = useMemo(
    () => nestCollision(canNestInto, closestCenter),
    [canNestInto],
  );

  function onDragStart(e: DragStartEvent) {
    setActiveKey(String(e.active.id));
  }

  function onDragOver(e: DragOverEvent) {
    setNestTarget(nestTargetId(e.over ? String(e.over.id) : null));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveKey(null);
    setNestTarget(null);
    if (!over) return;

    const activeStr = String(active.id);
    const dragged = byKey.get(activeStr);
    if (!dragged) return;

    // Centre-drop → nest as a subtask (works in any sort mode).
    const nestKey = nestTargetId(String(over.id));
    if (nestKey) {
      const target = byKey.get(nestKey);
      if (target && canNestInto(activeStr, nestKey)) onReparent(dragged.lane.task, target.lane.task.id);
      return;
    }

    if (!canReorder) return; // edges only reorder, and only in manual sort

    const overStr = String(over.id);
    if (activeStr === overStr) return;
    const overItem = byKey.get(overStr);
    if (!overItem || overItem.group !== dragged.group) return; // reorder stays in its group

    const oldIndex = ids.indexOf(activeStr);
    const overIndex = ids.indexOf(overStr);
    if (oldIndex < 0 || overIndex < 0 || oldIndex === overIndex) return;

    const order = arrayMove(ids, oldIndex, overIndex);
    const pos = order.indexOf(activeStr);
    const groupOf = (key: string) => byKey.get(key)?.group;
    const anchorOfKey = (key: string) => anchorOf(byKey.get(key)!.lane.task.id);

    // Bracket by the nearest neighbors in the SAME group; the midpoint of their
    // anchors becomes the new global rank.
    let before: number | null = null;
    let after: number | null = null;
    for (let i = pos - 1; i >= 0; i--) {
      if (groupOf(order[i]) === dragged.group) {
        before = anchorOfKey(order[i]);
        break;
      }
    }
    for (let i = pos + 1; i < order.length; i++) {
      if (groupOf(order[i]) === dragged.group) {
        after = anchorOfKey(order[i]);
        break;
      }
    }
    if (before === null && after === null) return; // alone in its group — no move

    onReorder(dragged.lane.task, positionBetween(before, after));
  }

  function onDragCancel() {
    setActiveKey(null);
    setNestTarget(null);
  }

  const activeLane = activeKey ? (byKey.get(activeKey)?.lane ?? null) : null;

  return {
    ids,
    sensors,
    activeId: activeKey,
    activeLane,
    /** the row key of the pending nest target, if any */
    nestTargetId: nestTarget,
    collisionDetection,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  };
}
