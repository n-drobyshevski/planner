"use client";

import { useTranslations } from "next-intl";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FieldSet,
  FieldLegend,
  FieldDescription,
} from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PALETTES } from "@/lib/theme/appearance";
import type { Palette, ThemePreference } from "@/lib/types";

/**
 * The Palette and Theme controls, extracted so the Settings page and the Shift+T
 * appearance panel render the exact same vocabulary. Both are pure and props-
 * driven (no form dependency): the caller owns the value and applies the change.
 * In Settings they sit inside a `form.Field`; in the panel they bind straight to
 * `usePreferences`.
 */

// Theme options; the visible label resolves via t(`appearance.theme.${value}`).
const THEME_OPTIONS = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
] as const;

export function PaletteField({
  value,
  onChange,
  disabled,
}: {
  value: Palette;
  onChange: (value: Palette) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("settings");
  return (
    <FieldSet>
      <FieldLegend variant="label">{t("appearance.palette.legend")}</FieldLegend>
      <FieldDescription>{t("appearance.palette.description")}</FieldDescription>
      <div
        role="radiogroup"
        aria-label={t("appearance.palette.ariaLabel")}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
      >
        {PALETTES.map((p) => {
          const selected = value === p.id;
          // Keep Catppuccin flavor names (Latte/Frappé/…) as their own endonyms;
          // only the "Default" label and every description localize.
          const paletteLabel =
            p.id === "default" ? t("appearance.palette.labels.default") : p.label;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={paletteLabel}
              disabled={disabled}
              onClick={() => onChange(p.id)}
              className={cn(
                "flex flex-col gap-2 rounded-lg border-2 p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "border-primary"
                  : "border-border hover:border-foreground/30",
              )}
            >
              <span className="flex gap-1" aria-hidden>
                {p.swatches.map((c, i) => (
                  <span
                    key={i}
                    className="size-5 rounded-full ring-1 ring-foreground/10"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </span>
              <span className="flex items-center justify-between gap-1">
                <span className="text-sm font-medium text-foreground">
                  {paletteLabel}
                </span>
                {selected && (
                  <Check className="size-4 shrink-0 text-primary" aria-hidden />
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(`appearance.palette.descriptions.${p.id}`)}
              </span>
            </button>
          );
        })}
      </div>
    </FieldSet>
  );
}

export function ThemeField({
  value,
  onChange,
  disabled,
  locked = false,
  size = "default",
}: {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
  disabled?: boolean;
  /** A Catppuccin flavor owns light/dark — show the locked description. */
  locked?: boolean;
  /** "lg" renders a fuller, larger control (used by the Shift+T panel). */
  size?: "default" | "lg";
}) {
  const t = useTranslations("settings");
  const large = size === "lg";
  return (
    <FieldSet>
      <FieldLegend variant="label">{t("appearance.theme.legend")}</FieldLegend>
      <FieldDescription>
        {locked
          ? t("appearance.theme.descriptionLocked")
          : t("appearance.theme.description")}
      </FieldDescription>
      <ToggleGroup
        type="single"
        variant="segmented"
        size={large ? "lg" : "default"}
        value={value}
        onValueChange={(v) => v && onChange(v as ThemePreference)}
        disabled={disabled}
        aria-label={t("appearance.theme.ariaLabel")}
        className={cn(large && "w-full")}
      >
        {THEME_OPTIONS.map(({ value: optionValue, icon: Icon }) => {
          const label = t(`appearance.theme.${optionValue}`);
          return (
            <ToggleGroupItem
              key={optionValue}
              value={optionValue}
              aria-label={label}
              className={cn(large && "flex-1")}
            >
              <Icon data-icon="inline-start" />
              {label}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </FieldSet>
  );
}
