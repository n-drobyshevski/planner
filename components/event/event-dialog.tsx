"use client";

import { useEffect, useMemo, useState } from "react";
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
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { Separator } from "@/components/ui/separator";
import { Lock, Eye, Trash2, Loader2, Users, ChevronDown, Plus } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { TimeField } from "@/components/ui/time-field";
import { RecurrenceEditor } from "./recurrence-editor";
import { RecurrenceScopePrompt, type RecurrenceScope } from "./recurrence-scope-prompt";
import { ColorField } from "@/components/shared/color-field";
import { AttributeFields } from "@/components/shared/attribute-fields";
import { CreateContextDialog } from "@/components/shared/create-context-dialog";
import {
  attributesEqual,
  hasAnyAttribute,
  parseAttributes,
} from "@/lib/attributes/schema";
import { useEventMutations } from "@/lib/hooks/use-event-mutations";
import {
  createEventFormSchema,
  computeEventTimes,
  type EventFormValues,
} from "@/lib/events/schemas";
import { buildRRule, parseRRule, type RecurrenceForm } from "@/lib/recurrence/rrule-build";
import {
  msToDateInput,
  msToTimeInput,
  ceilToStep,
} from "@/lib/datetime/local";
import { useViewerTimeZone } from "@/lib/datetime/timezone-context";
import type { Category, EventKind, EventRow, EventStatus, Occurrence } from "@/lib/types";
import type { EventInput } from "@/lib/supabase/mappers";

/**
 * Visibility of an item (outside a Shared context):
 *  - private: only the owner sees it
 *  - visible: the default — the partner can see it on the owner's calendar
 *    (overlay), only the owner edits
 *  - shared: joint — both see it on their own calendars and both can edit it
 */
type EventVisibility = EventFormValues["visibility"];

/** Sentinel Select value for the inline "Create new context…" action. */
const CREATE_CONTEXT_VALUE = "__create__";

export interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  workspaceId: string;
  currentMemberId: string;
  /** Contexts (the workspace's categories) an item can belong to / a window can paint. */
  categories: Category[];
  event?: EventRow | null;
  occurrence?: Occurrence | null;
  defaultStart?: number;
  defaultEnd?: number;
  /** Pre-selected Context when creating an item inside a context backdrop. */
  defaultCategoryId?: string | null;
  /** View-only: another member's item — disable inputs and hide save/delete. */
  readOnly?: boolean;
  /** Owner's name, shown in the read-only banner. */
  ownerName?: string;
}

export function EventDialog(props: EventDialogProps) {
  const {
    open,
    onOpenChange,
    mode,
    workspaceId,
    currentMemberId,
    categories,
    event,
    occurrence,
    readOnly = false,
    ownerName,
  } = props;
  const mutations = useEventMutations(workspaceId);
  const timeZone = useViewerTimeZone();

  const isRecurringEdit = mode === "edit" && Boolean(event?.rrule);

  const usableCategories = categories.filter(
    (c) => c.ownerId === null || c.ownerId === currentMemberId,
  );

  // An item filed under a SHARED context (owner_id IS NULL) is JOINT via the
  // context, so the per-event visibility control is hidden and the stored flags
  // are coerced clean (jointness comes from the context). Otherwise the 3-way
  // control governs the flags.
  function deriveSharing(values: EventFormValues) {
    const selectedCategory =
      values.categoryId !== "none"
        ? categories.find((c) => c.id === values.categoryId) ?? null
        : null;
    const sharedContext = selectedCategory?.ownerId === null;
    return {
      sharedContext,
      isPrivate: sharedContext ? false : values.visibility === "private",
      isShared: sharedContext ? false : values.visibility === "shared",
    };
  }

  const schema = useMemo(() => createEventFormSchema(timeZone), [timeZone]);
  const [defaults] = useState(() => buildInitial(props, timeZone));
  const form = useForm({
    defaultValues: defaults,
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      const { start, end } = computeEventTimes(value, timeZone);
      const isContext = value.itemKind === "context";
      const { isPrivate, isShared } = deriveSharing(value);

      if (mode === "create") {
        const input: EventInput = {
          workspaceId,
          ownerId: currentMemberId,
          kind: value.itemKind,
          // The Context an item belongs to, or the Context a window paints.
          categoryId: value.categoryId === "none" ? null : value.categoryId,
          title: value.title.trim(),
          description: value.description.trim() || null,
          location: value.location.trim() || null,
          isPrivate,
          isShared,
          color: value.color,
          allDay: isContext ? false : value.allDay,
          inactive: value.inactive,
          status: value.status,
          start,
          end,
          timeZone,
          rrule: buildRRule(value.recurrence),
          recurrenceEndsAt: recurrenceEndsAt(value.recurrence),
          attributes: value.attributes,
        };
        if (await mutations.create(input)) onOpenChange(false);
        return;
      }

      // edit
      if (!event || !occurrence) return;
      if (isRecurringEdit) {
        setScopePrompt("edit");
        return;
      }
      // single event (may gain recurrence). The patch is EventRow-shaped, so it
      // doubles as the optimistic row patch that updates the grid at once.
      const patch = {
        categoryId: value.categoryId === "none" ? null : value.categoryId,
        title: value.title.trim(),
        description: value.description.trim() || null,
        location: value.location.trim() || null,
        isPrivate,
        isShared,
        color: value.color,
        allDay: isContext ? false : value.allDay,
        inactive: value.inactive,
        status: value.status,
        start,
        end,
        rrule: buildRRule(value.recurrence),
        recurrenceEndsAt: recurrenceEndsAt(value.recurrence),
        attributes: value.attributes,
      };
      close();
      void mutations.updateSingle(event.id, patch, undefined, patch);
    },
  });

  const [showMore, setShowMore] = useState(() => hasAdvanced(defaults));
  const [showOptimization, setShowOptimization] = useState(() =>
    hasAnyAttribute(defaults.attributes),
  );
  const [scopePrompt, setScopePrompt] = useState<null | "edit" | "delete">(null);
  const [creatingContext, setCreatingContext] = useState(false);

  // Re-initialize when (re)opened for a different event/slot.
  useEffect(() => {
    if (open) {
      const next = buildInitial(props, timeZone);
      form.reset(next);
      setShowMore(hasAdvanced(next));
      setShowOptimization(hasAnyAttribute(next.attributes));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id, occurrence?.key, mode]);

  // Edit/delete close immediately: the mutation's optimistic cache patch (or a
  // background refetch for the series-split paths) updates the grid, and any
  // failure surfaces via toast + undo — so there's no spinner wait. Create keeps
  // the await path (isSubmitting) so a failed insert never discards the
  // unsaved form.
  function close() {
    onOpenChange(false);
  }

  function onEditScope(scope: RecurrenceScope) {
    if (!event || !occurrence) return;
    const value = form.state.values;
    // Defensive re-check, mirroring the validation the submit already passed.
    const { start, end } = computeEventTimes(value, timeZone);
    if (!value.title.trim() || end <= start) {
      setScopePrompt(null);
      return;
    }
    const { isPrivate, isShared } = deriveSharing(value);
    const patch = {
      title: value.title.trim(),
      description: value.description.trim() || null,
      location: value.location.trim() || null,
      categoryId: value.categoryId === "none" ? null : value.categoryId,
      allDay: value.allDay,
      inactive: value.inactive,
      status: value.status,
      start,
      end,
    };
    setScopePrompt(null);
    close();

    // Color and attributes are series-level (master columns, no per-occurrence
    // form), like the Context membership carried in `patch.categoryId`.
    // "this"/"future"/"all" govern time/content; series-level changes are
    // applied to the relevant series.
    const colorChanged = value.color !== (event.color ?? null);
    const attrsChanged = !attributesEqual(
      value.attributes,
      parseAttributes(event.attributes),
    );

    if (scope === "this") {
      // A per-occurrence edit can't carry series-level fields, so apply any
      // color/attribute change to the whole series in one side patch.
      if (colorChanged || attrsChanged) {
        const sidePatch: Partial<EventInput> = {
          ...(colorChanged ? { color: value.color } : {}),
          ...(attrsChanged ? { attributes: value.attributes } : {}),
        };
        void mutations.updateSingle(event.id, sidePatch, undefined, sidePatch);
      }
      void mutations.editThis(event, occurrence.occurrenceDate, patch);
    } else if (scope === "future") {
      void mutations.editFuture(
        event,
        occurrence.occurrenceDate,
        patch,
        colorChanged ? value.color : undefined,
        attrsChanged ? value.attributes : undefined,
      );
    } else {
      // all: shift the whole series by the same delta + update fields + rrule.
      const delta = start - occurrence.start;
      const seriesPatch = {
        title: patch.title,
        description: patch.description,
        location: patch.location,
        categoryId: patch.categoryId,
        // The 3-way control governs the whole series on an "all" edit.
        isPrivate,
        isShared,
        color: value.color,
        allDay: value.allDay,
        inactive: value.inactive,
        status: value.status,
        start: event.start + delta,
        end: event.end + delta,
        rrule: buildRRule(value.recurrence),
        recurrenceEndsAt: recurrenceEndsAt(value.recurrence),
        attributes: value.attributes,
      };
      void mutations.updateSingle(event.id, seriesPatch, undefined, seriesPatch);
    }
  }

  function onDelete() {
    if (!event || !occurrence) return;
    if (isRecurringEdit) {
      setScopePrompt("delete");
      return;
    }
    close();
    void mutations.remove(event.id);
  }

  function onDeleteScope(scope: RecurrenceScope) {
    if (!event || !occurrence) return;
    setScopePrompt(null);
    close();
    if (scope === "this") {
      void mutations.deleteThis(event, occurrence.occurrenceDate);
    } else if (scope === "future") {
      void mutations.deleteFuture(event, occurrence.occurrenceDate);
    } else {
      void mutations.deleteAll(event.id);
    }
  }

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
        <ResponsiveDialogContent>
          <form.Subscribe selector={(s) => s.values.itemKind}>
            {(itemKind) => {
              const isContext = itemKind === "context";
              return (
                <>
                  <ResponsiveDialogHeader>
                    <div className="flex items-center justify-between gap-3">
                      <ResponsiveDialogTitle>
                        {mode === "create"
                          ? isContext
                            ? "New context"
                            : "New event"
                          : isContext
                            ? "Edit context"
                            : "Edit event"}
                      </ResponsiveDialogTitle>
                      {mode === "create" && !readOnly && (
                        <form.Field name="itemKind">
                          {(field) => (
                            <ToggleGroup
                              type="single"
                              variant="outline"
                              size="sm"
                              value={field.state.value}
                              onValueChange={(v) => v && field.handleChange(v as EventKind)}
                              aria-label="Item type"
                              className="shrink-0"
                            >
                              <ToggleGroupItem value="event">Event</ToggleGroupItem>
                              <ToggleGroupItem value="context">Context</ToggleGroupItem>
                            </ToggleGroup>
                          )}
                        </form.Field>
                      )}
                    </div>
                  </ResponsiveDialogHeader>

                  <ResponsiveDialogBody>
                  {readOnly && (
                    <div className="mb-3 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                      <Lock className="size-4 shrink-0" />
                      <span>
                        Read-only · {ownerName ? `${ownerName}'s calendar` : "another calendar"}
                      </span>
                    </div>
                  )}
                  <fieldset disabled={readOnly} className="contents">
                  <FieldGroup className="gap-4">
                    {/* Title — prominent, borderless */}
                    <form.Field name="title">
                      {(field) => {
                        const isInvalid =
                          field.state.meta.isTouched && !field.state.meta.isValid;
                        return (
                          <Field data-invalid={isInvalid || undefined}>
                            <Input
                              id="ev-title"
                              value={field.state.value}
                              onChange={(e) => field.handleChange(e.target.value)}
                              onBlur={field.handleBlur}
                              placeholder={isContext ? "Name this context" : "Add title"}
                              aria-label={isContext ? "Context name" : "Event title"}
                              aria-invalid={isInvalid || undefined}
                              autoFocus
                              className="h-auto border-0 bg-transparent px-0 py-1 text-lg font-medium md:text-lg shadow-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-transparent"
                            />
                            {isInvalid && <FieldError errors={field.state.meta.errors} />}
                          </Field>
                        );
                      }}
                    </form.Field>

                    {/* When — schedule card grouping all-day + start/end */}
                    <form.Subscribe selector={(s) => s.values.allDay}>
                      {(allDay) => (
                        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">When</span>
                            {!isContext && (
                              <label
                                htmlFor="ev-allday"
                                className="flex cursor-pointer items-center gap-2 text-sm"
                              >
                                <span>All day</span>
                                <form.Field name="allDay">
                                  {(field) => (
                                    <Switch
                                      id="ev-allday"
                                      checked={field.state.value}
                                      onCheckedChange={field.handleChange}
                                    />
                                  )}
                                </form.Field>
                              </label>
                            )}
                          </div>

                          <div className="grid grid-cols-[3rem_1fr_auto] items-center gap-2">
                            <span className="text-sm text-muted-foreground">Start</span>
                            <form.Field name="startDate">
                              {(field) => (
                                <DatePicker
                                  value={field.state.value}
                                  onChange={field.handleChange}
                                  aria-label="Start date"
                                />
                              )}
                            </form.Field>
                            {!allDay ? (
                              <form.Field name="startTime">
                                {(field) => (
                                  <TimeField
                                    value={field.state.value}
                                    onChange={field.handleChange}
                                    aria-label="Start time"
                                    className="w-28"
                                  />
                                )}
                              </form.Field>
                            ) : (
                              <span className="w-28" aria-hidden />
                            )}
                          </div>

                          <div className="grid grid-cols-[3rem_1fr_auto] items-center gap-2">
                            <span className="text-sm text-muted-foreground">End</span>
                            <form.Field name="endDate">
                              {(field) => (
                                <DatePicker
                                  value={field.state.value}
                                  onChange={field.handleChange}
                                  aria-label="End date"
                                />
                              )}
                            </form.Field>
                            {!allDay ? (
                              <form.Field name="endTime">
                                {(field) => (
                                  <TimeField
                                    value={field.state.value}
                                    onChange={field.handleChange}
                                    aria-label="End time"
                                    className="w-28"
                                  />
                                )}
                              </form.Field>
                            ) : (
                              <span className="w-28" aria-hidden />
                            )}
                          </div>

                          {/* The cross-field ordering rule lands on endTime even when
                              the picker is hidden (all-day), so read it off the form. */}
                          <form.Subscribe selector={(s) => s.fieldMeta.endTime?.errors}>
                            {(errors) =>
                              errors && errors.length > 0 ? (
                                <FieldError errors={errors} />
                              ) : null
                            }
                          </form.Subscribe>
                        </div>
                      )}
                    </form.Subscribe>

                    {/* Context + Color — paired row */}
                    <div className="grid grid-cols-2 gap-3">
                      <form.Field name="categoryId">
                        {(field) => (
                          <Field>
                            <FieldLabel htmlFor="ev-context">Context</FieldLabel>
                            <Select
                              value={field.state.value}
                              onValueChange={(v) =>
                                v === CREATE_CONTEXT_VALUE
                                  ? setCreatingContext(true)
                                  : field.handleChange(v)
                              }
                            >
                              <SelectTrigger id="ev-context">
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
                                  <SelectItem
                                    value={CREATE_CONTEXT_VALUE}
                                    className="text-muted-foreground"
                                  >
                                    <Plus className="size-4" />
                                    Create new context…
                                  </SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </Field>
                        )}
                      </form.Field>

                      <form.Field name="color">
                        {(field) => (
                          <Field>
                            <FieldLabel htmlFor="ev-color">Color</FieldLabel>
                            <ColorField
                              id="ev-color"
                              value={field.state.value}
                              onChange={field.handleChange}
                            />
                          </Field>
                        )}
                      </form.Field>
                    </div>

                    {/* Sharing — or shared-context banner */}
                    <form.Subscribe selector={(s) => deriveSharing(s.values).sharedContext}>
                      {(sharedContext) =>
                        sharedContext ? (
                          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                            <Users className="size-4 shrink-0" />
                            <span>Shared context — you both attend and can edit this.</span>
                          </div>
                        ) : (
                          <form.Field name="visibility">
                            {(field) => (
                              <Field>
                                <FieldLabel>Sharing</FieldLabel>
                                <ToggleGroup
                                  type="single"
                                  variant="outline"
                                  value={field.state.value}
                                  onValueChange={(v) =>
                                    v && field.handleChange(v as EventVisibility)
                                  }
                                  className="justify-start"
                                >
                                  <ToggleGroupItem value="private">
                                    <Lock data-icon="inline-start" />
                                    Private
                                  </ToggleGroupItem>
                                  <ToggleGroupItem value="visible">
                                    <Eye data-icon="inline-start" />
                                    Visible
                                  </ToggleGroupItem>
                                  <ToggleGroupItem value="shared">
                                    <Users data-icon="inline-start" />
                                    Shared
                                  </ToggleGroupItem>
                                </ToggleGroup>
                                <FieldDescription>
                                  {field.state.value === "private"
                                    ? "Only you can see this."
                                    : field.state.value === "shared"
                                      ? "Shows on both calendars; you both can edit it."
                                      : "Your partner can see it on your calendar; only you can edit it."}
                                </FieldDescription>
                              </Field>
                            )}
                          </form.Field>
                        )
                      }
                    </form.Subscribe>

                    <Separator />

                    {/* More options — progressive disclosure for the secondary fields */}
                    <Collapsible open={readOnly ? true : showMore} onOpenChange={setShowMore}>
                      <CollapsibleTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full justify-between px-0 font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
                        >
                          More options
                          <ChevronDown
                            className={`size-4 transition-transform ${
                              readOnly || showMore ? "rotate-180" : ""
                            }`}
                          />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="flex flex-col gap-4 pt-4">
                        <form.Field name="status">
                          {(field) => (
                            <Field>
                              <FieldLabel>Status</FieldLabel>
                              <ToggleGroup
                                type="single"
                                variant="outline"
                                value={field.state.value}
                                onValueChange={(v) => v && field.handleChange(v as EventStatus)}
                                className="justify-start"
                              >
                                <ToggleGroupItem value="planned">Planned</ToggleGroupItem>
                                <ToggleGroupItem value="confirmed">Confirmed</ToggleGroupItem>
                                <ToggleGroupItem value="cancelled">Cancelled</ToggleGroupItem>
                              </ToggleGroup>
                            </Field>
                          )}
                        </form.Field>

                        <form.Field name="location">
                          {(field) => (
                            <Field>
                              <FieldLabel htmlFor="ev-location">Location</FieldLabel>
                              <Input
                                id="ev-location"
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
                                onBlur={field.handleBlur}
                                placeholder="Add a location"
                              />
                            </Field>
                          )}
                        </form.Field>

                        <form.Field name="description">
                          {(field) => (
                            <Field>
                              <FieldLabel htmlFor="ev-notes">Notes</FieldLabel>
                              <Textarea
                                id="ev-notes"
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
                                onBlur={field.handleBlur}
                                rows={2}
                              />
                            </Field>
                          )}
                        </form.Field>

                        <form.Subscribe
                          selector={(s) => computeEventTimes(s.values, timeZone).start}
                        >
                          {(startMs) => (
                            <form.Field name="recurrence">
                              {(field) => (
                                <RecurrenceEditor
                                  value={field.state.value}
                                  onChange={field.handleChange}
                                  startMs={startMs}
                                />
                              )}
                            </form.Field>
                          )}
                        </form.Subscribe>

                        <form.Field name="inactive">
                          {(field) => (
                            <Field orientation="horizontal">
                              <Switch
                                id="ev-inactive"
                                checked={field.state.value}
                                onCheckedChange={field.handleChange}
                              />
                              <FieldLabel htmlFor="ev-inactive">Inactive (grayed out)</FieldLabel>
                            </Field>
                          )}
                        </form.Field>
                      </CollapsibleContent>
                    </Collapsible>

                    {/* Optimization details — optional attributes feeding /insights.
                        Hidden for contexts: backdrops never count as tracked time. */}
                    {!isContext && (
                      <Collapsible
                        open={readOnly ? true : showOptimization}
                        onOpenChange={setShowOptimization}
                      >
                        <CollapsibleTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full justify-between px-0 font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
                          >
                            Optimization details
                            <ChevronDown
                              className={`size-4 transition-transform ${
                                readOnly || showOptimization ? "rotate-180" : ""
                              }`}
                            />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-4">
                          <form.Field name="attributes">
                            {(field) => (
                              <AttributeFields
                                value={field.state.value}
                                onChange={field.handleChange}
                                idPrefix="ev"
                              />
                            )}
                          </form.Field>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </FieldGroup>
                  </fieldset>
                  </ResponsiveDialogBody>
                </>
              );
            }}
          </form.Subscribe>

          <ResponsiveDialogFooter className="sm:justify-between">
            {readOnly ? (
              <Button variant="outline" onClick={() => onOpenChange(false)} className="ml-auto">
                Close
              </Button>
            ) : (
              <form.Subscribe selector={(s) => s.isSubmitting}>
                {(isSubmitting) => (
                  <>
                    {mode === "edit" ? (
                      <Button
                        variant="ghost"
                        onClick={onDelete}
                        disabled={isSubmitting}
                        className="text-destructive"
                      >
                        <Trash2 data-icon="inline-start" />
                        Delete
                      </Button>
                    ) : (
                      <span />
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                      >
                        Cancel
                      </Button>
                      <Button onClick={() => void form.handleSubmit()} disabled={isSubmitting}>
                        {isSubmitting && (
                          <Loader2 data-icon="inline-start" className="animate-spin" />
                        )}
                        {mode === "create" ? "Create" : "Save"}
                      </Button>
                    </div>
                  </>
                )}
              </form.Subscribe>
            )}
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <RecurrenceScopePrompt
        open={scopePrompt !== null}
        onOpenChange={(o) => !o && setScopePrompt(null)}
        mode={scopePrompt === "delete" ? "delete" : "edit"}
        onChoose={(s) => (scopePrompt === "delete" ? onDeleteScope(s) : onEditScope(s))}
      />

      <CreateContextDialog
        open={creatingContext}
        onOpenChange={setCreatingContext}
        workspaceId={workspaceId}
        currentMemberId={currentMemberId}
        onCreated={(id) => form.setFieldValue("categoryId", id)}
      />
    </>
  );
}

/**
 * Whether any of the fields tucked behind "More options" carries a non-default
 * value — used to auto-expand that section when editing an event that already
 * uses them (so nothing is hidden), while keeping it collapsed for quick adds.
 */
function hasAdvanced(values: EventFormValues): boolean {
  return (
    values.status !== "confirmed" ||
    values.inactive ||
    values.location.trim() !== "" ||
    values.description.trim() !== "" ||
    values.recurrence !== null
  );
}

function recurrenceEndsAt(form: RecurrenceForm | null): number | null {
  if (form && form.end.type === "until") return form.end.dateMs;
  return null;
}

function buildInitial(props: EventDialogProps, timeZone: string): EventFormValues {
  const { mode, event, occurrence, defaultStart, defaultEnd, defaultCategoryId } = props;
  if (mode === "edit" && event && occurrence) {
    // All-day events are floating dates anchored to UTC midnight: read their
    // date in UTC so the picker shows the same calendar date for every viewer.
    const dateZone = occurrence.allDay ? "UTC" : timeZone;
    return {
      itemKind: event.kind,
      title: occurrence.title,
      description: occurrence.description ?? "",
      location: occurrence.location ?? "",
      allDay: occurrence.allDay,
      inactive: occurrence.inactive,
      status: event.status,
      startDate: msToDateInput(occurrence.start, dateZone),
      startTime: msToTimeInput(occurrence.start, timeZone),
      endDate: msToDateInput(occurrence.allDay ? occurrence.end - 1 : occurrence.end, dateZone),
      endTime: msToTimeInput(occurrence.end, timeZone),
      categoryId: occurrence.categoryId ?? "none",
      visibility: event.isPrivate ? "private" : event.isShared ? "shared" : "visible",
      color: event.color ?? null,
      recurrence: parseRRule(event.rrule),
      // From the MASTER event, not the occurrence patch — attributes are
      // series-level (no override column).
      attributes: parseAttributes(event.attributes),
    };
  }
  const start = defaultStart ?? ceilToStep(Date.now(), 30);
  const end = defaultEnd ?? start + 3_600_000;
  return {
    itemKind: "event",
    title: "",
    description: "",
    location: "",
    allDay: false,
    inactive: false,
    status: "confirmed",
    startDate: msToDateInput(start, timeZone),
    startTime: msToTimeInput(start, timeZone),
    endDate: msToDateInput(end, timeZone),
    endTime: msToTimeInput(end, timeZone),
    categoryId: defaultCategoryId ?? "none",
    visibility: "visible",
    color: null,
    recurrence: null,
    attributes: {},
  };
}
