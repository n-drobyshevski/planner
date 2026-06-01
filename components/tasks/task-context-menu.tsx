"use client";

import * as React from "react";
import { SquarePen, CheckCircle2, Circle, Trash2 } from "lucide-react";
import { ItemContextMenu } from "@/components/shared/item-context-menu";
import type { TaskRow } from "@/lib/types";

/**
 * Right-click / long-press menu for a task card: Open, toggle done, recolor, and
 * delete. Wraps the given card (TaskCard) — see ItemContextMenu for the
 * desktop-vs-mobile behaviour.
 */
export function TaskContextMenu({
  task,
  onOpen,
  onToggleDone,
  onDelete,
  onChangeColor,
  children,
}: {
  task: TaskRow;
  onOpen: () => void;
  onToggleDone: () => void;
  onDelete: () => void;
  onChangeColor: (color: string | null) => void;
  children: React.ReactElement;
}) {
  const done = task.status === "done";
  return (
    <ItemContextMenu
      title={task.title}
      color={task.color}
      onColorChange={onChangeColor}
      actions={[
        { label: "Open", icon: SquarePen, onSelect: onOpen },
        {
          label: done ? "Mark not done" : "Mark done",
          icon: done ? Circle : CheckCircle2,
          onSelect: onToggleDone,
        },
        { label: "Delete", icon: Trash2, destructive: true, onSelect: onDelete },
      ]}
    >
      {children}
    </ItemContextMenu>
  );
}
