"use client";

import * as React from "react";
import {
  SquarePen,
  CheckCircle2,
  Circle,
  Crosshair,
  Flag,
  ListPlus,
  Outdent,
  UnfoldVertical,
  FoldVertical,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { ItemContextMenu, type ItemAction } from "@/components/shared/item-context-menu";
import type { TaskRow } from "@/lib/types";

/**
 * Right-click menu for a Flows side-panel row (trunk or branch). Shares the
 * task quick-actions (open, toggle done, recolor, delete) with the board/list
 * menu, and adds the view-specific ones: centre the row's span on the timeline,
 * and — for a top-level lane — add a subtask or expand/collapse every lane.
 *
 * Desktop right-click only: the Flows view never renders on phones (the shell
 * falls back to List), so the mobile ⋮ sheet is disabled.
 */
export function FlowRowMenu({
  task,
  onOpen,
  onToggleDone,
  onCenter,
  onDelete,
  onChangeColor,
  onAddSubtask,
  onPromote,
  onAddCheckpoint,
  onExpandAll,
  onCollapseAll,
  children,
}: {
  task: TaskRow;
  onOpen: () => void;
  onToggleDone: () => void;
  /** Scroll the canvas so this row's activity sits at the centre. */
  onCenter: () => void;
  onDelete: () => void;
  onChangeColor: (color: string | null) => void;
  /** Top-level lanes only: create a child task under this one. */
  onAddSubtask?: () => void;
  /** Subtask branch rows only: un-nest back to a top-level task. */
  onPromote?: () => void;
  /** Top-level lanes only: add a milestone checkpoint to this flow. */
  onAddCheckpoint?: () => void;
  /** Top-level lanes only: expand/collapse every lane with subtasks. */
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
  children: React.ReactElement;
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const done = task.completedAt != null;

  const actions: ItemAction[] = [
    { label: t("contextMenu.open"), icon: SquarePen, onSelect: onOpen },
    {
      label: done ? t("contextMenu.markNotDone") : t("contextMenu.markDone"),
      icon: done ? Circle : CheckCircle2,
      onSelect: onToggleDone,
    },
    { label: t("flows.menu.center"), icon: Crosshair, onSelect: onCenter },
  ];
  if (onAddSubtask) {
    actions.push({ label: t("flows.menu.addSubtask"), icon: ListPlus, onSelect: onAddSubtask });
  }
  if (onPromote) {
    actions.push({ label: t("flows.menu.promote"), icon: Outdent, onSelect: onPromote });
  }
  if (onAddCheckpoint) {
    actions.push({ label: t("flows.menu.addCheckpoint"), icon: Flag, onSelect: onAddCheckpoint });
  }
  if (onExpandAll && onCollapseAll) {
    actions.push(
      { label: t("flows.menu.expandAll"), icon: UnfoldVertical, onSelect: onExpandAll },
      { label: t("flows.menu.collapseAll"), icon: FoldVertical, onSelect: onCollapseAll },
    );
  }
  actions.push({ label: tc("delete"), icon: Trash2, destructive: true, onSelect: onDelete });

  return (
    <ItemContextMenu
      title={task.title}
      color={task.color}
      onColorChange={onChangeColor}
      mobileSheet={false}
      actions={actions}
    >
      {children}
    </ItemContextMenu>
  );
}
