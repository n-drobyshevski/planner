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
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
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
import { CalendarPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";
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
  ["15", "schedule.durations.15min"],
  ["30", "schedule.durations.30min"],
  ["45", "schedule.durations.45min"],
  ["60", "schedule.durations.1hour"],
  ["90", "schedule.durations.1andHalfHours"],
  ["120", "schedule.durations.2hours"],
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
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
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
          <ResponsiveDialogTitle>{t("schedule.title")}</ResponsiveDialogTitle>
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
                    <FieldLabel htmlFor="sched-date">{t("schedule.dateLabel")}</FieldLabel>
                    <DatePicker
                      id="sched-date"
                      value={field.state.value}
                      onChange={field.handleChange}
                      aria-label={t("schedule.dateLabel")}
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
                    <FieldLabel htmlFor="sched-time">{t("schedule.startLabel")}</FieldLabel>
                    <TimeField
                      id="sched-time"
                      value={field.state.value}
                      onChange={field.handleChange}
                      aria-label={t("schedule.startLabel")}
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
                <FieldLabel>{t("schedule.howLabel")}</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={field.state.value}
                  onValueChange={(v) => v && field.handleChange(v as Mode)}
                  className="justify-start"
                >
                  <ToggleGroupItem value="single">{t("schedule.oneBlock")}</ToggleGroupItem>
                  <ToggleGroupItem value="split">{t("schedule.split")}</ToggleGroupItem>
                  {hasSubtasks && (
                    <ToggleGroupItem value="subtasks">{t("schedule.subtasks")}</ToggleGroupItem>
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
                        <FieldLabel>{t("schedule.durationLabel")}</FieldLabel>
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
                          <FieldLabel>{t("schedule.totalDurationLabel")}</FieldLabel>
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
                          <FieldLabel htmlFor="sched-count">{t("schedule.blocksLabel")}</FieldLabel>
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
                        <FieldLabel>{t("schedule.eachSubtaskLabel")}</FieldLabel>
                        <DurationSelect
                          value={field.state.value}
                          onChange={field.handleChange}
                        />
                        <FieldDescription>
                          {task.sequential
                            ? t("schedule.subtasksHintInOrder", { count: ordered.length })
                            : t("schedule.subtasksHint", { count: ordered.length })}
                        </FieldDescription>
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
                  {tc("cancel")}
                </Button>
                <Button onClick={() => void form.handleSubmit()} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <CalendarPlus data-icon="inline-start" />
                  )}
                  {t("schedule.title")}
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
  const t = useTranslations("tasks");
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {DURATIONS.map(([v, labelKey]) => (
            <SelectItem key={v} value={v}>
              {t(labelKey)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
