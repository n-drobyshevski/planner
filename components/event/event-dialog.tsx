"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Trash2, Loader2 } from "lucide-react";
import { RecurrenceEditor } from "./recurrence-editor";
import { RecurrenceScopePrompt, type RecurrenceScope } from "./recurrence-scope-prompt";
import { useEventMutations } from "@/lib/hooks/use-event-mutations";
import { buildRRule, parseRRule, type RecurrenceForm } from "@/lib/recurrence/rrule-build";
import {
  msToDateInput,
  msToTimeInput,
  combineDateTime,
  dateInputToMs,
  localTimeZone,
  ceilToStep,
  DAY_IN_MS,
} from "@/lib/datetime/local";
import type { Category, EventRow, Occurrence, Scope, Visibility } from "@/lib/types";
import type { EventInput } from "@/lib/supabase/mappers";

interface FormState {
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  categoryId: string; // "none" | id
  scope: Scope;
  visibility: Visibility;
  recurrence: RecurrenceForm | null;
}

export interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  workspaceId: string;
  currentMemberId: string;
  categories: Category[];
  event?: EventRow | null;
  occurrence?: Occurrence | null;
  defaultStart?: number;
  defaultEnd?: number;
}

export function EventDialog(props: EventDialogProps) {
  const { open, onOpenChange, mode, workspaceId, currentMemberId, categories, event, occurrence } =
    props;
  const mutations = useEventMutations(workspaceId);

  const [form, setForm] = useState<FormState>(() => buildInitial(props));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [scopePrompt, setScopePrompt] = useState<null | "edit" | "delete">(null);

  // Re-initialize when (re)opened for a different event/slot.
  useEffect(() => {
    if (open) {
      setForm(buildInitial(props));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id, occurrence?.key, mode]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const isRecurringEdit = mode === "edit" && Boolean(event?.rrule);

  const usableCategories = categories.filter(
    (c) => c.ownerId === null || c.ownerId === currentMemberId,
  );

  function computeTimes() {
    const start = form.allDay
      ? dateInputToMs(form.startDate)
      : combineDateTime(form.startDate, form.startTime);
    const end = form.allDay
      ? dateInputToMs(form.endDate) + DAY_IN_MS
      : combineDateTime(form.endDate, form.endTime);
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
        categoryId: form.categoryId === "none" ? null : form.categoryId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        location: form.location.trim() || null,
        scope: form.scope,
        visibility: form.scope === "shared" ? "shared" : form.visibility,
        allDay: form.allDay,
        start,
        end,
        timeZone: localTimeZone(),
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
        scope: form.scope,
        visibility: form.scope === "shared" ? "shared" : form.visibility,
        allDay: form.allDay,
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
      start,
      end,
    };
    setScopePrompt(null);
    setPending(true);

    if (scope === "this") {
      finish(await mutations.editThis(event, occurrence.occurrenceDate, patch));
    } else if (scope === "future") {
      finish(await mutations.editFuture(event, occurrence.occurrenceDate, patch));
    } else {
      // all: shift the whole series by the same delta + update fields + rrule.
      const delta = start - occurrence.start;
      finish(
        await mutations.updateSingle(event.id, {
          title: patch.title,
          description: patch.description,
          location: patch.location,
          categoryId: patch.categoryId,
          allDay: form.allDay,
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
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "New event" : "Edit event"}</DialogTitle>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ev-title">Title</FieldLabel>
              <Input
                id="ev-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Add a title"
                autoFocus
              />
            </Field>

            <Field orientation="horizontal">
              <Switch
                id="ev-allday"
                checked={form.allDay}
                onCheckedChange={(v) => set("allDay", v)}
              />
              <FieldLabel htmlFor="ev-allday">All day</FieldLabel>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Starts</FieldLabel>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                />
              </Field>
              {!form.allDay && (
                <Field>
                  <FieldLabel>&nbsp;</FieldLabel>
                  <Input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => set("startTime", e.target.value)}
                  />
                </Field>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Ends</FieldLabel>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => set("endDate", e.target.value)}
                />
              </Field>
              {!form.allDay && (
                <Field>
                  <FieldLabel>&nbsp;</FieldLabel>
                  <Input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => set("endTime", e.target.value)}
                  />
                </Field>
              )}
            </div>

            <Field>
              <FieldLabel>Category</FieldLabel>
              <Select value={form.categoryId} onValueChange={(v) => set("categoryId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="No category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">No category</SelectItem>
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
              <FieldLabel>Calendar</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                value={form.scope}
                onValueChange={(v) => v && set("scope", v as Scope)}
                className="justify-start"
              >
                <ToggleGroupItem value="shared">Shared</ToggleGroupItem>
                <ToggleGroupItem value="personal">Personal</ToggleGroupItem>
              </ToggleGroup>
            </Field>

            {form.scope === "personal" && (
              <Field orientation="horizontal">
                <Switch
                  id="ev-private"
                  checked={form.visibility === "private"}
                  onCheckedChange={(v) => set("visibility", v ? "private" : "shared")}
                />
                <FieldLabel htmlFor="ev-private">Private to me</FieldLabel>
              </Field>
            )}

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

          <DialogFooter className="sm:justify-between">
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

function buildInitial(props: EventDialogProps): FormState {
  const { mode, event, occurrence, defaultStart, defaultEnd } = props;
  if (mode === "edit" && event && occurrence) {
    return {
      title: occurrence.title,
      description: occurrence.description ?? "",
      location: occurrence.location ?? "",
      allDay: occurrence.allDay,
      startDate: msToDateInput(occurrence.start),
      startTime: msToTimeInput(occurrence.start),
      endDate: msToDateInput(occurrence.allDay ? occurrence.end - 1 : occurrence.end),
      endTime: msToTimeInput(occurrence.end),
      categoryId: occurrence.categoryId ?? "none",
      scope: event.scope,
      visibility: event.visibility,
      recurrence: parseRRule(event.rrule),
    };
  }
  const start = defaultStart ?? ceilToStep(Date.now(), 30);
  const end = defaultEnd ?? start + 3_600_000;
  return {
    title: "",
    description: "",
    location: "",
    allDay: false,
    startDate: msToDateInput(start),
    startTime: msToTimeInput(start),
    endDate: msToDateInput(end),
    endTime: msToTimeInput(end),
    categoryId: "none",
    scope: "shared",
    visibility: "shared",
    recurrence: null,
  };
}
