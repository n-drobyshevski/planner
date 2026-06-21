"use client";

import { useTranslations } from "next-intl";
import { Check, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENTS, accentIdForHex } from "@/lib/theme/appearance";

/**
 * The selectable colors for events/tasks. Derived from the appearance ACCENTS so
 * per-item colors stay on-brand. We store the default-palette hex (`value`) but
 * render the dot from `var(--swatch-<id>)`, so picks re-tint with the active
 * Catppuccin flavor — same as the resolved item colors (see toPaletteColor).
 */
export const SWATCHES: readonly { id: string; value: string; label: string }[] =
  ACCENTS.map((a) => ({ id: a.id, value: a.swatch, label: a.label }));

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
  const t = useTranslations("nav");
  const isDefault = !value;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-label={t("colorPicker.defaultAriaLabel")}
        aria-pressed={isDefault}
        title={t("colorPicker.default")}
        className={cn(
          "flex size-7 items-center justify-center rounded-full border bg-background text-muted-foreground",
          "transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isDefault && "ring-2 ring-foreground ring-offset-1 ring-offset-background",
        )}
      >
        <Ban className="size-4" />
      </button>
      {SWATCHES.map((s) => {
        const selected = accentIdForHex(value) === s.id;
        return (
          <button
            key={s.value}
            type="button"
            onClick={() => onSelect(s.value)}
            aria-label={s.label}
            aria-pressed={selected}
            title={s.label}
            style={{ backgroundColor: `var(--swatch-${s.id})` }}
            className={cn(
              "flex size-7 items-center justify-center rounded-full",
              "transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected && "ring-2 ring-foreground ring-offset-1 ring-offset-background",
            )}
          >
            {selected && (
              <Check
                className="size-4"
                style={{ color: `var(--swatch-ink-${s.id}, var(--swatch-ink))` }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
