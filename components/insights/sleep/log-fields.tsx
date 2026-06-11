"use client";

import { TZDate } from "@date-fns/tz";

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

/** Simplified Karolinska Sleepiness Scale labels for the fatigue select. */
export const KSS_LABELS: Record<number, string> = {
  1: "Extremely alert",
  2: "Very alert",
  3: "Alert",
  4: "Rather alert",
  5: "Neither alert nor sleepy",
  6: "Some signs of sleepiness",
  7: "Sleepy, staying awake is easy",
  8: "Sleepy, staying awake takes effort",
  9: "Very sleepy, fighting sleep",
};

/** The nine KSS options chunked into three scan-friendly bands. */
const KSS_BANDS: { label: string; values: number[] }[] = [
  { label: "Alert", values: [1, 2, 3] },
  { label: "In between", values: [4, 5, 6] },
  { label: "Sleepy", values: [7, 8, 9] },
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
  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-quality`}>Sleep quality</FieldLabel>
        <ToggleGroup
          id={`${idPrefix}-quality`}
          type="single"
          variant="outline"
          aria-label="Sleep quality"
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
              aria-label={`Quality ${n} of 5`}
            >
              {n}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FieldDescription>1 = poor, 5 = great — tap again to clear.</FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-fatigue`}>How awake do you feel?</FieldLabel>
        <Select
          value={draft.fatigue !== null ? String(draft.fatigue) : ""}
          onValueChange={(v) => onChange({ ...draft, fatigue: Number(v) })}
        >
          <SelectTrigger id={`${idPrefix}-fatigue`} className="w-full">
            <SelectValue placeholder="Optional" />
          </SelectTrigger>
          {/* popper: nine tall items must drop below the trigger, not blanket
              the form they belong to (one-handed mobile check-in) */}
          <SelectContent position="popper">
            {KSS_BANDS.map((band) => (
              <SelectGroup key={band.label}>
                <SelectLabel>{band.label}</SelectLabel>
                {band.values.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    <span className="tabular-nums">{n}</span> — {KSS_LABELS[n]}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-bedtime`}>Went to bed</FieldLabel>
          <TimeField
            id={`${idPrefix}-bedtime`}
            value={draft.bedtime}
            onChange={(v) => onChange({ ...draft, bedtime: v })}
            aria-label="Bedtime"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-wake`}>Woke up</FieldLabel>
          <TimeField
            id={`${idPrefix}-wake`}
            value={draft.wake}
            onChange={(v) => onChange({ ...draft, wake: v })}
            aria-label="Wake time"
          />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-note`}>Note</FieldLabel>
        <Input
          id={`${idPrefix}-note`}
          value={draft.note}
          maxLength={200}
          placeholder="Optional"
          onChange={(e) => onChange({ ...draft, note: e.target.value })}
        />
      </Field>
    </div>
  );
}
