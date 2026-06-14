"use client";

import * as React from "react";
import { SquarePen, CheckCircle2, Circle, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const done = task.status === "done";
  return (
    <ItemContextMenu
      title={task.title}
      color={task.color}
      onColorChange={onChangeColor}
      actions={[
        { label: t("contextMenu.open"), icon: SquarePen, onSelect: onOpen },
        {
          label: done ? t("contextMenu.markNotDone") : t("contextMenu.markDone"),
          icon: done ? Circle : CheckCircle2,
          onSelect: onToggleDone,
        },
        { label: tc("delete"), icon: Trash2, destructive: true, onSelect: onDelete },
      ]}
    >
      {children}
    </ItemContextMenu>
  );
}
