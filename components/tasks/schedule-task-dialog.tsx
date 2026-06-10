"use client";

import { useState } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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

type Mode = "single" | "split" | "subtasks";

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

  // The dialog is conditionally mounted by its openers (it remounts fresh per
  // open), so the seed is computed once in lazy initializers — fields render
  // filled on the first paint instead of flashing empty until an effect ran.
  const [seed] = useState(
    () => defaultStartMs ?? ceilToStep(Date.now() + 3_600_000, 30),
  );
  const [date, setDate] = useState(() => msToDateInput(seed, timeZone));
  const [time, setTime] = useState(() => msToTimeInput(seed, timeZone));
  const [mode, setMode] = useState<Mode>("single");
  const [duration, setDuration] = useState("60"); // single & per-subtask minutes
  const [totalDuration, setTotalDuration] = useState("120"); // split total minutes
  const [count, setCount] = useState("2");
  const [pending, setPending] = useState(false);

  const ordered = sortByPosition(subtasks);

  async function onSchedule() {
    const start = combineDateTime(date, time, timeZone);
    const tz = timeZone;
    setPending(true);
    let ok = false;
    if (mode === "subtasks" && hasSubtasks) {
      const per = Number(duration);
      const segs = backToBack(
        start,
        ordered.map(() => per),
      );
      ok = await mutations.scheduleMany(
        ordered.map((st, i) => ({ task: st, start: segs[i].start, end: segs[i].end, title: st.title })),
        tz,
      );
    } else if (mode === "split") {
      const n = Math.max(1, Math.min(12, Number(count) || 1));
      const segs = splitIntoBlocks(start, Number(totalDuration), n);
      ok = await mutations.schedule(
        task,
        segs.map((s, i) => ({ ...s, title: `${task.title} (${i + 1}/${n})` })),
        tz,
      );
    } else {
      ok = await mutations.schedule(
        task,
        [{ start, end: start + Number(duration) * 60_000 }],
        tz,
      );
    }
    setPending(false);
    if (ok) onOpenChange(false);
  }

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
            <Field>
              <FieldLabel htmlFor="sched-date">Date</FieldLabel>
              <DatePicker
                id="sched-date"
                value={date}
                onChange={setDate}
                aria-label="Date"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="sched-time">Start</FieldLabel>
              <TimeField
                id="sched-time"
                value={time}
                onChange={setTime}
                aria-label="Start"
              />
            </Field>
          </div>

          <Field>
            <FieldLabel>How</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              value={mode}
              onValueChange={(v) => v && setMode(v as Mode)}
              className="justify-start"
            >
              <ToggleGroupItem value="single">One block</ToggleGroupItem>
              <ToggleGroupItem value="split">Split</ToggleGroupItem>
              {hasSubtasks && (
                <ToggleGroupItem value="subtasks">Subtasks</ToggleGroupItem>
              )}
            </ToggleGroup>
          </Field>

          {mode === "single" && (
            <Field>
              <FieldLabel>Duration</FieldLabel>
              <DurationSelect value={duration} onChange={setDuration} />
            </Field>
          )}

          {mode === "split" && (
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Total duration</FieldLabel>
                <DurationSelect value={totalDuration} onChange={setTotalDuration} />
              </Field>
              <Field>
                <FieldLabel htmlFor="sched-count">Blocks</FieldLabel>
                <Input
                  id="sched-count"
                  type="number"
                  min={2}
                  max={12}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                />
              </Field>
            </div>
          )}

          {mode === "subtasks" && (
            <Field>
              <FieldLabel>Each subtask</FieldLabel>
              <DurationSelect value={duration} onChange={setDuration} />
              <p className="text-xs text-muted-foreground">
                {ordered.length} subtask{ordered.length === 1 ? "" : "s"} scheduled
                back-to-back{task.sequential ? ", in order" : ""}.
              </p>
            </Field>
          )}
        </FieldGroup>
        </ResponsiveDialogBody>

        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onSchedule} disabled={pending}>
            {pending ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <CalendarPlus data-icon="inline-start" />
            )}
            Add to calendar
          </Button>
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
