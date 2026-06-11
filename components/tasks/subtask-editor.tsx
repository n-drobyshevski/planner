"use client";

import { useMemo, useState } from "react";
import { useForm } from "@tanstack/react-form";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Lock, Plus, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTaskMutations } from "@/lib/hooks/use-task-mutations";
import { useOptimisticOrder } from "@/lib/hooks/use-optimistic-order";
import { sortByPosition, progressOf } from "@/lib/tasks/tree";
import { blockedIds } from "@/lib/tasks/blocking";
import { positionBetween } from "@/lib/tasks/ordering";
import { cn } from "@/lib/utils";
import type { TaskInput } from "@/lib/supabase/mappers";
import type { TaskRow } from "@/lib/types";

export function SubtaskEditor({
  parent,
  subtasks,
  workspaceId,
}: {
  parent: TaskRow;
  subtasks: TaskRow[];
  workspaceId: string;
}) {
  const mutations = useTaskMutations(workspaceId);
  const ordered = useMemo(() => sortByPosition(subtasks), [subtasks]);
  const byId = useMemo(() => new Map(ordered.map((t) => [t.id, t])), [ordered]);

  // Optimistic local order, resynced from props unless a drag is live.
  const sourceIds = useMemo(() => ordered.map((t) => t.id), [ordered]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [orderIds, setOrderIds] = useOptimisticOrder(
    sourceIds,
    activeId !== null,
    // sourceIds is recomputed per subtasks identity; compare content, not
    // reference, so an unrelated parent re-render can't reset a pending drag.
    (a, b) => a.join() === b.join(),
  );

  const blocked = useMemo(
    () => blockedIds(ordered, parent.sequential),
    [ordered, parent.sequential],
  );
  const { done, total } = progressOf(ordered);

  // The add-row is a tiny form of its own; the inline renames stay uncontrolled
  // blur-commit inputs (SubtaskRow) where a form adds nothing.
  const addForm = useForm({
    defaultValues: { title: "" },
    onSubmit: ({ value }) => {
      const title = value.title.trim();
      if (!title) return;
      const input: TaskInput = {
        workspaceId,
        ownerId: parent.ownerId,
        parentId: parent.id,
        boardId: parent.boardId,
        assigneeId: parent.assigneeId,
        categoryId: parent.categoryId,
        title,
        isPrivate: parent.isPrivate,
        position: Date.now(),
      };
      addForm.reset();
      void mutations.create(input);
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = orderIds.indexOf(String(active.id));
    const to = orderIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(orderIds, from, to);
    setOrderIds(next);
    const pos = next.indexOf(String(active.id));
    const before = pos > 0 ? byId.get(next[pos - 1])?.position ?? null : null;
    const after =
      pos < next.length - 1 ? byId.get(next[pos + 1])?.position ?? null : null;
    void mutations.update(String(active.id), {
      position: positionBetween(before, after),
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          Subtasks
          {total > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {done}/{total}
            </span>
          )}
        </div>
        {total > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <span>Do in order</span>
            <Switch
              checked={parent.sequential}
              onCheckedChange={(v) =>
                void mutations.update(parent.id, { sequential: v })
              }
              aria-label="Complete subtasks in order"
            />
          </label>
        )}
      </div>

      {total > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${total ? (done / total) * 100 : 0}%` }}
          />
        </div>
      )}

      {parent.sequential && total > 0 && (
        <p className="text-xs text-muted-foreground">
          Each subtask unlocks when the one before it is done.
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={orderIds} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-1">
            {orderIds.map((id) => {
              const t = byId.get(id);
              if (!t) return null;
              return (
                <SubtaskRow
                  key={id}
                  task={t}
                  blocked={blocked.has(id)}
                  onToggleDone={() => void mutations.toggleDone(t)}
                  onRename={(title) => {
                    if (title && title !== t.title)
                      void mutations.update(t.id, { title });
                  }}
                  onDelete={() => void mutations.remove(t.id)}
                />
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>

      {total === 0 && (
        <p className="text-xs text-muted-foreground">
          No subtasks yet — break this task into steps.
        </p>
      )}

      <div className="flex items-center gap-2">
        <addForm.Field name="title">
          {(field) => (
            <Input
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addForm.handleSubmit();
                }
              }}
              placeholder="Add a subtask"
              className="h-8"
            />
          )}
        </addForm.Field>
        <addForm.Subscribe selector={(s) => s.values.title}>
          {(title) => (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void addForm.handleSubmit()}
              disabled={!title.trim()}
            >
              <Plus data-icon="inline-start" />
              Add
            </Button>
          )}
        </addForm.Subscribe>
      </div>
    </div>
  );
}

function SubtaskRow({
  task,
  blocked,
  onToggleDone,
  onRename,
  onDelete,
}: {
  task: TaskRow;
  blocked: boolean;
  onToggleDone: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });
  const done = task.status === "done";

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-1.5 rounded-md bg-card px-1.5 py-1",
        isDragging && "opacity-50 shadow-soft",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label="Reorder subtask"
        className="cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground"
      >
        <GripVertical className="size-4" />
      </button>

      <Checkbox
        checked={done}
        disabled={blocked}
        onCheckedChange={onToggleDone}
        aria-label={done ? "Mark subtask not done" : "Mark subtask done"}
      />

      <input
        defaultValue={task.title}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v) onRename(v);
          else e.target.value = task.title;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-sm outline-none focus:rounded-sm focus:ring-2 focus:ring-ring",
          done && "text-muted-foreground line-through",
        )}
      />

      {blocked && (
        <Badge
          variant="outline"
          className="gap-1 text-muted-foreground"
          title="Finish the previous subtask first"
        >
          <Lock /> Blocked
        </Badge>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 text-muted-foreground hover:text-destructive"
        aria-label="Delete subtask"
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}
