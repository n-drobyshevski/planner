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
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field";
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
  type ItemAttributes,
} from "@/lib/attributes/schema";
import { useEventMutations } from "@/lib/hooks/use-event-mutations";
import { buildRRule, parseRRule, type RecurrenceForm } from "@/lib/recurrence/rrule-build";
import {
  msToDateInput,
  msToTimeInput,
  combineDateTime,
  dateInputToUtcMs,
  ceilToStep,
  DAY_IN_MS,
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
type EventVisibility = "private" | "visible" | "shared";

/** Sentinel Select value for the inline "Create new context…" action. */
const CREATE_CONTEXT_VALUE = "__create__";

interface FormState {
  itemKind: EventKind;
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  inactive: boolean;
  status: EventStatus;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  categoryId: string; // "none" | id — the Context this item belongs to / a window paints
  visibility: EventVisibility;
  /** own color override (hex); null = derive from category/owner */
  color: string | null;
  recurrence: RecurrenceForm | null;
  /** optimization attributes (series-level; full parsed bag so unknown keys survive saves) */
  attributes: ItemAttributes;
}

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

  const [form, setForm] = useState<FormState>(() => buildInitial(props, timeZone));
  const [showMore, setShowMore] = useState(() => hasAdvanced(form));
  const [showOptimization, setShowOptimization] = useState(() =>
    hasAnyAttribute(form.attributes),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [scopePrompt, setScopePrompt] = useState<null | "edit" | "delete">(null);
  const [creatingContext, setCreatingContext] = useState(false);

  // Re-initialize when (re)opened for a different event/slot.
  useEffect(() => {
    if (open) {
      const next = buildInitial(props, timeZone);
      setForm(next);
      setShowMore(hasAdvanced(next));
      setShowOptimization(hasAnyAttribute(next.attributes));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id, occurrence?.key, mode]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const isRecurringEdit = mode === "edit" && Boolean(event?.rrule);
  const isContext = form.itemKind === "context";

  const usableCategories = categories.filter(
    (c) => c.ownerId === null || c.ownerId === currentMemberId,
  );

  // An item filed under a SHARED context (owner_id IS NULL) is JOINT via the
  // context, so the per-event visibility control is hidden and the stored flags
  // are coerced clean (jointness comes from the context). Otherwise the 3-way
  // control governs the flags.
  const selectedCategory =
    form.categoryId !== "none"
      ? categories.find((c) => c.id === form.categoryId) ?? null
      : null;
  const sharedContext = selectedCategory?.ownerId === null;
  const isPrivate = sharedContext ? false : form.visibility === "private";
  const isShared = sharedContext ? false : form.visibility === "shared";

  function computeTimes() {
    // All-day events are floating dates anchored to UTC midnight (the same
    // calendar date for everyone); timed events are interpreted in the viewer's
    // chosen zone.
    const start = form.allDay
      ? dateInputToUtcMs(form.startDate)
      : combineDateTime(form.startDate, form.startTime, timeZone);
    const end = form.allDay
      ? dateInputToUtcMs(form.endDate) + DAY_IN_MS
      : combineDateTime(form.endDate, form.endTime, timeZone);
    return { start, end };
  }

  function validate(): { start: number; end: number } | null {
    if (!form.title.trim()) {
      setError("Please add a title.");
      return null;
    }
    const { start, end } = computeTimes();
    if (end <= start) {
      setError("End must be after start.");
      return null;
    }
    return { start, end };
  }

  async function finish(ok: boolean) {
    setPending(false);
    if (ok) onOpenChange(false);
  }

  // Edit/delete close immediately: the mutation's optimistic cache patch (or a
  // background refetch for the series-split paths) updates the grid, and any
  // failure surfaces via toast + undo — so there's no spinner wait. Create keeps
  // the await path (finish/pending) so a failed insert never discards the
  // unsaved form.
  function close() {
    onOpenChange(false);
  }

  async function onSave() {
    const times = validate();
    if (!times) return;
    const { start, end } = times;

    if (mode === "create") {
      setPending(true);
      const input: EventInput = {
        workspaceId,
        ownerId: currentMemberId,
        kind: form.itemKind,
        // The Context an item belongs to, or the Context a window paints.
        categoryId: form.categoryId === "none" ? null : form.categoryId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        location: form.location.trim() || null,
        isPrivate,
        isShared,
        color: form.color,
        allDay: isContext ? false : form.allDay,
        inactive: form.inactive,
        status: form.status,
        start,
        end,
        timeZone,
        rrule: buildRRule(form.recurrence),
        recurrenceEndsAt: recurrenceEndsAt(form.recurrence),
        attributes: form.attributes,
      };
      finish(await mutations.create(input));
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
      categoryId: form.categoryId === "none" ? null : form.categoryId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      isPrivate,
      isShared,
      color: form.color,
      allDay: isContext ? false : form.allDay,
      inactive: form.inactive,
      status: form.status,
      start,
      end,
      rrule: buildRRule(form.recurrence),
      recurrenceEndsAt: recurrenceEndsAt(form.recurrence),
      attributes: form.attributes,
    };
    close();
    void mutations.updateSingle(event.id, patch, undefined, patch);
  }

  function onEditScope(scope: RecurrenceScope) {
    if (!event || !occurrence) return;
    const times = validate();
    if (!times) {
      setScopePrompt(null);
      return;
    }
    const { start, end } = times;
    const patch = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      categoryId: form.categoryId === "none" ? null : form.categoryId,
      allDay: form.allDay,
      inactive: form.inactive,
      status: form.status,
      start,
      end,
    };
    setScopePrompt(null);
    close();

    // Color and attributes are series-level (master columns, no per-occurrence
    // form), like the Context membership carried in `patch.categoryId`.
    // "this"/"future"/"all" govern time/content; series-level changes are
    // applied to the relevant series.
    const colorChanged = form.color !== (event.color ?? null);
    const attrsChanged = !attributesEqual(
      form.attributes,
      parseAttributes(event.attributes),
    );

    if (scope === "this") {
      // A per-occurrence edit can't carry series-level fields, so apply any
      // color/attribute change to the whole series in one side patch.
      if (colorChanged || attrsChanged) {
        const sidePatch: Partial<EventInput> = {
          ...(colorChanged ? { color: form.color } : {}),
          ...(attrsChanged ? { attributes: form.attributes } : {}),
        };
        void mutations.updateSingle(event.id, sidePatch, undefined, sidePatch);
      }
      void mutations.editThis(event, occurrence.occurrenceDate, patch);
    } else if (scope === "future") {
      void mutations.editFuture(
        event,
        occurrence.occurrenceDate,
        patch,
        colorChanged ? form.color : undefined,
        attrsChanged ? form.attributes : undefined,
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
        color: form.color,
        allDay: form.allDay,
        inactive: form.inactive,
        status: form.status,
        start: event.start + delta,
        end: event.end + delta,
        rrule: buildRRule(form.recurrence),
        recurrenceEndsAt: recurrenceEndsAt(form.recurrence),
        attributes: form.attributes,
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
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={form.itemKind}
                  onValueChange={(v) => v && set("itemKind", v as EventKind)}
                  aria-label="Item type"
                  className="shrink-0"
                >
                  <ToggleGroupItem value="event">Event</ToggleGroupItem>
                  <ToggleGroupItem value="context">Context</ToggleGroupItem>
                </ToggleGroup>
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
            <Input
              id="ev-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder={isContext ? "Name this context" : "Add title"}
              aria-label={isContext ? "Context name" : "Event title"}
              autoFocus
              className="h-auto border-0 bg-transparent px-0 py-1 text-lg font-medium md:text-lg shadow-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-transparent"
            />

            {/* When — schedule card grouping all-day + start/end */}
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">When</span>
                {!isContext && (
                  <label
                    htmlFor="ev-allday"
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <span>All day</span>
                    <Switch
                      id="ev-allday"
                      checked={form.allDay}
                      onCheckedChange={(v) => set("allDay", v)}
                    />
                  </label>
                )}
              </div>

              <div className="grid grid-cols-[3rem_1fr_auto] items-center gap-2">
                <span className="text-sm text-muted-foreground">Start</span>
                <DatePicker
                  value={form.startDate}
                  onChange={(v) => set("startDate", v)}
                  aria-label="Start date"
                />
                {!form.allDay ? (
                  <TimeField
                    value={form.startTime}
                    onChange={(v) => set("startTime", v)}
                    aria-label="Start time"
                    className="w-20"
                  />
                ) : (
                  <span className="w-20" aria-hidden />
                )}
              </div>

              <div className="grid grid-cols-[3rem_1fr_auto] items-center gap-2">
                <span className="text-sm text-muted-foreground">End</span>
                <DatePicker
                  value={form.endDate}
                  onChange={(v) => set("endDate", v)}
                  aria-label="End date"
                />
                {!form.allDay ? (
                  <TimeField
                    value={form.endTime}
                    onChange={(v) => set("endTime", v)}
                    aria-label="End time"
                    className="w-20"
                  />
                ) : (
                  <span className="w-20" aria-hidden />
                )}
              </div>
            </div>

            {/* Context + Color — paired row */}
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="ev-context">Context</FieldLabel>
                <Select
                  value={form.categoryId}
                  onValueChange={(v) =>
                    v === CREATE_CONTEXT_VALUE
                      ? setCreatingContext(true)
                      : set("categoryId", v)
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
                      <SelectItem value={CREATE_CONTEXT_VALUE} className="text-muted-foreground">
                        <Plus className="size-4" />
                        Create new context…
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="ev-color">Color</FieldLabel>
                <ColorField
                  id="ev-color"
                  value={form.color}
                  onChange={(c) => set("color", c)}
                />
              </Field>
            </div>

            {/* Sharing — or shared-context banner */}
            {sharedContext ? (
              <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                <Users className="size-4 shrink-0" />
                <span>Shared context — you both attend and can edit this.</span>
              </div>
            ) : (
              <Field>
                <FieldLabel>Sharing</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={form.visibility}
                  onValueChange={(v) => v && set("visibility", v as EventVisibility)}
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
                  {form.visibility === "private"
                    ? "Only you can see this."
                    : form.visibility === "shared"
                      ? "Shows on both calendars; you both can edit it."
                      : "Your partner can see it on your calendar; only you can edit it."}
                </FieldDescription>
              </Field>
            )}

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
                <Field>
                  <FieldLabel>Status</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={form.status}
                    onValueChange={(v) => v && set("status", v as EventStatus)}
                    className="justify-start"
                  >
                    <ToggleGroupItem value="planned">Planned</ToggleGroupItem>
                    <ToggleGroupItem value="confirmed">Confirmed</ToggleGroupItem>
                    <ToggleGroupItem value="cancelled">Cancelled</ToggleGroupItem>
                  </ToggleGroup>
                </Field>

                <Field>
                  <FieldLabel htmlFor="ev-location">Location</FieldLabel>
                  <Input
                    id="ev-location"
                    value={form.location}
                    onChange={(e) => set("location", e.target.value)}
                    placeholder="Add a location"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="ev-notes">Notes</FieldLabel>
                  <Textarea
                    id="ev-notes"
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    rows={2}
                  />
                </Field>

                <RecurrenceEditor
                  value={form.recurrence}
                  onChange={(v) => set("recurrence", v)}
                  startMs={computeTimes().start}
                />

                <Field orientation="horizontal">
                  <Switch
                    id="ev-inactive"
                    checked={form.inactive}
                    onCheckedChange={(v) => set("inactive", v)}
                  />
                  <FieldLabel htmlFor="ev-inactive">Inactive (grayed out)</FieldLabel>
                </Field>
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
                  <AttributeFields
                    value={form.attributes}
                    onChange={(v) => set("attributes", v)}
                    idPrefix="ev"
                  />
                </CollapsibleContent>
              </Collapsible>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </FieldGroup>
          </fieldset>
          </ResponsiveDialogBody>

          <ResponsiveDialogFooter className="sm:justify-between">
            {readOnly ? (
              <Button variant="outline" onClick={() => onOpenChange(false)} className="ml-auto">
                Close
              </Button>
            ) : (
              <>
                {mode === "edit" ? (
                  <Button variant="ghost" onClick={onDelete} disabled={pending} className="text-destructive">
                    <Trash2 data-icon="inline-start" />
                    Delete
                  </Button>
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
              </>
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
        onCreated={(id) => set("categoryId", id)}
      />
    </>
  );
}

/**
 * Whether any of the fields tucked behind "More options" carries a non-default
 * value — used to auto-expand that section when editing an event that already
 * uses them (so nothing is hidden), while keeping it collapsed for quick adds.
 */
function hasAdvanced(form: FormState): boolean {
  return (
    form.status !== "confirmed" ||
    form.inactive ||
    form.location.trim() !== "" ||
    form.description.trim() !== "" ||
    form.recurrence !== null
  );
}

function recurrenceEndsAt(form: RecurrenceForm | null): number | null {
  if (form && form.end.type === "until") return form.end.dateMs;
  return null;
}

function buildInitial(props: EventDialogProps, timeZone: string): FormState {
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
