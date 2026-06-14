"use client";

import { useTranslations } from "next-intl";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldLabel } from "@/components/ui/field";
import { msToDateInput, dateInputToMs } from "@/lib/datetime/local";
import { useViewerTimeZone } from "@/lib/datetime/timezone-context";
import type { Freq, RecurrenceForm } from "@/lib/recurrence/rrule-build";

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const UNIT_KEY: Record<Freq, string> = {
  DAILY: "unitDay",
  WEEKLY: "unitWeek",
  MONTHLY: "unitMonth",
};

// Selected day = filled accent chip (follows the active accent/palette via
// --primary), overriding the toggle's default muted "on" surface.
const SELECTED_DAY =
  "data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90 data-[state=on]:hover:text-primary-foreground";

function weekdayOf(ms: number): number {
  return (new Date(ms).getDay() + 6) % 7; // Mon=0..Sun=6
}

export function RecurrenceEditor({
  value,
  onChange,
  startMs,
}: {
  value: RecurrenceForm | null;
  onChange: (v: RecurrenceForm | null) => void;
  startMs: number;
}) {
  const t = useTranslations("events");
  const timeZone = useViewerTimeZone();
  function setFreq(next: string) {
    if (next === "none") return onChange(null);
    const freq = next as Freq;
    onChange({
      freq,
      interval: value?.interval ?? 1,
      byWeekday:
        freq === "WEEKLY"
          ? value?.byWeekday?.length
            ? value.byWeekday
            : [weekdayOf(startMs)]
          : [],
      end: value?.end ?? { type: "never" },
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel>{t("recurrence.repeat")}</FieldLabel>
        <Select value={value?.freq ?? "none"} onValueChange={setFreq}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="none">{t("recurrence.doesNotRepeat")}</SelectItem>
              <SelectItem value="DAILY">{t("recurrence.daily")}</SelectItem>
              <SelectItem value="WEEKLY">{t("recurrence.weekly")}</SelectItem>
              <SelectItem value="MONTHLY">{t("recurrence.monthly")}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      {value &&
        (() => {
          // Daily-with-days is a weekly cadence, so we hide the interval input.
          // Same DAILY+days gate as buildRRule/summarizeRecurrence — except those
          // also guard interval > 1 for output; here we always show the input.
          const showInterval = !(value.freq === "DAILY" && value.byWeekday.length > 0);
          return (
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
              {showInterval && (
                <div className="flex items-end gap-2">
                  <Field className="w-24">
                    <FieldLabel>{t("recurrence.every")}</FieldLabel>
                    <Input
                      type="number"
                      min={1}
                      value={value.interval}
                      onChange={(e) =>
                        onChange({ ...value, interval: Math.max(1, Number(e.target.value) || 1) })
                      }
                    />
                  </Field>
                  <span className="pb-2.5 text-sm text-muted-foreground">
                    {t(`recurrence.${UNIT_KEY[value.freq]}`)}
                  </span>
                </div>
              )}

              {(value.freq === "WEEKLY" || value.freq === "DAILY") && (
                <Field>
                  <FieldLabel>{t("recurrence.onDays")}</FieldLabel>
                  <ToggleGroup
                    type="multiple"
                    variant="outline"
                    size="sm"
                    value={value.byWeekday.map(String)}
                    onValueChange={(vals) =>
                      onChange({ ...value, byWeekday: vals.map(Number).sort((a, b) => a - b) })
                    }
                    className="justify-start"
                  >
                    {WEEKDAY_KEYS.map((key, i) => {
                      const label = t(`recurrence.weekday.${key}`);
                      return (
                        <ToggleGroupItem
                          key={key}
                          value={String(i)}
                          aria-label={label}
                          className={SELECTED_DAY}
                        >
                          {label}
                        </ToggleGroupItem>
                      );
                    })}
                  </ToggleGroup>
                </Field>
              )}

              <Field>
                <FieldLabel>{t("recurrence.ends")}</FieldLabel>
                <div className="flex items-center gap-2">
                  <Select
                    value={value.end.type}
                    onValueChange={(t) =>
                      onChange({
                        ...value,
                        end:
                          t === "until"
                            ? { type: "until", dateMs: startMs + 30 * 86_400_000 }
                            : t === "count"
                              ? { type: "count", count: 10 }
                              : { type: "never" },
                      })
                    }
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="never">{t("recurrence.endsNever")}</SelectItem>
                        <SelectItem value="until">{t("recurrence.endsUntil")}</SelectItem>
                        <SelectItem value="count">{t("recurrence.endsCount")}</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>

                  {value.end.type === "until" && (
                    <DatePicker
                      value={msToDateInput(value.end.dateMs, timeZone)}
                      onChange={(v) =>
                        onChange({
                          ...value,
                          end: { type: "until", dateMs: dateInputToMs(v, timeZone) },
                        })
                      }
                      aria-label={t("recurrence.repeatUntilDate")}
                      className="w-40"
                    />
                  )}
                  {value.end.type === "count" && (
                    <Input
                      type="number"
                      min={1}
                      value={value.end.count}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          end: { type: "count", count: Math.max(1, Number(e.target.value) || 1) },
                        })
                      }
                      className="w-24"
                    />
                  )}
                </div>
              </Field>
            </div>
          );
        })()}
    </div>
  );
}
