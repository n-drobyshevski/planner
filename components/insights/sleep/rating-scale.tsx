"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** Strip the leading "5 " number prefix from an option label, locale-safe. */
function wordOf(label: string): string {
  return label.replace(/^\d+\s*/, "");
}

/**
 * One segmented rating bar, shared by the quality (1–7) and fatigue
 * (Karolinska 1–9) check-in fields. Numbers only inside the segments so the
 * wider scales still fit a phone; the meaning is carried as text three ways so
 * it never relies on position alone (WCAG): anchor words under the ends (and the
 * midpoint on odd scales), the full per-level descriptor in each segment's
 * `aria-label`, and a live caption echoing the selected level. Re-selecting the
 * active level clears it (Radix single-toggle returns "").
 */
export function RatingScale({
  id,
  ariaLabel,
  levels,
  value,
  labelFor,
  onValueChange,
}: {
  id: string;
  ariaLabel: string;
  levels: readonly number[];
  value: number | null;
  /** full descriptor for a level, e.g. "1 Poor" / "5 Neither alert nor sleepy" */
  labelFor: (n: number) => string;
  onValueChange: (next: number | null) => void;
}) {
  const low = wordOf(labelFor(levels[0]));
  const high = wordOf(labelFor(levels[levels.length - 1]));
  const mid =
    levels.length % 2 === 1
      ? wordOf(labelFor(levels[(levels.length - 1) / 2]))
      : null;

  return (
    <div className="flex flex-col gap-1.5">
      <ToggleGroup
        id={id}
        type="single"
        variant="outline"
        spacing={0}
        aria-label={ariaLabel}
        className="w-full"
        value={value !== null ? String(value) : ""}
        onValueChange={(v) => onValueChange(v === "" ? null : Number(v))}
      >
        {levels.map((n) => (
          <ToggleGroupItem
            key={n}
            value={String(n)}
            aria-label={labelFor(n)}
            className="min-h-11 flex-1 basis-0 px-0 tabular-nums pointer-fine:min-h-9"
          >
            {n}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span>{low}</span>
        {mid ? <span className="hidden text-center sm:inline">{mid}</span> : null}
        <span className="text-right">{high}</span>
      </div>
      <p className="min-h-4 text-xs font-medium tabular-nums" aria-live="polite">
        {value !== null ? labelFor(value) : ""}
      </p>
    </div>
  );
}
