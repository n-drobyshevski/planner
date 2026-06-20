"use client";

import { useTranslations } from "next-intl";
import { Check, Pipette } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  FieldSet,
  FieldLegend,
  FieldDescription,
} from "@/components/ui/field";
import {
  DEFAULT_PINK_BASE,
  PINK_PRESETS,
  normalizePinkBase,
} from "@/lib/theme/appearance";

/**
 * The `pink` palette's configurable base hue: a row of preset quick-picks plus a
 * free custom color (native picker swatch + hex field). The whole palette derives
 * from this one hue in OKLCH (app/globals.css), so a change re-tints the UI live.
 * `value` is the effective hex (the stored base, or the default pink); `null` is
 * never passed down — the parent resolves it. Presentational: the parent owns
 * persistence via `onChange`.
 */
export function PinkBaseField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("settings");
  const lower = value.toLowerCase();
  const isPreset = PINK_PRESETS.some((p) => p.value.toLowerCase() === lower);

  // The hex field is uncontrolled (keyed on `value`, so it remounts with the new
  // base whenever a preset/picker/commit changes it). Typing a partial value
  // (e.g. "#ec4") doesn't fight a controlled value; we commit only on blur/Enter,
  // when it parses to a full hex — reverting the field to the live value on junk.
  const commitHex = (el: HTMLInputElement) => {
    const raw = el.value.trim();
    const next = normalizePinkBase(raw.startsWith("#") ? raw : `#${raw}`);
    if (next) onChange(next);
    else el.value = value; // revert junk to the live value
  };

  return (
    <FieldSet>
      <FieldLegend variant="label">{t("appearance.pinkBase.legend")}</FieldLegend>
      <FieldDescription>{t("appearance.pinkBase.description")}</FieldDescription>

      <div
        role="radiogroup"
        aria-label={t("appearance.pinkBase.ariaLabel")}
        className="flex flex-wrap items-center gap-3"
      >
        {PINK_PRESETS.map((p) => {
          const selected = p.value.toLowerCase() === lower;
          const label = t(`appearance.pinkBase.presets.${p.id}`);
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={label}
              title={label}
              disabled={disabled}
              onClick={() => onChange(p.value)}
              className={cn(
                "relative grid size-11 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-background transition-transform outline-none focus-visible:ring-ring active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
                selected ? "ring-foreground" : "ring-transparent hover:ring-border",
              )}
              style={{ backgroundColor: p.value }}
            >
              {selected && <Check className="size-5 text-white drop-shadow-sm" aria-hidden />}
            </button>
          );
        })}

        {/* Custom color — a native picker behind a swatch; ringed when a non-preset
            hue is active so "custom" reads as selected. */}
        <label
          title={t("appearance.pinkBase.custom")}
          className={cn(
            "relative grid size-11 cursor-pointer place-items-center rounded-full ring-2 ring-offset-2 ring-offset-background transition-transform outline-none focus-within:ring-ring active:scale-95",
            !isPreset ? "ring-foreground" : "ring-border hover:ring-foreground/40",
            disabled && "pointer-events-none opacity-50",
          )}
          style={{ backgroundColor: isPreset ? "var(--background)" : value }}
        >
          <Pipette
            className={cn("size-4", !isPreset ? "text-white drop-shadow-sm" : "text-muted-foreground")}
            aria-hidden
          />
          <span className="sr-only">{t("appearance.pinkBase.custom")}</span>
          <input
            type="color"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={t("appearance.pinkBase.custom")}
          />
        </label>

        {/* Precise hex entry. */}
        <Input
          key={value}
          defaultValue={value}
          disabled={disabled}
          inputMode="text"
          spellCheck={false}
          aria-label={t("appearance.pinkBase.hexLabel")}
          onBlur={(e) => commitHex(e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitHex(e.currentTarget);
          }}
          className="w-24 font-mono uppercase tabular-nums"
        />
      </div>
    </FieldSet>
  );
}

export { DEFAULT_PINK_BASE };
