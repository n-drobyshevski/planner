"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Trash2, Loader2, CalendarPlus } from "lucide-react";
import { SubtaskEditor } from "./subtask-editor";
import { useTaskMutations } from "@/lib/hooks/use-task-mutations";
import { msToDateInput, dateInputToMs } from "@/lib/datetime/local";
import { useViewerTimeZone } from "@/lib/datetime/timezone-context";
import type { Category, Member, TaskRow, TaskStatus } from "@/lib/types";
import type { TaskInput } from "@/lib/supabase/mappers";

interface FormState {
  title: string;
  description: string;
  assigneeId: string; // "none" | memberId
  categoryId: string; // "none" | id
  isPrivate: boolean;
  priority: string; // "none" | "1" | "2" | "3"
  dueDate: string; // "" | yyyy-MM-dd
  status: TaskStatus;
}

export interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  workspaceId: string;
  currentMemberId: string;
  /** Board the new task is filed under (create mode). */
  boardId?: string | null;
  members: Member[];
  categories: Category[];
  task?: TaskRow | null;
  /** live children of the task being edited (for the subtasks section) */
  subtasks?: TaskRow[];
  /** status column the create was initiated from */
  defaultStatus?: TaskStatus;
  /** open the Schedule dialog for this task (edit mode only) */
  onSchedule?: () => void;
}

export function TaskDialog(props: TaskDialogProps) {
  const { open, onOpenChange, mode, workspaceId, currentMemberId, members, categories, task } =
    props;
  const mutations = useTaskMutations(workspaceId);
  const timeZone = useViewerTimeZone();

  const [form, setForm] = useState<FormState>(() => buildInitial(props, timeZone));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(buildInitial(props, timeZone));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, mode]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const usableCategories = categories.filter(
    (c) => c.ownerId === null || c.ownerId === currentMemberId,
  );

  function buildPayload() {
    return {
      assigneeId: form.assigneeId === "none" ? null : form.assigneeId,
      categoryId: form.categoryId === "none" ? null : form.categoryId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      isPrivate: form.isPrivate,
      priority: form.priority === "none" ? null : Number(form.priority),
      dueAt: form.dueDate ? dateInputToMs(form.dueDate, timeZone) : null,
      status: form.status,
    };
  }

  async function finish(ok: boolean) {
    setPending(false);
    if (ok) onOpenChange(false);
  }

  async function onSave() {
    if (!form.title.trim()) {
      setError("Please add a title.");
      return;
    }
    setPending(true);
    const payload = buildPayload();

    if (mode === "create") {
      const input: TaskInput = {
        workspaceId,
        ownerId: currentMemberId,
        boardId: props.boardId ?? null,
        position: Date.now(), // new tasks sort to the bottom of their column
        ...payload,
        completedAt: payload.status === "done" ? Date.now() : null,
      };
      finish(await mutations.create(input));
      return;
    }
    if (!task) return;
    const completedAt =
      payload.status === "done"
        ? task.completedAt ?? Date.now()
        : null;
    finish(await mutations.update(task.id, { ...payload, completedAt }));
  }

  async function onDelete() {
    if (!task) return;
    setConfirmDelete(false);
    setPending(true);
    finish(await mutations.remove(task.id));
  }

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {mode === "create" ? "New task" : "Edit task"}
            </ResponsiveDialogTitle>
          </ResponsiveDialogHeader>

          <ResponsiveDialogBody>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="task-title">Title</FieldLabel>
              <Input
                id="task-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="What needs doing?"
                autoFocus
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="task-notes">Notes</FieldLabel>
              <Textarea
                id="task-notes"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={2}
                placeholder="Add details"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Assignee</FieldLabel>
                <Select value={form.assigneeId} onValueChange={(v) => set("assigneeId", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">Unassigned</SelectItem>
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
                <FieldLabel>Context</FieldLabel>
                <Select value={form.categoryId} onValueChange={(v) => set("categoryId", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="No context" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">No context</SelectItem>
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
                <FieldLabel>Priority</FieldLabel>
                <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="1">Low</SelectItem>
                      <SelectItem value="2">Medium</SelectItem>
                      <SelectItem value="3">High</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="task-due">Due date</FieldLabel>
                <DatePicker
                  id="task-due"
                  value={form.dueDate}
                  onChange={(v) => set("dueDate", v)}
                  clearable
                  aria-label="Due date"
                />
              </Field>
            </div>

            {mode === "edit" && (
              <Field>
                <FieldLabel>Status</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={form.status}
                  onValueChange={(v) => v && set("status", v as TaskStatus)}
                  className="justify-start"
                >
                  <ToggleGroupItem value="todo">To Do</ToggleGroupItem>
                  <ToggleGroupItem value="in_progress">In Progress</ToggleGroupItem>
                  <ToggleGroupItem value="done">Done</ToggleGroupItem>
                </ToggleGroup>
              </Field>
            )}

            <Field orientation="horizontal">
              <Switch
                id="task-private"
                checked={form.isPrivate}
                onCheckedChange={(v) => set("isPrivate", v)}
              />
              <FieldLabel htmlFor="task-private">Private (only you can see this)</FieldLabel>
            </Field>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </FieldGroup>

          {mode === "edit" && task && (
            <div className="mt-4">
              <SubtaskEditor
                parent={task}
                subtasks={props.subtasks ?? []}
                workspaceId={workspaceId}
              />
            </div>
          )}
          </ResponsiveDialogBody>

          <ResponsiveDialogFooter className="sm:justify-between">
            {mode === "edit" && task ? (
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  onClick={() => setConfirmDelete(true)}
                  disabled={pending}
                  className="text-destructive"
                >
                  <Trash2 data-icon="inline-start" />
                  Delete
                </Button>
                {props.onSchedule && (
                  <Button
                    variant="ghost"
                    onClick={() => props.onSchedule?.()}
                    disabled={pending}
                  >
                    <CalendarPlus data-icon="inline-start" />
                    <span className="hidden sm:inline">Add to calendar</span>
                  </Button>
                )}
              </div>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button onClick={onSave} disabled={pending}>
                {pending && <Loader2 data-icon="inline-start" className="animate-spin" />}
                {mode === "create" ? "Create" : "Save"}
              </Button>
            </div>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the task, its subtasks, and any blocks it placed on the
              calendar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function buildInitial(props: TaskDialogProps, timeZone: string): FormState {
  const { mode, task, defaultStatus } = props;
  if (mode === "edit" && task) {
    return {
      title: task.title,
      description: task.description ?? "",
      assigneeId: task.assigneeId ?? "none",
      categoryId: task.categoryId ?? "none",
      isPrivate: task.isPrivate,
      priority: task.priority ? String(task.priority) : "none",
      dueDate: task.dueAt != null ? msToDateInput(task.dueAt, timeZone) : "",
      status: task.status,
    };
  }
  return {
    title: "",
    description: "",
    assigneeId: "none",
    categoryId: "none",
    isPrivate: false,
    priority: "none",
    dueDate: "",
    status: defaultStatus ?? "todo",
  };
}
