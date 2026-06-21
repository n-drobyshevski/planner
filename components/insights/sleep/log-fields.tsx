"use client";

import { TZDate } from "@date-fns/tz";
import { useTranslations } from "next-intl";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TimeField } from "@/components/ui/time-field";

import { RatingScale } from "./rating-scale";

/**
 * Quality is a 7-point scale (the psychometric sweet spot — reliability and
 * discrimination plateau around 7); tiredness restores the validated Karolinska
 * Sleepiness Scale (1–9). They no longer share one width, so each has its own
 * level array; the segmented {@link RatingScale} renders both.
 */
const QUALITY_LEVELS = [1, 2, 3, 4, 5, 6, 7] as const;
const FATIGUE_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** One night's form values; empty string / null = not provided. */
export interface SleepLogDraft {
  quality: number | null;
  fatigue: number | null;
  /** "HH:mm" or "" */
  bedtime: string;
  /** "HH:mm" or "" */
  wake: string;
  note: string;
}

export const EMPTY_DRAFT: SleepLogDraft = {
  quality: null,
  fatigue: null,
  bedtime: "",
  wake: "",
  note: "",
};

export function draftHasContent(d: SleepLogDraft): boolean {
  return (
    d.quality !== null ||
    d.fatigue !== null ||
    d.bedtime !== "" ||
    d.wake !== "" ||
    d.note.trim() !== ""
  );
}

/**
 * Wall-clock "HH:mm" on (an offset from) a wake-date token → instant in
 * `timeZone`. TZDate normalizes out-of-range days, and wall times stay put
 * across DST transitions.
 */
function instantOnDay(
  dateKey: string,
  time: string,
  timeZone: string,
  dayOffset: number,
): number {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return new TZDate(y, mo - 1, d + dayOffset, h, mi, 0, timeZone).getTime();
}

/**
 * Resolve the draft's times against the WAKE date: the wake time is on the
 * wake date itself; a bedtime from noon onward belongs to the evening before,
 * one before noon to the early hours of the wake date (you went to bed after
 * midnight).
 */
export function draftToInstants(
  draft: SleepLogDraft,
  wakeDateKey: string,
  timeZone: string,
): { bedtimeAt: number | null; wokeAt: number | null } {
  const wokeAt =
    draft.wake !== "" ? instantOnDay(wakeDateKey, draft.wake, timeZone, 0) : null;
  let bedtimeAt: number | null = null;
  if (draft.bedtime !== "") {
    const hour = Number(draft.bedtime.split(":")[0]);
    bedtimeAt = instantOnDay(wakeDateKey, draft.bedtime, timeZone, hour >= 12 ? -1 : 0);
  }
  return { bedtimeAt, wokeAt };
}

/**
 * Shared quality/fatigue/times/note fields for the morning check-in card and
 * the backfill dialog. Quality (1–7) and tiredness (Karolinska 1–9) are
 * segmented {@link RatingScale} bars — numbers in the segments, anchor words
 * beneath, and a live caption — so the wider scales still fit a phone; tap the
 * selected level again to clear.
 */
export function SleepLogFields({
  draft,
  onChange,
  idPrefix,
}: {
  draft: SleepLogDraft;
  onChange: (next: SleepLogDraft) => void;
  /** stable id namespace ("checkin" | "backfill") */
  idPrefix: string;
}) {
  const t = useTranslations("sleep");
  const tCommon = useTranslations("common");
  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-quality`}>{t("fields.quality")}</FieldLabel>
        <RatingScale
          id={`${idPrefix}-quality`}
          ariaLabel={t("fields.qualityAriaLabel")}
          levels={QUALITY_LEVELS}
          value={draft.quality}
          labelFor={(n) => t(`fields.qualityOptions.${n}`)}
          onValueChange={(quality) => onChange({ ...draft, quality })}
        />
        <FieldDescription>{t("fields.qualityDescription")}</FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-fatigue`}>{t("fields.fatigue")}</FieldLabel>
        <RatingScale
          id={`${idPrefix}-fatigue`}
          ariaLabel={t("fields.fatigueAriaLabel")}
          levels={FATIGUE_LEVELS}
          value={draft.fatigue}
          labelFor={(n) => t(`fields.fatigueOptions.${n}`)}
          onValueChange={(fatigue) => onChange({ ...draft, fatigue })}
        />
        <FieldDescription>{t("fields.fatigueDescription")}</FieldDescription>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-bedtime`}>{t("fields.wentToBed")}</FieldLabel>
          <TimeField
            id={`${idPrefix}-bedtime`}
            value={draft.bedtime}
            onChange={(v) => onChange({ ...draft, bedtime: v })}
            aria-label={t("fields.bedtimeAriaLabel")}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-wake`}>{t("fields.wokeUp")}</FieldLabel>
          <TimeField
            id={`${idPrefix}-wake`}
            value={draft.wake}
            onChange={(v) => onChange({ ...draft, wake: v })}
            aria-label={t("fields.wakeAriaLabel")}
          />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-note`}>{t("fields.note")}</FieldLabel>
        <Input
          id={`${idPrefix}-note`}
          value={draft.note}
          maxLength={200}
          placeholder={tCommon("optional")}
          onChange={(e) => onChange({ ...draft, note: e.target.value })}
        />
      </Field>
    </div>
  );
}
