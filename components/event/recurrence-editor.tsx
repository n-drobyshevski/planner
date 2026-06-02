"use client";

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

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const UNIT: Record<Freq, string> = { DAILY: "day(s)", WEEKLY: "week(s)", MONTHLY: "month(s)" };

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
        <FieldLabel>Repeat</FieldLabel>
        <Select value={value?.freq ?? "none"} onValueChange={setFreq}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="none">Does not repeat</SelectItem>
              <SelectItem value="DAILY">Daily</SelectItem>
              <SelectItem value="WEEKLY">Weekly</SelectItem>
              <SelectItem value="MONTHLY">Monthly</SelectItem>
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
                    <FieldLabel>Every</FieldLabel>
                    <Input
                      type="number"
                      min={1}
                      value={value.interval}
                      onChange={(e) =>
                        onChange({ ...value, interval: Math.max(1, Number(e.target.value) || 1) })
                      }
                    />
                  </Field>
                  <span className="pb-2.5 text-sm text-muted-foreground">{UNIT[value.freq]}</span>
                </div>
              )}

              {(value.freq === "WEEKLY" || value.freq === "DAILY") && (
                <Field>
                  <FieldLabel>On days</FieldLabel>
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
                    {WEEKDAYS.map((d, i) => (
                      <ToggleGroupItem
                        key={d}
                        value={String(i)}
                        aria-label={d}
                        className={SELECTED_DAY}
                      >
                        {d}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>
              )}

              <Field>
                <FieldLabel>Ends</FieldLabel>
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
                        <SelectItem value="never">Never</SelectItem>
                        <SelectItem value="until">On date</SelectItem>
                        <SelectItem value="count">After…</SelectItem>
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
                      aria-label="Repeat until date"
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
