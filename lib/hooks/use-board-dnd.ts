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
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { positionBetween } from "@/lib/tasks/ordering";
import { useOptimisticOrder } from "@/lib/hooks/use-optimistic-order";
import type { TaskRow, TaskStatus } from "@/lib/types";

/** Card ids per status column, in display order. */
export type Columns = Record<TaskStatus, string[]>;

export const isColumn = (id: string): id is TaskStatus =>
  id === "todo" || id === "in_progress" || id === "done";

function buildColumns(tasks: TaskRow[]): Columns {
  const cols: Columns = { todo: [], in_progress: [], done: [] };
  const sorted = [...tasks].sort(
    (a, b) => a.position - b.position || a.createdAt - b.createdAt,
  );
  for (const t of sorted) cols[t.status].push(t.id);
  return cols;
}

/**
 * Drag state + handlers for the kanban board: column membership is kept as an
 * optimistic local copy (resynced from the tasks prop unless a drag is live),
 * and a completed drop reports the moved task's new column + fractional
 * position via `onMove`.
 */
export function useBoardDnd(
  tasks: TaskRow[],
  onMove: (t: TaskRow, status: TaskStatus, position: number) => void,
) {
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const source = useMemo(() => buildColumns(tasks), [tasks]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [items, setItems] = useOptimisticOrder(source, activeId !== null);

  // Mouse drags immediately (5px); touch requires a 200ms long-press so the
  // board can still be scrolled and swiped between columns on a phone.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findContainer = (id: string): TaskStatus | null => {
    if (isColumn(id)) return id;
    return (Object.keys(items) as TaskStatus[]).find((c) =>
      items[c].includes(id),
    ) ?? null;
  };

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;

    const activeIdStr = String(active.id);
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

  const activeTask = activeId ? byId.get(activeId) ?? null : null;

  return { byId, items, activeTask, sensors, onDragStart, onDragEnd };
}
