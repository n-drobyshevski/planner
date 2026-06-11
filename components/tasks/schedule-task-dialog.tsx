"use client";

import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { TimeField } from "@/components/ui/time-field";
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
import { CalendarPlus, Loader2 } from "lucide-react";
import { useTaskMutations } from "@/lib/hooks/use-task-mutations";
import {
  scheduleTaskFormSchema,
  type ScheduleTaskFormValues,
} from "@/lib/tasks/schemas";
import { splitIntoBlocks, backToBack } from "@/lib/tasks/schedule";
import { sortByPosition } from "@/lib/tasks/tree";
import {
  msToDateInput,
  msToTimeInput,
  combineDateTime,
  ceilToStep,
} from "@/lib/datetime/local";
import { useViewerTimeZone } from "@/lib/datetime/timezone-context";
import type { TaskRow } from "@/lib/types";

type Mode = ScheduleTaskFormValues["mode"];

const DURATIONS = [
  ["15", "15 min"],
  ["30", "30 min"],
  ["45", "45 min"],
  ["60", "1 hour"],
  ["90", "1.5 hours"],
  ["120", "2 hours"],
] as const;

export function ScheduleTaskDialog({
  open,
  onOpenChange,
  task,
  subtasks,
  workspaceId,
  defaultStartMs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskRow;
  subtasks: TaskRow[];
  workspaceId: string;
  defaultStartMs?: number;
}) {
  const mutations = useTaskMutations(workspaceId);
  const timeZone = useViewerTimeZone();
  const hasSubtasks = subtasks.length > 0;

  const ordered = sortByPosition(subtasks);

  // The dialog is conditionally mounted by its openers (it remounts fresh per
  // open), so the seed is computed once in a lazy initializer — fields render
  // filled on the first paint instead of flashing empty until an effect ran.
  const [defaults] = useState((): ScheduleTaskFormValues => {
    const seed = defaultStartMs ?? ceilToStep(Date.now() + 3_600_000, 30);
    return {
      date: msToDateInput(seed, timeZone),
      time: msToTimeInput(seed, timeZone),
      mode: "single",
      duration: "60", // single & per-subtask minutes
      totalDuration: "120", // split total minutes
      count: "2",
    };
  });

  const form = useForm({
    defaultValues: defaults,
    validators: { onSubmit: scheduleTaskFormSchema },
    onSubmit: async ({ value }) => {
      const start = combineDateTime(value.date, value.time, timeZone);
      const tz = timeZone;
      let ok = false;
      if (value.mode === "subtasks" && hasSubtasks) {
        const per = Number(value.duration);
        const segs = backToBack(
          start,
          ordered.map(() => per),
        );
        ok = await mutations.scheduleMany(
          ordered.map((st, i) => ({ task: st, start: segs[i].start, end: segs[i].end, title: st.title })),
          tz,
        );
      } else if (value.mode === "split") {
        const n = Math.max(1, Math.min(12, Number(value.count) || 1));
        const segs = splitIntoBlocks(start, Number(value.totalDuration), n);
        ok = await mutations.schedule(
          task,
          segs.map((s, i) => ({ ...s, title: `${task.title} (${i + 1}/${n})` })),
          tz,
        );
      } else {
        ok = await mutations.schedule(
          task,
          [{ start, end: start + Number(value.duration) * 60_000 }],
          tz,
        );
      }
      if (ok) onOpenChange(false);
    },
  });

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Add to calendar</ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="truncate">
            {task.title}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <ResponsiveDialogBody>
        <FieldGroup>
          <div className="grid grid-cols-2 gap-3">
            <form.Field name="date">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid || undefined}>
                    <FieldLabel htmlFor="sched-date">Date</FieldLabel>
                    <DatePicker
                      id="sched-date"
                      value={field.state.value}
                      onChange={field.handleChange}
                      aria-label="Date"
                    />
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                );
              }}
            </form.Field>
            <form.Field name="time">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid || undefined}>
                    <FieldLabel htmlFor="sched-time">Start</FieldLabel>
                    <TimeField
                      id="sched-time"
                      value={field.state.value}
                      onChange={field.handleChange}
                      aria-label="Start"
                    />
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                );
              }}
            </form.Field>
          </div>

          <form.Field name="mode">
            {(field) => (
              <Field>
                <FieldLabel>How</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={field.state.value}
                  onValueChange={(v) => v && field.handleChange(v as Mode)}
                  className="justify-start"
                >
                  <ToggleGroupItem value="single">One block</ToggleGroupItem>
                  <ToggleGroupItem value="split">Split</ToggleGroupItem>
                  {hasSubtasks && (
                    <ToggleGroupItem value="subtasks">Subtasks</ToggleGroupItem>
                  )}
                </ToggleGroup>
              </Field>
            )}
          </form.Field>

          <form.Subscribe selector={(s) => s.values.mode}>
            {(mode) => (
              <>
                {mode === "single" && (
                  <form.Field name="duration">
                    {(field) => (
                      <Field>
                        <FieldLabel>Duration</FieldLabel>
                        <DurationSelect
                          value={field.state.value}
                          onChange={field.handleChange}
                        />
                      </Field>
                    )}
                  </form.Field>
                )}

                {mode === "split" && (
                  <div className="grid grid-cols-2 gap-3">
                    <form.Field name="totalDuration">
                      {(field) => (
                        <Field>
                          <FieldLabel>Total duration</FieldLabel>
                          <DurationSelect
                            value={field.state.value}
                            onChange={field.handleChange}
                          />
                        </Field>
                      )}
                    </form.Field>
                    <form.Field name="count">
                      {(field) => (
                        <Field>
                          <FieldLabel htmlFor="sched-count">Blocks</FieldLabel>
                          <Input
                            id="sched-count"
                            type="number"
                            min={2}
                            max={12}
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            onBlur={field.handleBlur}
                          />
                        </Field>
                      )}
                    </form.Field>
                  </div>
                )}

                {mode === "subtasks" && (
                  <form.Field name="duration">
                    {(field) => (
                      <Field>
                        <FieldLabel>Each subtask</FieldLabel>
                        <DurationSelect
                          value={field.state.value}
                          onChange={field.handleChange}
                        />
                        <p className="text-xs text-muted-foreground">
                          {ordered.length} subtask{ordered.length === 1 ? "" : "s"} scheduled
                          back-to-back{task.sequential ? ", in order" : ""}.
                        </p>
                      </Field>
                    )}
                  </form.Field>
                )}
              </>
            )}
          </form.Subscribe>
        </FieldGroup>
        </ResponsiveDialogBody>

        <ResponsiveDialogFooter>
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <>
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button onClick={() => void form.handleSubmit()} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <Loader2 data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <CalendarPlus data-icon="inline-start" />
                  )}
                  Add to calendar
                </Button>
              </>
            )}
          </form.Subscribe>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function DurationSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {DURATIONS.map(([v, label]) => (
            <SelectItem key={v} value={v}>
              {label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
