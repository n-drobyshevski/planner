"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "@tanstack/react-form";
import { NotebookPen, Trash2 } from "lucide-react";

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
import { useNotify } from "@/lib/hooks/use-notify";
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
  onDelete,
}: {
  todayKey: string;
  timeZone: string;
  /** derived nights of the visible period, for prefilling times */
  nights: DerivedNight[];
  logs: SleepLog[];
  onSave: (input: Omit<SleepLogInput, "workspaceId" | "memberId">) => Promise<void>;
  /** delete the log for a wake date (only offered when one exists) */
  onDelete: (date: string) => Promise<void>;
}) {
  const t = useTranslations("sleep");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const notify = useNotify();

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

  const form = useForm({
    defaultValues: { date: todayKey, draft: EMPTY_DRAFT },
    onSubmit: async ({ value }) => {
      try {
        const { bedtimeAt, wokeAt } = draftToInstants(value.draft, value.date, timeZone);
        await onSave({
          date: value.date,
          bedtimeAt,
          wokeAt,
          quality: value.draft.quality,
          fatigue: value.draft.fatigue,
          note: value.draft.note.trim() === "" ? null : value.draft.note.trim(),
        });
        notify.success(t("logNight.savedToast"));
        setOpen(false);
      } catch {
        /* the mutation hook already toasted; keep the dialog open to retry */
      }
    },
  });

  function openDialog() {
    form.reset({ date: todayKey, draft: seedFor(todayKey) });
    setOpen(true);
  }

  function pickDate(next: string) {
    if (next === "" || next > todayKey) return; // future mornings can't be logged
    form.setFieldValue("date", next);
    form.setFieldValue("draft", seedFor(next));
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await onDelete(form.state.values.date);
      notify.success(t("logNight.deletedToast"));
      setConfirmingDelete(false);
      setOpen(false);
    } catch {
      /* the mutation hook already toasted; keep the dialog open */
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog}>
        <NotebookPen data-icon="inline-start" />
        {t("logNight.trigger")}
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("logNight.title")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t("logNight.description")}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogBody className="space-y-4">
            <form.Field name="date">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="backfill-date">{t("logNight.morningOf")}</FieldLabel>
                  <DatePicker
                    id="backfill-date"
                    value={field.state.value}
                    onChange={pickDate}
                    maxDate={todayKey}
                    aria-label={t("logNight.wakeDateAriaLabel")}
                  />
                  <FieldDescription>
                    {t("logNight.morningOfDescription")}
                  </FieldDescription>
                </Field>
              )}
            </form.Field>
            <form.Field name="draft">
              {(field) => (
                <SleepLogFields
                  draft={field.state.value}
                  onChange={field.handleChange}
                  idPrefix="backfill"
                />
              )}
            </form.Field>
          </ResponsiveDialogBody>
          <ResponsiveDialogFooter>
            <form.Subscribe
              selector={(s) => [s.isSubmitting, s.values.date, s.values.draft] as const}
            >
              {([saving, date, draft]) => (
                <>
                  {/* The button text swaps aren't announced; this region is. */}
                  <span aria-live="polite" className="sr-only">
                    {saving ? t("logNight.savingSr") : deleting ? t("logNight.deletingSr") : ""}
                  </span>
                  {logByKey.has(date) && (
                    <Button
                      variant="ghost"
                      className="text-destructive hover:text-destructive sm:mr-auto"
                      onClick={() => setConfirmingDelete(true)}
                      disabled={deleting}
                    >
                      <Trash2 data-icon="inline-start" />
                      {t("logNight.deleteThisNight")}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    {tCommon("cancel")}
                  </Button>
                  <Button
                    onClick={() => void form.handleSubmit()}
                    disabled={saving || !draftHasContent(draft)}
                  >
                    {saving ? t("logNight.saving") : t("logNight.save")}
                  </Button>
                </>
              )}
            </form.Subscribe>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("logNight.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              <form.Subscribe selector={(s) => s.values.date}>
                {(date) => <>{t("logNight.confirmBody", { date })}</>}
              </form.Subscribe>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t("logNight.deleting") : t("logNight.deleteLog")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
