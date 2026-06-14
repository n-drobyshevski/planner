"use client";

import { TZDate } from "@date-fns/tz";
import { useTranslations } from "next-intl";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimeField } from "@/components/ui/time-field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * The nine Karolinska Sleepiness Scale options chunked into three scan-friendly
 * bands. Labels (band + per-value descriptor) are resolved at render time via
 * the "sleep" namespace ("kssBand.*", "kss.1".."kss.9"); the numeric values are
 * the scale and never change.
 */
const KSS_BANDS: { labelKey: string; values: number[] }[] = [
  { labelKey: "kssBand.alert", values: [1, 2, 3] },
  { labelKey: "kssBand.inBetween", values: [4, 5, 6] },
  { labelKey: "kssBand.sleepy", values: [7, 8, 9] },
];

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
 * the backfill dialog. Quality is a 1..5 segmented control (tap again to
 * clear); fatigue is a select with KSS labels — nine 44px toggle items don't
 * fit a phone, and the labels carry the scale's meaning.
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
          {[1, 2, 3, 4, 5].map((n) => (
            <ToggleGroupItem
              key={n}
              value={String(n)}
              className="min-h-11 px-3 tabular-nums pointer-fine:min-h-9"
              aria-label={t("fields.qualityItemAriaLabel", { n })}
            >
              {n}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FieldDescription>{t("fields.qualityDescription")}</FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-fatigue`}>{t("fields.fatigue")}</FieldLabel>
        <Select
          value={draft.fatigue !== null ? String(draft.fatigue) : ""}
          onValueChange={(v) => onChange({ ...draft, fatigue: Number(v) })}
        >
          <SelectTrigger id={`${idPrefix}-fatigue`} className="w-full">
            <SelectValue placeholder={tCommon("optional")} />
          </SelectTrigger>
          {/* popper: nine tall items must drop below the trigger, not blanket
              the form they belong to (one-handed mobile check-in) */}
          <SelectContent position="popper">
            {KSS_BANDS.map((band) => (
              <SelectGroup key={band.labelKey}>
                <SelectLabel>{t(band.labelKey)}</SelectLabel>
                {band.values.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    <span className="tabular-nums">{n}</span> — {t(`kss.${n}`)}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
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
