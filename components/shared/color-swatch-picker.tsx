"use client";

import { Check, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENTS } from "@/lib/theme/appearance";

/**
 * The selectable colors for events/tasks. Derived from the appearance ACCENTS so
 * per-item colors stay on-brand and (like the resolver fallbacks) read as
 * WCAG-AA on the white text used by event blocks.
 */
export const SWATCHES: readonly { value: string; label: string }[] = ACCENTS.map(
  (a) => ({ value: a.swatch, label: a.label }),
);

/**
 * A small grid of color swatches plus a "Default" chip that clears the override
 * (passing `null`). Presentational: the parent owns the value and persistence.
 * Reused by the desktop context-menu submenu and the mobile action sheet.
 */
export function ColorSwatchPicker({
  value,
  onSelect,
  className,
}: {
  /** current own color (hex), or null when using the derived default */
  value: string | null;
  onSelect: (color: string | null) => void;
  className?: string;
}) {
  const isDefault = !value;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-label="Default color"
        aria-pressed={isDefault}
        title="Default"
        className={cn(
          "flex size-7 items-center justify-center rounded-full border bg-background text-muted-foreground",
          "transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isDefault && "ring-2 ring-foreground ring-offset-1 ring-offset-background",
        )}
      >
        <Ban className="size-4" />
      </button>
      {SWATCHES.map((s) => {
        const selected = value?.toLowerCase() === s.value.toLowerCase();
        return (
          <button
            key={s.value}
            type="button"
            onClick={() => onSelect(s.value)}
            aria-label={s.label}
            aria-pressed={selected}
            title={s.label}
            style={{ backgroundColor: s.value }}
            className={cn(
              "flex size-7 items-center justify-center rounded-full text-white",
              "transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected && "ring-2 ring-foreground ring-offset-1 ring-offset-background",
            )}
          >
            {selected && <Check className="size-4" />}
          </button>
        );
      })}
    </div>
  );
}
