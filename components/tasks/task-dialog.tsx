"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
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
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Trash2, Loader2, CalendarPlus, ChevronDown } from "lucide-react";
import { SubtaskEditor } from "./subtask-editor";
import { AttributeFields } from "@/components/shared/attribute-fields";
import { useTaskMutations } from "@/lib/hooks/use-task-mutations";
import { taskFormSchema, type TaskFormValues } from "@/lib/tasks/schemas";
import { parseAttributes, hasAnyAttribute } from "@/lib/attributes/schema";
import type { Category, Member, TaskRow, TaskStatus } from "@/lib/types";
import type { TaskInput } from "@/lib/supabase/mappers";

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
  const [confirmDelete, setConfirmDelete] = useState(false);

  // The dialog is conditionally mounted by its opener (it remounts fresh per
  // open), so the defaults are computed exactly once — no re-seed effect.
  const [defaults] = useState(() => buildInitial(props));
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: defaults,
  });
  const { errors, isSubmitting } = form.formState;
  const [showOptimization, setShowOptimization] = useState(() =>
    hasAnyAttribute(defaults.attributes),
  );

  const usableCategories = categories.filter(
    (c) => c.ownerId === null || c.ownerId === currentMemberId,
  );

  function buildPayload(values: TaskFormValues) {
    return {
      assigneeId: values.assigneeId === "none" ? null : values.assigneeId,
      categoryId: values.categoryId === "none" ? null : values.categoryId,
      title: values.title.trim(),
      description: values.description.trim() || null,
      isPrivate: values.isPrivate,
      priority: values.priority === "none" ? null : Number(values.priority),
      dueDate: values.dueDate || null,
      status: values.status,
      attributes: values.attributes,
    };
  }

  // Edit/delete close immediately: the mutation patches the cache optimistically
  // and failures surface via toast + undo, so there's no spinner wait. Create
  // keeps the await path (isSubmitting) so a failed insert doesn't discard the
  // unsaved form.
  function close() {
    onOpenChange(false);
  }

  // handleSubmit is invoked at event time (not render) so the React Compiler
  // doesn't treat the submit body — Date.now() included — as render-scoped.
  function onSave(e?: React.BaseSyntheticEvent) {
    return form.handleSubmit(onValid)(e);
  }

  async function onValid(values: TaskFormValues) {
    const payload = buildPayload(values);

    if (mode === "create") {
      const input: TaskInput = {
        workspaceId,
        ownerId: currentMemberId,
        boardId: props.boardId ?? null,
        position: Date.now(), // new tasks sort to the bottom of their column
        ...payload,
        completedAt: payload.status === "done" ? Date.now() : null,
      };
      if (await mutations.create(input)) onOpenChange(false);
      return;
    }
    if (!task) return;
    const completedAt =
      payload.status === "done"
        ? task.completedAt ?? Date.now()
        : null;
    // The payload is TaskRow-shaped, so it doubles as the optimistic row patch.
    const rowPatch = { ...payload, completedAt };
    close();
    void mutations.update(task.id, rowPatch, undefined, rowPatch);
  }

  function onDelete() {
    if (!task) return;
    setConfirmDelete(false);
    close();
    void mutations.remove(task.id);
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
            <Field data-invalid={errors.title ? true : undefined}>
              <FieldLabel htmlFor="task-title">Title</FieldLabel>
              <Input
                id="task-title"
                {...form.register("title")}
                placeholder="What needs doing?"
                autoFocus
                aria-invalid={errors.title ? true : undefined}
                aria-describedby={errors.title ? "task-title-error" : undefined}
              />
              {errors.title && (
                <FieldError id="task-title-error" errors={[errors.title]} />
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="task-notes">Notes</FieldLabel>
              <Textarea
                id="task-notes"
                {...form.register("description")}
                rows={2}
                placeholder="Add details"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Assignee</FieldLabel>
                <Controller
                  control={form.control}
                  name="assigneeId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
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
                  )}
                />
              </Field>

              <Field>
                <FieldLabel>Context</FieldLabel>
                <Controller
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
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
                  )}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Priority</FieldLabel>
                <Controller
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
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
                  )}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="task-due">Due date</FieldLabel>
                <Controller
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <DatePicker
                      id="task-due"
                      value={field.value}
                      onChange={field.onChange}
                      clearable
                      aria-label="Due date"
                    />
                  )}
                />
              </Field>
            </div>

            {mode === "edit" && (
              <Field>
                <FieldLabel>Status</FieldLabel>
                <Controller
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <ToggleGroup
                      type="single"
                      variant="outline"
                      value={field.value}
                      onValueChange={(v) => v && field.onChange(v as TaskStatus)}
                      className="justify-start"
                    >
                      <ToggleGroupItem value="todo">To Do</ToggleGroupItem>
                      <ToggleGroupItem value="in_progress">In Progress</ToggleGroupItem>
                      <ToggleGroupItem value="done">Done</ToggleGroupItem>
                    </ToggleGroup>
                  )}
                />
              </Field>
            )}

            <Field orientation="horizontal">
              <Controller
                control={form.control}
                name="isPrivate"
                render={({ field }) => (
                  <Switch
                    id="task-private"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <FieldLabel htmlFor="task-private">Private (only you can see this)</FieldLabel>
            </Field>

            {/* Optimization details — optional attributes feeding /insights.
                Scheduled blocks inherit them (scheduleTaskBlocks). */}
            <Collapsible open={showOptimization} onOpenChange={setShowOptimization}>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between px-0 font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
                >
                  Optimization details
                  <ChevronDown
                    className={`size-4 transition-transform ${showOptimization ? "rotate-180" : ""}`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                <Controller
                  control={form.control}
                  name="attributes"
                  render={({ field }) => (
                    <AttributeFields
                      value={field.value}
                      onChange={field.onChange}
                      idPrefix="task"
                    />
                  )}
                />
              </CollapsibleContent>
            </Collapsible>
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
                  disabled={isSubmitting}
                  className="text-destructive"
                >
                  <Trash2 data-icon="inline-start" />
                  Delete
                </Button>
                {props.onSchedule && (
                  <Button
                    variant="ghost"
                    onClick={() => props.onSchedule?.()}
                    disabled={isSubmitting}
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
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={onSave} disabled={isSubmitting}>
                {isSubmitting && <Loader2 data-icon="inline-start" className="animate-spin" />}
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

function buildInitial(props: TaskDialogProps): TaskFormValues {
  const { mode, task, defaultStatus } = props;
  if (mode === "edit" && task) {
    return {
      title: task.title,
      description: task.description ?? "",
      assigneeId: task.assigneeId ?? "none",
      categoryId: task.categoryId ?? "none",
      isPrivate: task.isPrivate,
      priority: task.priority ? (String(task.priority) as TaskFormValues["priority"]) : "none",
      dueDate: task.dueDate ?? "",
      status: task.status,
      attributes: parseAttributes(task.attributes),
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
    attributes: {},
  };
}
