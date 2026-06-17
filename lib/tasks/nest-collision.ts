"use client";

import { closestCorners, type CollisionDetection } from "@dnd-kit/core";

/** Prefix for the per-item drop-to-nest droppable (registered over the item box). */
export const NEST_PREFIX = "nest:";

/** The task id behind a `nest:<id>` droppable id, or null if it isn't one. */
export function nestTargetId(overId: string | null | undefined): string | null {
  if (typeof overId !== "string" || !overId.startsWith(NEST_PREFIX)) return null;
  return overId.slice(NEST_PREFIX.length);
}

/**
 * Collision detection for a sortable list that also supports drag-to-nest. Each
 * item registers a second droppable `nest:<id>` over its own box. When the
 * pointer sits in an item's centre band (and `canNestInto` allows it), we resolve
 * to that nest droppable. Because a nest droppable is *not* a sortable item,
 * returning it suppresses the reorder reflow — so the target stays put under the
 * pointer instead of sliding away. Outside the centre band we fall back to the
 * base strategy over the non-nest droppables (columns + items) for reordering.
 */
export function nestCollision(
  canNestInto: (activeId: string, overTaskId: string) => boolean,
  base: CollisionDetection = closestCorners,
): CollisionDetection {
  return (args) => {
    const pointer = args.pointerCoordinates;
    if (pointer) {
      const activeId = String(args.active.id);
      for (const container of args.droppableContainers) {
        const id = String(container.id);
        if (!id.startsWith(NEST_PREFIX)) continue;
        const rect = args.droppableRects.get(container.id);
        if (!rect) continue;
        const insideX = pointer.x >= rect.left && pointer.x <= rect.right;
        const insideY = pointer.y >= rect.top && pointer.y <= rect.bottom;
        if (!insideX || !insideY) continue;
        const ratio = (pointer.y - rect.top) / rect.height;
        if (ratio <= 0.25 || ratio >= 0.75) continue; // outer quarters reorder
        if (canNestInto(activeId, id.slice(NEST_PREFIX.length))) {
          return [{ id: container.id }];
        }
      }
    }
    // Reorder/move: hide the nest droppables so they never win a normal drop.
    return base({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (c) => !String(c.id).startsWith(NEST_PREFIX),
      ),
    });
  };
}
