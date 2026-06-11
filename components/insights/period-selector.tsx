"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { msToDateInput, dateInputToMs } from "@/lib/datetime/local";
import type { PeriodPreset, PeriodState, ResolvedPeriod } from "@/lib/insights/period";

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "this-week", label: "This week" },
  { value: "last-week", label: "Last week" },
  { value: "this-month", label: "This month" },
  { value: "last-30d", label: "Last 30 days" },
  { value: "last-90d", label: "Last 90 days" },
  { value: "custom", label: "Custom range" },
];

/**
 * Preset dropdown plus, for the custom preset, a from/to date pair. Switching
 * to "Custom range" seeds the pickers with the currently visible range so the
 * jump never lands on an empty state.
 */
export function PeriodSelector({
  state,
  period,
  timeZone,
  onChange,
}: {
  state: PeriodState;
  period: ResolvedPeriod;
  timeZone: string;
  onChange: (next: PeriodState) => void;
}) {
  function changePreset(preset: PeriodPreset) {
    if (preset === "custom") {
      onChange({
        ...state,
        preset,
        customFrom: state.customFrom ?? period.window.start,
        customTo: state.customTo ?? period.window.end - 1, // exclusive → last day
      });
    } else {
      onChange({ ...state, preset });
    }
  }

  // A fragment, not a wrapper: the children are flex items of the toolbar
  // header itself, so on phones the custom from/to pair can wrap onto its own
  // full-width header row instead of overflowing the first one.
  return (
    <>
      <Select value={state.preset} onValueChange={(v) => changePreset(v as PeriodPreset)}>
        <SelectTrigger size="sm" aria-label="Period" className="w-[8.5rem] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {state.preset === "custom" ? (
        <div className="flex items-center gap-1 max-sm:order-last max-sm:basis-full">
          <DatePicker
            aria-label="From"
            value={state.customFrom != null ? msToDateInput(state.customFrom, timeZone) : ""}
            onChange={(v) =>
              v && onChange({ ...state, customFrom: dateInputToMs(v, timeZone) })
            }
            className="w-[7.25rem] px-2"
          />
          <span aria-hidden className="text-muted-foreground">
            –
          </span>
          <DatePicker
            aria-label="To"
            value={state.customTo != null ? msToDateInput(state.customTo, timeZone) : ""}
            onChange={(v) =>
              v && onChange({ ...state, customTo: dateInputToMs(v, timeZone) })
            }
            className="w-[7.25rem] px-2"
          />
        </div>
      ) : (
        <span className="hidden min-w-0 truncate text-sm text-muted-foreground sm:block md:hidden lg:block">
          {period.label.split(" · ")[1] ?? period.label}
        </span>
      )}
    </>
  );
}
