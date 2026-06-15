"use client";

import { useState } from "react";
import { useForm } from "@tanstack/react-form";
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
import {
  Field,
  FieldGroup,
  FieldSection,
  FieldLabel,
  FieldError,
  FieldContent,
  FieldDescription,
} from "@/components/ui/field";
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
import { Trash2, CalendarPlus, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";
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
  /** Collection the new task is filed under (create mode). */
  collectionId?: string | null;
  members: Member[];
  categories: Category[];
  task?: TaskRow | null;
  /** live children of the task being edited (for the subtasks section) */
  subtasks?: TaskRow[];
  /** create mode: file the new task under this parent (inherits its context). */
  createParent?: TaskRow | null;
  /** status column the create was initiated from */
  defaultStatus?: TaskStatus;
  /** open the Schedule dialog for this task (edit mode only) */
  onSchedule?: () => void;
  /** create mode: fired after the new task is successfully inserted. */
  onCreated?: () => void;
}

export function TaskDialog(props: TaskDialogProps) {
  const { open, onOpenChange, mode, workspaceId, currentMemberId, members, categories, task } =
    props;
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const mutations = useTaskMutations(workspaceId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // The dialog is conditionally mounted by its opener (it remounts fresh per
  // open), so the defaults are computed exactly once — no re-seed effect.
  const [defaults] = useState(() => buildInitial(props));
  const form = useForm({
    defaultValues: defaults,
    validators: { onSubmit: taskFormSchema },
    onSubmit: ({ value }) => onValid(value),
  });
  const [showOptimization, setShowOptimization] = useState(() =>
    hasAnyAttribute(defaults.attributes),
  );
  // Auto-expand "More options" when editing a task that already uses any of the
  // fields tucked behind it, so nothing stays hidden; collapsed for quick adds.
  const [showMore, setShowMore] = useState(
    () =>
      defaults.status !== "todo" || defaults.isMilestone || defaults.isPrivate,
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
      startDate: values.startDate || null,
      isMilestone: values.isMilestone,
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

  async function onValid(values: TaskFormValues) {
    const payload = buildPayload(values);

    if (mode === "create") {
      const input: TaskInput = {
        workspaceId,
        // A subtask stays under its parent's owner (matching the inline
        // SubtaskEditor) so the subtree's ownership/privacy stays coherent.
        ownerId: props.createParent?.ownerId ?? currentMemberId,
        collectionId: props.createParent?.collectionId ?? props.collectionId ?? null,
        parentId: props.createParent?.id ?? null,
        position: Date.now(), // new tasks sort to the bottom of their column
        ...payload,
        completedAt: payload.status === "done" ? Date.now() : null,
      };
      if (await mutations.create(input)) {
        props.onCreated?.();
        onOpenChange(false);
      }
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
              {mode === "create"
                ? t(props.createParent ? "taskDialog.subtaskTitle" : "taskDialog.createTitle")
                : t("taskDialog.editTitle")}
            </ResponsiveDialogTitle>
          </ResponsiveDialogHeader>

          <ResponsiveDialogBody>
          <FieldGroup>
            <form.Field name="title">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid || undefined}>
                    <FieldLabel htmlFor="task-title">{t("taskDialog.titleLabel")}</FieldLabel>
                    <Input
                      id="task-title"
                      name={field.name}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder={t("taskDialog.titlePlaceholder")}
                      autoFocus
                      aria-invalid={isInvalid || undefined}
                      aria-describedby={isInvalid ? "task-title-error" : undefined}
                    />
                    {isInvalid && (
                      <FieldError id="task-title-error" errors={field.state.meta.errors} />
                    )}
                  </Field>
                );
              }}
            </form.Field>

            <form.Field name="description">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="task-notes">{t("taskDialog.notesLabel")}</FieldLabel>
                  <Textarea
                    id="task-notes"
                    name={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    rows={2}
                    placeholder={t("taskDialog.notesPlaceholder")}
                  />
                </Field>
              )}
            </form.Field>

            {/* Details — assignment, scheduling, and priority grouped together
                so the core fields above stay uncluttered. */}
            <FieldSection title={t("taskDialog.detailsLabel")}>
              <div className="grid grid-cols-2 gap-3">
                <form.Field name="assigneeId">
                  {(field) => (
                    <Field>
                      <FieldLabel>{t("taskDialog.assigneeLabel")}</FieldLabel>
                      <Select value={field.state.value} onValueChange={field.handleChange}>
                        <SelectTrigger>
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
                  )}
                </form.Field>

                <form.Field name="categoryId">
                  {(field) => (
                    <Field>
                      <FieldLabel>{t("taskDialog.contextLabel")}</FieldLabel>
                      <Select value={field.state.value} onValueChange={field.handleChange}>
                        <SelectTrigger>
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
                  )}
                </form.Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <form.Field name="startDate">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="task-start">{t("taskDialog.startDateLabel")}</FieldLabel>
                      <DatePicker
                        id="task-start"
                        value={field.state.value}
                        onChange={field.handleChange}
                        clearable
                        aria-label={t("taskDialog.startDateLabel")}
                      />
                    </Field>
                  )}
                </form.Field>

                <form.Field name="dueDate">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="task-due">{t("taskDialog.dueDateLabel")}</FieldLabel>
                      <DatePicker
                        id="task-due"
                        value={field.state.value}
                        onChange={field.handleChange}
                        clearable
                        aria-label={t("taskDialog.dueDateLabel")}
                      />
                    </Field>
                  )}
                </form.Field>
              </div>

              {/* Priority is a 4-value enum — a ToggleGroup matches the Status and
                  visibility controls used elsewhere. The value union ("none" | "1"
                  | "2" | "3") is unchanged, so the schema/payload contract holds; a
                  re-tap (empty value) falls back to "none". */}
              <form.Field name="priority">
                {(field) => (
                  <Field>
                    <FieldLabel>{t("taskDialog.priorityLabel")}</FieldLabel>
                    <ToggleGroup
                      type="single"
                      variant="outline"
                      value={field.state.value}
                      onValueChange={(v) =>
                        field.handleChange((v || "none") as TaskFormValues["priority"])
                      }
                      className="justify-start"
                    >
                      <ToggleGroupItem value="none">{t("priority.none")}</ToggleGroupItem>
                      <ToggleGroupItem value="1">{t("priority.low")}</ToggleGroupItem>
                      <ToggleGroupItem value="2">{t("priority.medium")}</ToggleGroupItem>
                      <ToggleGroupItem value="3">{t("priority.high")}</ToggleGroupItem>
                    </ToggleGroup>
                  </Field>
                )}
              </form.Field>
            </FieldSection>

            {/* More options — status (edit only) and the two flags tucked behind
                progressive disclosure so the form mirrors the Event dialog. */}
            <Collapsible open={showMore} onOpenChange={setShowMore}>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between px-0 font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
                >
                  {t("taskDialog.moreOptions")}
                  <ChevronDown
                    className={`size-4 transition-transform ${showMore ? "rotate-180" : ""}`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <FieldSection className="pt-4">
                  {mode === "edit" && (
                    <form.Field name="status">
                      {(field) => (
                        <Field>
                          <FieldLabel>{t("taskDialog.statusLabel")}</FieldLabel>
                          <ToggleGroup
                            type="single"
                            variant="outline"
                            value={field.state.value}
                            onValueChange={(v) => v && field.handleChange(v as TaskStatus)}
                            className="justify-start"
                          >
                            <ToggleGroupItem value="todo">{t("status.todo")}</ToggleGroupItem>
                            <ToggleGroupItem value="in_progress">{t("status.inProgress")}</ToggleGroupItem>
                            <ToggleGroupItem value="done">{t("status.done")}</ToggleGroupItem>
                          </ToggleGroup>
                        </Field>
                      )}
                    </form.Field>
                  )}

                  <form.Field name="isMilestone">
                    {(field) => (
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldLabel htmlFor="task-milestone">
                            {t("taskDialog.milestoneLabel")}
                          </FieldLabel>
                          <FieldDescription>{t("taskDialog.milestoneHint")}</FieldDescription>
                        </FieldContent>
                        <Switch
                          id="task-milestone"
                          checked={field.state.value}
                          onCheckedChange={field.handleChange}
                        />
                      </Field>
                    )}
                  </form.Field>

                  <form.Field name="isPrivate">
                    {(field) => (
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldLabel htmlFor="task-private">
                            {t("taskDialog.privateLabel")}
                          </FieldLabel>
                          <FieldDescription>{t("taskDialog.privateHint")}</FieldDescription>
                        </FieldContent>
                        <Switch
                          id="task-private"
                          checked={field.state.value}
                          onCheckedChange={field.handleChange}
                        />
                      </Field>
                    )}
                  </form.Field>
                </FieldSection>
              </CollapsibleContent>
            </Collapsible>

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
                  {t("taskDialog.optimizationDetails")}
                  <ChevronDown
                    className={`size-4 transition-transform ${showOptimization ? "rotate-180" : ""}`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                <form.Field name="attributes">
                  {(field) => (
                    <AttributeFields
                      value={field.state.value}
                      onChange={field.handleChange}
                      idPrefix="task"
                    />
                  )}
                </form.Field>
              </CollapsibleContent>
            </Collapsible>
          </FieldGroup>

          {mode === "edit" && task && (
            <div className="mt-6">
              <SubtaskEditor
                parent={task}
                subtasks={props.subtasks ?? []}
                workspaceId={workspaceId}
              />
            </div>
          )}
          </ResponsiveDialogBody>

          <ResponsiveDialogFooter className="sm:justify-between">
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <>
                  {mode === "edit" && task ? (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        onClick={() => setConfirmDelete(true)}
                        disabled={isSubmitting}
                        className="text-destructive"
                      >
                        <Trash2 data-icon="inline-start" />
                        {tc("delete")}
                      </Button>
                      {props.onSchedule && (
                        <Button
                          variant="ghost"
                          onClick={() => props.onSchedule?.()}
                          disabled={isSubmitting}
                        >
                          <CalendarPlus data-icon="inline-start" />
                          <span className="hidden sm:inline">{t("schedule.title")}</span>
                        </Button>
                      )}
                    </div>
                  ) : (
                    <span />
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => onOpenChange(false)}
                      disabled={isSubmitting}
                    >
                      {tc("cancel")}
                    </Button>
                    {/* handleSubmit is invoked at event time (not render) so the React
                        Compiler doesn't treat the submit body — Date.now() included —
                        as render-scoped. */}
                    <Button onClick={() => void form.handleSubmit()} disabled={isSubmitting}>
                      {isSubmitting && <Spinner data-icon="inline-start" />}
                      {mode === "create" ? tc("create") : tc("save")}
                    </Button>
                  </div>
                </>
              )}
            </form.Subscribe>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("taskDialog.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("taskDialog.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function buildInitial(props: TaskDialogProps): TaskFormValues {
  const { mode, task, defaultStatus, createParent } = props;
  if (mode === "edit" && task) {
    return {
      title: task.title,
      description: task.description ?? "",
      assigneeId: task.assigneeId ?? "none",
      categoryId: task.categoryId ?? "none",
      isPrivate: task.isPrivate,
      priority: task.priority ? (String(task.priority) as TaskFormValues["priority"]) : "none",
      dueDate: task.dueDate ?? "",
      startDate: task.startDate ?? "",
      isMilestone: task.isMilestone,
      status: task.status,
      attributes: parseAttributes(task.attributes),
    };
  }
  // A subtask inherits its parent's assignee, context, and privacy (matching
  // the inline SubtaskEditor); a plain top-level task starts unset.
  return {
    title: "",
    description: "",
    assigneeId: createParent?.assigneeId ?? "none",
    categoryId: createParent?.categoryId ?? "none",
    isPrivate: createParent?.isPrivate ?? false,
    priority: "none",
    dueDate: "",
    startDate: "",
    isMilestone: false,
    status: defaultStatus ?? "todo",
    attributes: {},
  };
}
