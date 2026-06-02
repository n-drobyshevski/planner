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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { Lock, Trash2, Loader2 } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { TimeField } from "@/components/ui/time-field";
import { RecurrenceEditor } from "./recurrence-editor";
import { RecurrenceScopePrompt, type RecurrenceScope } from "./recurrence-scope-prompt";
import { ColorField } from "@/components/shared/color-field";
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
import type { Category, EventKind, EventRow, Occurrence } from "@/lib/types";
import type { EventInput } from "@/lib/supabase/mappers";

interface FormState {
  itemKind: EventKind;
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  inactive: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  categoryId: string; // "none" | id — the Context this item belongs to / a window paints
  isPrivate: boolean;
  /** own color override (hex); null = derive from category/owner */
  color: string | null;
  recurrence: RecurrenceForm | null;
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
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [scopePrompt, setScopePrompt] = useState<null | "edit" | "delete">(null);

  // Re-initialize when (re)opened for a different event/slot.
  useEffect(() => {
    if (open) {
      setForm(buildInitial(props, timeZone));
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
        isPrivate: form.isPrivate,
        color: form.color,
        allDay: isContext ? false : form.allDay,
        inactive: form.inactive,
        start,
        end,
        timeZone,
        rrule: buildRRule(form.recurrence),
        recurrenceEndsAt: recurrenceEndsAt(form.recurrence),
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
    // single event (may gain recurrence)
    setPending(true);
    finish(
      await mutations.updateSingle(event.id, {
        categoryId: form.categoryId === "none" ? null : form.categoryId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        location: form.location.trim() || null,
        isPrivate: form.isPrivate,
        color: form.color,
        allDay: isContext ? false : form.allDay,
        inactive: form.inactive,
        start,
        end,
        rrule: buildRRule(form.recurrence),
        recurrenceEndsAt: recurrenceEndsAt(form.recurrence),
      }),
    );
  }

  async function onEditScope(scope: RecurrenceScope) {
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
      start,
      end,
    };
    setScopePrompt(null);
    setPending(true);

    // Color is series-level (a master column, no per-occurrence form), like the
    // Context membership carried in `patch.categoryId`. "this"/"future"/"all"
    // govern time/content; the color change is applied to the relevant series.
    const colorChanged = form.color !== (event.color ?? null);

    if (scope === "this") {
      // A per-occurrence edit can't carry series-level fields, so apply any
      // color change to the whole series.
      if (colorChanged) void mutations.updateSingle(event.id, { color: form.color });
      finish(await mutations.editThis(event, occurrence.occurrenceDate, patch));
    } else if (scope === "future") {
      finish(
        await mutations.editFuture(
          event,
          occurrence.occurrenceDate,
          patch,
          colorChanged ? form.color : undefined,
        ),
      );
    } else {
      // all: shift the whole series by the same delta + update fields + rrule.
      const delta = start - occurrence.start;
      finish(
        await mutations.updateSingle(event.id, {
          title: patch.title,
          description: patch.description,
          location: patch.location,
          categoryId: patch.categoryId,
          color: form.color,
          allDay: form.allDay,
          inactive: form.inactive,
          start: event.start + delta,
          end: event.end + delta,
          rrule: buildRRule(form.recurrence),
          recurrenceEndsAt: recurrenceEndsAt(form.recurrence),
        }),
      );
    }
  }

  async function onDelete() {
    if (!event || !occurrence) return;
    if (isRecurringEdit) {
      setScopePrompt("delete");
      return;
    }
    setPending(true);
    finish(await mutations.remove(event.id));
  }

  async function onDeleteScope(scope: RecurrenceScope) {
    if (!event || !occurrence) return;
    setScopePrompt(null);
    setPending(true);
    if (scope === "this") {
      finish(await mutations.deleteThis(event, occurrence.occurrenceDate));
    } else if (scope === "future") {
      finish(await mutations.deleteFuture(event, occurrence.occurrenceDate));
    } else {
      finish(await mutations.deleteAll(event.id));
    }
  }

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {mode === "create"
                ? isContext
                  ? "New context"
                  : "New event"
                : isContext
                  ? "Edit context"
                  : "Edit event"}
            </ResponsiveDialogTitle>
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
          <FieldGroup>
            {mode === "create" && (
              <Field>
                <FieldLabel>Type</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={form.itemKind}
                  onValueChange={(v) => v && set("itemKind", v as EventKind)}
                  className="justify-start"
                >
                  <ToggleGroupItem value="event">Event</ToggleGroupItem>
                  <ToggleGroupItem value="context">Context</ToggleGroupItem>
                </ToggleGroup>
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="ev-title">
                {isContext ? "Name" : "Title"}
              </FieldLabel>
              <Input
                id="ev-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder={isContext ? "Name this context (e.g. Work)" : "Add a title"}
                autoFocus
              />
            </Field>

            {!isContext && (
              <Field orientation="horizontal">
                <Switch
                  id="ev-allday"
                  checked={form.allDay}
                  onCheckedChange={(v) => set("allDay", v)}
                />
                <FieldLabel htmlFor="ev-allday">All day</FieldLabel>
              </Field>
            )}

            <Field orientation="horizontal">
              <Switch
                id="ev-inactive"
                checked={form.inactive}
                onCheckedChange={(v) => set("inactive", v)}
              />
              <FieldLabel htmlFor="ev-inactive">Inactive (grayed out)</FieldLabel>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Starts</FieldLabel>
                <DatePicker
                  value={form.startDate}
                  onChange={(v) => set("startDate", v)}
                  aria-label="Start date"
                />
              </Field>
              {!form.allDay && (
                <Field>
                  <FieldLabel>&nbsp;</FieldLabel>
                  <TimeField
                    value={form.startTime}
                    onChange={(v) => set("startTime", v)}
                    aria-label="Start time"
                  />
                </Field>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Ends</FieldLabel>
                <DatePicker
                  value={form.endDate}
                  onChange={(v) => set("endDate", v)}
                  aria-label="End date"
                />
              </Field>
              {!form.allDay && (
                <Field>
                  <FieldLabel>&nbsp;</FieldLabel>
                  <TimeField
                    value={form.endTime}
                    onChange={(v) => set("endTime", v)}
                    aria-label="End time"
                  />
                </Field>
              )}
            </div>

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

            <Field>
              <FieldLabel htmlFor="ev-color">Color</FieldLabel>
              <ColorField
                id="ev-color"
                value={form.color}
                onChange={(c) => set("color", c)}
              />
            </Field>

            <Field orientation="horizontal">
              <Switch
                id="ev-private"
                checked={form.isPrivate}
                onCheckedChange={(v) => set("isPrivate", v)}
              />
              <FieldLabel htmlFor="ev-private">Private (only you can see this)</FieldLabel>
            </Field>

            <Field>
              <FieldLabel>Location</FieldLabel>
              <Input
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="Add a location"
              />
            </Field>

            <Field>
              <FieldLabel>Notes</FieldLabel>
              <Textarea
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
    </>
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
      startDate: msToDateInput(occurrence.start, dateZone),
      startTime: msToTimeInput(occurrence.start, timeZone),
      endDate: msToDateInput(occurrence.allDay ? occurrence.end - 1 : occurrence.end, dateZone),
      endTime: msToTimeInput(occurrence.end, timeZone),
      categoryId: occurrence.categoryId ?? "none",
      isPrivate: event.isPrivate,
      color: event.color ?? null,
      recurrence: parseRRule(event.rrule),
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
    startDate: msToDateInput(start, timeZone),
    startTime: msToTimeInput(start, timeZone),
    endDate: msToDateInput(end, timeZone),
    endTime: msToTimeInput(end, timeZone),
    categoryId: defaultCategoryId ?? "none",
    isPrivate: false,
    color: null,
    recurrence: null,
  };
}
