"use client";

import { TZDate } from "@date-fns/tz";
import { useTranslations } from "next-intl";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TimeField } from "@/components/ui/time-field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** The two 1–4 scales (quality, tiredness) share one segmented layout. */
const SCALE_LEVELS = [1, 2, 3, 4] as const;

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
 * the backfill dialog. Quality and tiredness are twin 1..4 segmented controls
 * (number + word per level, tap the selected one again to clear) — four levels
 * fit a phone where the old nine-point sleepiness scale needed a select.
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
        <ToggleGroup
          id={`${idPrefix}-quality`}
          type="single"
          variant="outline"
          aria-label={t("fields.qualityAriaLabel")}
          className="flex-wrap justify-start"
          value={draft.quality !== null ? String(draft.quality) : ""}
          onValueChange={(v) =>
            onChange({ ...draft, quality: v === "" ? null : Number(v) })
          }
        >
          {SCALE_LEVELS.map((n) => (
            <ToggleGroupItem
              key={n}
              value={String(n)}
              className="min-h-11 px-3 tabular-nums pointer-fine:min-h-9"
              aria-label={t(`fields.qualityOptions.${n}`)}
            >
              {t(`fields.qualityOptions.${n}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FieldDescription>{t("fields.qualityDescription")}</FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-fatigue`}>{t("fields.fatigue")}</FieldLabel>
        <ToggleGroup
          id={`${idPrefix}-fatigue`}
          type="single"
          variant="outline"
          aria-label={t("fields.fatigueAriaLabel")}
          className="flex-wrap justify-start"
          value={draft.fatigue !== null ? String(draft.fatigue) : ""}
          onValueChange={(v) =>
            onChange({ ...draft, fatigue: v === "" ? null : Number(v) })
          }
        >
          {SCALE_LEVELS.map((n) => (
            <ToggleGroupItem
              key={n}
              value={String(n)}
              className="min-h-11 px-3 tabular-nums pointer-fine:min-h-9"
              aria-label={t(`fields.fatigueOptions.${n}`)}
            >
              {t(`fields.fatigueOptions.${n}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
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
