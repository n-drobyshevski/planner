"use client";

import { useMemo, useState } from "react";
import { NotebookPen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { msToTimeInput } from "@/lib/datetime/local";
import type { SleepLogInput } from "@/lib/supabase/mappers";
import type { DerivedNight } from "@/lib/sleep/derive";
import type { SleepLog } from "@/lib/types";
import {
  draftHasContent,
  draftToInstants,
  EMPTY_DRAFT,
  SleepLogFields,
  type SleepLogDraft,
} from "./log-fields";

/**
 * Manual backfill (or same-day edit): pick a past wake date, fill the same
 * fields as the morning check-in, save. The upsert's (member, date) conflict
 * key makes editing an already-logged night the same operation.
 */
export function LogNightDialog({
  todayKey,
  timeZone,
  nights,
  logs,
  onSave,
}: {
  todayKey: string;
  timeZone: string;
  /** derived nights of the visible period, for prefilling times */
  nights: DerivedNight[];
  logs: SleepLog[];
  onSave: (input: Omit<SleepLogInput, "workspaceId" | "memberId">) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayKey);
  const [draft, setDraft] = useState<SleepLogDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const nightByKey = useMemo(
    () => new Map(nights.map((n) => [n.dateKey, n])),
    [nights],
  );
  const logByKey = useMemo(() => new Map(logs.map((l) => [l.date, l])), [logs]);

  /** Seed the draft for a wake date: existing log wins, else derived times. */
  function seedFor(key: string): SleepLogDraft {
    const log = logByKey.get(key);
    if (log) {
      return {
        quality: log.quality,
        fatigue: log.fatigue,
        bedtime: log.bedtimeAt !== null ? msToTimeInput(log.bedtimeAt, timeZone) : "",
        wake: log.wokeAt !== null ? msToTimeInput(log.wokeAt, timeZone) : "",
        note: log.note ?? "",
      };
    }
    const night = nightByKey.get(key);
    return {
      ...EMPTY_DRAFT,
      bedtime: night?.start != null ? msToTimeInput(night.start, timeZone) : "",
      wake: night?.end != null ? msToTimeInput(night.end, timeZone) : "",
    };
  }

  function openDialog() {
    setDate(todayKey);
    setDraft(seedFor(todayKey));
    setOpen(true);
  }

  function pickDate(next: string) {
    if (next === "" || next > todayKey) return; // future mornings can't be logged
    setDate(next);
    setDraft(seedFor(next));
  }

  async function save() {
    setSaving(true);
    try {
      const { bedtimeAt, wokeAt } = draftToInstants(draft, date, timeZone);
      await onSave({
        date,
        bedtimeAt,
        wokeAt,
        quality: draft.quality,
        fatigue: draft.fatigue,
        note: draft.note.trim() === "" ? null : draft.note.trim(),
      });
      setOpen(false);
    } catch {
      /* the mutation hook already toasted; keep the dialog open to retry */
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog}>
        <NotebookPen data-icon="inline-start" />
        Log a night
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Log a night</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              Backfill or correct a morning — saving replaces anything already
              logged for that date.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogBody className="space-y-4">
            <Field>
              <FieldLabel htmlFor="backfill-date">Morning of</FieldLabel>
              <DatePicker
                id="backfill-date"
                value={date}
                onChange={pickDate}
                aria-label="Wake date"
              />
              <FieldDescription>
                The date you woke up. Future dates can&apos;t be logged.
              </FieldDescription>
            </Field>
            <SleepLogFields draft={draft} onChange={setDraft} idPrefix="backfill" />
          </ResponsiveDialogBody>
          <ResponsiveDialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void save()}
              disabled={saving || !draftHasContent(draft)}
            >
              {saving ? "Saving…" : "Save night"}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
