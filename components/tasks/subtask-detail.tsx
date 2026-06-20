"use client";

// The inline detail panel for a single subtask, revealed below its row when the
// "details" disclosure is open. Progressive disclosure: a one-line subtask stays
// one line until you open this. Every control commits independently and
// optimistically through the shared update mutation — no per-row form, no modal.
import { useTranslations } from "next-intl";
import {
  Field,
  FieldLabel,
  FieldContent,
  FieldDescription,
} from "@/components/ui/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { SquarePen } from "lucide-react";
import { TaskDependenciesField } from "./task-dependencies-field";
import { useTaskMutations } from "@/lib/hooks/use-task-mutations";
import type { Category, Member, TaskDependency, TaskRow } from "@/lib/types";

export function SubtaskDetail({
  task,
  workspaceId,
  members,
  categories,
  currentMemberId,
  hasChildren,
  dependencies,
  dependencyCandidates,
  onOpenFull,
}: {
  task: TaskRow;
  workspaceId: string;
  members: Member[];
  categories: Category[];
  currentMemberId: string;
  /** Whether this subtask has children — gates the "do in order" toggle. */
  hasChildren: boolean;
  /** All dependency edges (workspace) + candidate tasks, for the Blocked-by field. */
  dependencies: TaskDependency[];
  dependencyCandidates: TaskRow[];
  /** Open the full task editor for this subtask (escape hatch for deep edits). */
  onOpenFull: () => void;
}) {
  const t = useTranslations("tasks");
  const mutations = useTaskMutations(workspaceId);
  const usableCategories = categories.filter(
    (c) => c.ownerId === null || c.ownerId === currentMemberId,
  );

  // Each field is its own optimistic, undoable patch (mirrors the dialog's Save).
  const patch = (
    p: Partial<TaskRow> & Record<string, unknown>,
    prev: Partial<TaskRow>,
  ) => void mutations.update(task.id, p, prev, p);

  return (
    <div className="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor={`st-assignee-${task.id}`}>
            {t("taskDialog.assigneeLabel")}
          </FieldLabel>
          <Select
            value={task.assigneeId ?? "none"}
            onValueChange={(v) =>
              patch(
                { assigneeId: v === "none" ? null : v },
                { assigneeId: task.assigneeId },
              )
            }
          >
            <SelectTrigger id={`st-assignee-${task.id}`}>
              <SelectValue placeholder={t("taskDialog.unassigned")} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="none">{t("taskDialog.unassigned")}</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor={`st-category-${task.id}`}>
            {t("taskDialog.contextLabel")}
          </FieldLabel>
          <Select
            value={task.categoryId ?? "none"}
            onValueChange={(v) =>
              patch(
                { categoryId: v === "none" ? null : v },
                { categoryId: task.categoryId },
              )
            }
          >
            <SelectTrigger id={`st-category-${task.id}`}>
              <SelectValue placeholder={t("taskDialog.noContext")} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="none">{t("taskDialog.noContext")}</SelectItem>
                {usableCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor={`st-due-${task.id}`}>
            {t("taskDialog.dueDateLabel")}
          </FieldLabel>
          <DatePicker
            id={`st-due-${task.id}`}
            value={task.dueDate ?? ""}
            onChange={(v) => patch({ dueDate: v || null }, { dueDate: task.dueDate })}
            clearable
            aria-label={t("taskDialog.dueDateLabel")}
          />
        </Field>

        <Field>
          <FieldLabel>{t("taskDialog.priorityLabel")}</FieldLabel>
          <ToggleGroup
            type="single"
            variant="segmented"
            value={task.priority ? String(task.priority) : "none"}
            onValueChange={(v) =>
              patch(
                { priority: !v || v === "none" ? null : Number(v) },
                { priority: task.priority },
              )
            }
            className="justify-start"
          >
            <ToggleGroupItem value="none">{t("priority.none")}</ToggleGroupItem>
            <ToggleGroupItem value="1">{t("priority.low")}</ToggleGroupItem>
            <ToggleGroupItem value="2">{t("priority.medium")}</ToggleGroupItem>
            <ToggleGroupItem value="3">{t("priority.high")}</ToggleGroupItem>
          </ToggleGroup>
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor={`st-notes-${task.id}`}>
          {t("taskDialog.notesLabel")}
        </FieldLabel>
        <Textarea
          id={`st-notes-${task.id}`}
          defaultValue={task.description ?? ""}
          rows={2}
          placeholder={t("taskDialog.notesPlaceholder")}
          onBlur={(e) => {
            const v = e.target.value.trim() || null;
            if (v !== (task.description ?? null))
              patch({ description: v }, { description: task.description });
          }}
        />
      </Field>

      {hasChildren && (
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={`st-seq-${task.id}`}>
              {t("subtasks.doInOrder")}
            </FieldLabel>
            <FieldDescription>{t("subtasks.sequentialHint")}</FieldDescription>
          </FieldContent>
          <Switch
            id={`st-seq-${task.id}`}
            checked={task.sequential}
            onCheckedChange={(v) =>
              patch({ sequential: v }, { sequential: task.sequential })
            }
          />
        </Field>
      )}

      <TaskDependenciesField
        task={task}
        allTasks={dependencyCandidates}
        deps={dependencies}
        onAdd={(dependsOnTaskId) =>
          void mutations.addDependency({
            workspaceId,
            taskId: task.id,
            dependsOnTaskId,
          })
        }
        onRemove={(dep) => void mutations.removeDependency(dep)}
      />

      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
          onClick={onOpenFull}
        >
          <SquarePen data-icon="inline-start" />
          {t("subtasks.openFullEditor")}
        </Button>
      </div>
    </div>
  );
}
