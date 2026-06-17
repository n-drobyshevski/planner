"use client";

import { useMemo, useState } from "react";
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
import { useLocale, useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";
import { SubtaskEditor } from "./subtask-editor";
import { AttributeFields } from "@/components/shared/attribute-fields";
import { useTaskMutations } from "@/lib/hooks/use-task-mutations";
import { taskFormSchema, type TaskFormValues } from "@/lib/tasks/schemas";
import { parseAttributes, hasAnyAttribute } from "@/lib/attributes/schema";
import { useViewerTimeZone } from "@/lib/datetime/timezone-context";
import { formatTime, formatWeekdayDayMonth } from "@/lib/datetime/format";
import type { Board, Category, Collection, Member, TaskRow } from "@/lib/types";
import type { TaskInput } from "@/lib/supabase/mappers";

export interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  workspaceId: string;
  currentMemberId: string;
  /** Collection the new task is filed under (create mode). */
  collectionId?: string | null;
  /** The collection's columns (ordered), for the board picker + completion. */
  boards: Board[];
  /**
   * When provided (e.g. opened from the calendar), the dialog shows a Collection
   * picker so the task's destination is chosen in-dialog; the board picker then
   * re-derives from `allBoards` filtered to the chosen collection.
   */
  collections?: Collection[];
  /** All workspace boards — required alongside `collections` to drive the picker. */
  allBoards?: Board[];
  /** Initial collection selection when the Collection picker is shown. */
  defaultCollectionId?: string | null;
  /**
   * When provided (calendar create), an optional "Schedule on calendar" switch
   * appears; if enabled, the new task is also placed as a block at this slot.
   */
  defaultSchedule?: { start: number; end: number };
  /**
   * Create mode: switch the create surface to another item kind (Event /
   * Context). When set, a 3-way type toggle is shown in the header. The current
   * title is passed along so it survives the swap.
   */
  onKindChange?: (kind: "event" | "context" | "task", title?: string) => void;
  /** Create mode: seed the title (e.g. carried over when switching item kind). */
  defaultTitle?: string;
  members: Member[];
  categories: Category[];
  task?: TaskRow | null;
  /** live children of the task being edited (for the subtasks section) */
  subtasks?: TaskRow[];
  /** create mode: file the new task under this parent (inherits its context). */
  createParent?: TaskRow | null;
  /** board column the create was initiated from */
  defaultBoardId?: string;
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
  // Pending ownership transfer: the member the task would be handed to. Set by
  // the Owner picker, confirmed via the alert dialog below.
  const [transferTo, setTransferTo] = useState<string | null>(null);

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
    () => mode === "edit" && (defaults.isMilestone || defaults.isPrivate),
  );

  const usableCategories = categories.filter(
    (c) => c.ownerId === null || c.ownerId === currentMemberId,
  );

  // When a Collection picker is offered (calendar create), the destination
  // collection is chosen in-dialog and the board picker follows it. Elsewhere
  // (tasks surface) the collection is fixed by the opener and `props.boards` is
  // used as-is.
  const showCollectionPicker =
    mode === "create" && !props.createParent && Boolean(props.collections?.length);
  const [collectionId, setCollectionId] = useState<string | null>(
    props.defaultCollectionId ?? props.collectionId ?? null,
  );
  const effectiveBoards = useMemo(() => {
    if (showCollectionPicker && props.allBoards) {
      return props.allBoards
        .filter((b) => b.collectionId === collectionId)
        .sort((a, b) => a.position - b.position);
    }
    return props.boards;
  }, [showCollectionPicker, props.allBoards, props.boards, collectionId]);

  // Optional "place on the calendar" toggle, only when a slot is supplied.
  const [scheduleOn, setScheduleOn] = useState(false);
  const timeZone = useViewerTimeZone();
  const locale = useLocale();

  // The chosen column, else the parent's, else the create default, else the first.
  function resolveBoardId(values: TaskFormValues): string | null {
    return (
      values.boardId ||
      props.createParent?.boardId ||
      props.defaultBoardId ||
      effectiveBoards[0]?.id ||
      null
    );
  }

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
    const boardId = resolveBoardId(values);
    // Completion follows the chosen column's is_done; the server trigger sets it
    // authoritatively, this is the optimistic value.
    const done = boardId
      ? effectiveBoards.find((b) => b.id === boardId)?.isDone ?? false
      : false;

    if (mode === "create") {
      const input: TaskInput = {
        workspaceId,
        // A subtask stays under its parent's owner (matching the inline
        // SubtaskEditor) so the subtree's ownership/privacy stays coherent.
        ownerId: props.createParent?.ownerId ?? currentMemberId,
        collectionId:
          props.createParent?.collectionId ??
          (showCollectionPicker ? collectionId : props.collectionId) ??
          null,
        parentId: props.createParent?.id ?? null,
        position: Date.now(), // new tasks sort to the bottom of their column
        ...payload,
        boardId,
        completedAt: done ? Date.now() : null,
      };
      // When the slot's "Schedule on calendar" switch is on, create + place a
      // block in one undoable step; otherwise the task only lands in the list.
      const ok =
        props.defaultSchedule && scheduleOn
          ? await mutations.createWithBlock(
              input,
              { start: props.defaultSchedule.start, end: props.defaultSchedule.end },
              timeZone,
            )
          : await mutations.create(input);
      if (ok) {
        props.onCreated?.();
        onOpenChange(false);
      }
      return;
    }
    if (!task) return;
    const completedAt = done ? task.completedAt ?? Date.now() : null;
    // The payload is TaskRow-shaped, so it doubles as the optimistic row patch.
    const rowPatch = { ...payload, boardId, completedAt };
    close();
    void mutations.update(task.id, rowPatch, undefined, rowPatch);
  }

  function onDelete() {
    if (!task) return;
    setConfirmDelete(false);
    close();
    void mutations.remove(task.id);
  }

  // Hand the task (and its subtree) to another member, then close — like Delete,
  // this is its own committed action, independent of the form's Save button.
  function onTransfer() {
    if (!task || !transferTo) return;
    const to = transferTo;
    setTransferTo(null);
    close();
    void mutations.transfer(task.id, to);
  }

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <div className="flex items-center justify-between gap-3">
              <ResponsiveDialogTitle>
                {mode === "create"
                  ? t(props.createParent ? "taskDialog.subtaskTitle" : "taskDialog.createTitle")
                  : t("taskDialog.editTitle")}
              </ResponsiveDialogTitle>
              {mode === "create" && props.onKindChange && (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value="task"
                  onValueChange={(v) =>
                    v &&
                    v !== "task" &&
                    props.onKindChange?.(v as "event" | "context", form.state.values.title)
                  }
                  aria-label={t("taskDialog.itemType")}
                  className="shrink-0"
                >
                  <ToggleGroupItem value="event">{t("taskDialog.kindEvent")}</ToggleGroupItem>
                  <ToggleGroupItem value="context">{t("taskDialog.kindContext")}</ToggleGroupItem>
                  <ToggleGroupItem value="task">{t("taskDialog.kindTask")}</ToggleGroupItem>
                </ToggleGroup>
              )}
            </div>
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

            {showCollectionPicker && (
              <Field>
                <FieldLabel htmlFor="task-collection">
                  {t("taskDialog.collectionLabel")}
                </FieldLabel>
                <Select
                  value={collectionId ?? ""}
                  onValueChange={(v) => {
                    setCollectionId(v);
                    // The old board belongs to the previous collection; clear it
                    // so resolveBoardId falls back to the new collection's first.
                    form.setFieldValue("boardId", "");
                  }}
                >
                  <SelectTrigger id="task-collection">
                    <SelectValue placeholder={t("taskDialog.collectionLabel")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(props.collections ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}

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

                {/* Owner drives edit rights + privacy. Only the current owner
                    can hand the task off; everyone else sees it read-only. */}
                {mode === "edit" && task && (
                  <Field>
                    <FieldLabel>{t("taskDialog.ownerLabel")}</FieldLabel>
                    <Select
                      value={task.ownerId}
                      onValueChange={(v) => v !== task.ownerId && setTransferTo(v)}
                      disabled={task.ownerId !== currentMemberId}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {members.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {task.ownerId === currentMemberId && (
                      <FieldDescription>{t("taskDialog.ownerHint")}</FieldDescription>
                    )}
                  </Field>
                )}

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

            {/* Optional calendar placement, shown only when the dialog was opened
                from a calendar slot. Off by default: a new task lands in the list,
                and the user opts in to also book the slot as a linked block. */}
            {mode === "create" && props.defaultSchedule && (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="task-schedule">
                    {t("taskDialog.scheduleOnCalendarLabel")}
                  </FieldLabel>
                  <FieldDescription>
                    {scheduleOn
                      ? t("taskDialog.scheduleOnCalendarAt", {
                          when: `${formatWeekdayDayMonth(
                            props.defaultSchedule.start,
                            timeZone,
                            locale,
                          )} · ${formatTime(props.defaultSchedule.start, timeZone)}`,
                        })
                      : t("taskDialog.scheduleOnCalendarHint")}
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="task-schedule"
                  checked={scheduleOn}
                  onCheckedChange={setScheduleOn}
                />
              </Field>
            )}

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
                  {effectiveBoards.length > 0 && (
                    <form.Field name="boardId">
                      {(field) => (
                        <Field>
                          <FieldLabel htmlFor="task-board">{t("taskDialog.columnLabel")}</FieldLabel>
                          <Select
                            value={field.state.value || effectiveBoards[0].id}
                            onValueChange={field.handleChange}
                          >
                            <SelectTrigger id="task-board">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {effectiveBoards.map((b) => (
                                  <SelectItem key={b.id} value={b.id}>
                                    {b.name}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
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

      <AlertDialog
        open={transferTo != null}
        onOpenChange={(o) => !o && setTransferTo(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("taskDialog.transferTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                task?.isPrivate
                  ? "taskDialog.transferDescriptionPrivate"
                  : "taskDialog.transferDescription",
                { name: members.find((m) => m.id === transferTo)?.name ?? "" },
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTransferTo(null)}>
              {tc("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={onTransfer}>
              {t("taskDialog.transferAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function buildInitial(props: TaskDialogProps): TaskFormValues {
  const { mode, task, defaultBoardId, createParent } = props;
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
      boardId: task.boardId ?? "",
      attributes: parseAttributes(task.attributes),
    };
  }
  // A subtask inherits its parent's assignee, context, and privacy (matching
  // the inline SubtaskEditor); a plain top-level task starts unset.
  return {
    title: props.defaultTitle ?? "",
    description: "",
    assigneeId: createParent?.assigneeId ?? "none",
    categoryId: createParent?.categoryId ?? "none",
    isPrivate: createParent?.isPrivate ?? true,
    priority: "none",
    dueDate: "",
    startDate: "",
    isMilestone: false,
    boardId: createParent?.boardId ?? defaultBoardId ?? "",
    attributes: {},
  };
}
