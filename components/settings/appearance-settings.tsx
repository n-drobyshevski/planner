"use client";

import { useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import { useTranslations } from "next-intl";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/components/settings/settings-section";
import {
  FieldSet,
  FieldLegend,
  FieldDescription,
} from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePreferences } from "@/lib/hooks/use-preferences";
import {
  ACCENTS,
  DEFAULT_PINK_BASE,
  PALETTES,
  TONES,
  paletteMode,
} from "@/lib/theme/appearance";
import { PinkBaseField } from "@/components/settings/pink-base-field";
import type { AppLocale, ThemePreference } from "@/lib/types";

// Endonyms — language names stay in their own language, never translated.
const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ru", label: "Русский" },
] as const;

// Theme options; the visible label resolves via t(`appearance.theme.${value}`).
const THEME_OPTIONS = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
] as const;

export function AppearanceSettings() {
  const t = useTranslations("settings");
  const {
    locale,
    themePreference,
    accent,
    tone,
    palette,
    pinkBase,
    setLocale,
    setThemePref,
    setAccent,
    setTone,
    setPalette,
    setPinkBase,
    isReady,
  } = usePreferences();

  // Controls stay disabled until the signed-in member resolves. `isReady` is
  // false on both the server and the first client render, so no hydration drift.
  const disabled = !isReady;
  // A Catppuccin flavor owns light/dark AND surfaces (paletteMode !== null), so it
  // locks the theme + tone controls; its accent picker stays live (it maps into
  // the flavor). The `pink` palette owns surfaces but stays light/dark-aware, so it
  // locks only tone — and swaps the accent picker for its own base-color control.
  const catppuccin = paletteMode(palette) !== null;
  const ownsSurfaces = palette !== "default";
  const isPink = palette === "pink";

  const current = { palette, theme: themePreference, accent, tone };

  // Instant apply: each field's onChange listener writes straight through the
  // preference setter, so a tap previews immediately — no Save step.
  const form = useForm({ defaultValues: current });

  // Preferences load (and can change) outside the form — resync so the
  // controls never go stale. Writes echo back identical values, so this
  // no-ops right after a local change.
  useEffect(() => {
    form.reset(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette, themePreference, accent, tone]);

  return (
    <SettingsSection
      title={t("appearance.title")}
      description={t("appearance.description")}
    >
      {/* Language — switching navigates to the same page under the new locale
          (and saves to your profile, so it follows you across devices). Not part
          of the form: the navigation remounts this page. */}
      <FieldSet>
        <FieldLegend variant="label">{t("appearance.language.legend")}</FieldLegend>
        <FieldDescription>{t("appearance.language.description")}</FieldDescription>
        <ToggleGroup
          type="single"
          variant="segmented"
          value={locale}
          onValueChange={(v) => v && setLocale(v as AppLocale)}
          disabled={disabled}
          aria-label={t("appearance.language.ariaLabel")}
        >
          {LANGUAGE_OPTIONS.map(({ value, label }) => (
            <ToggleGroupItem key={value} value={value} aria-label={label}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FieldSet>

      {/* Color palette */}
      <FieldSet>
        <FieldLegend variant="label">{t("appearance.palette.legend")}</FieldLegend>
        <FieldDescription>{t("appearance.palette.description")}</FieldDescription>
        <form.Field
          name="palette"
          listeners={{ onChange: ({ value }) => setPalette(value) }}
        >
          {(field) => (
            <div
              role="radiogroup"
              aria-label={t("appearance.palette.ariaLabel")}
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            >
              {PALETTES.map((p) => {
                const selected = field.state.value === p.id;
                // Keep Catppuccin flavor names (Latte/Frappé/…) as their own
                // endonyms; only the "Default" label and every description localize.
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
                    onClick={() => field.handleChange(p.id)}
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
          )}
        </form.Field>
      </FieldSet>

      {/* Theme */}
      <FieldSet>
        <FieldLegend variant="label">{t("appearance.theme.legend")}</FieldLegend>
        <FieldDescription>
          {catppuccin
            ? t("appearance.theme.descriptionLocked")
            : t("appearance.theme.description")}
        </FieldDescription>
        <form.Field
          name="theme"
          listeners={{ onChange: ({ value }) => setThemePref(value) }}
        >
          {(field) => (
            <ToggleGroup
              type="single"
              variant="segmented"
              value={field.state.value}
              onValueChange={(v) => v && field.handleChange(v as ThemePreference)}
              disabled={disabled || catppuccin}
              aria-label={t("appearance.theme.ariaLabel")}
            >
              {THEME_OPTIONS.map(({ value, icon: Icon }) => {
                const label = t(`appearance.theme.${value}`);
                return (
                  <ToggleGroupItem key={value} value={value} aria-label={label}>
                    <Icon data-icon="inline-start" />
                    {label}
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          )}
        </form.Field>
      </FieldSet>

      {/* Accent color — hidden under the `pink` palette, which owns its own
          accent via the base-color control below. */}
      {!isPink && (
        <FieldSet>
          <FieldLegend variant="label">{t("appearance.accent.legend")}</FieldLegend>
          <FieldDescription>
            {catppuccin
              ? t("appearance.accent.descriptionLocked")
              : t("appearance.accent.description")}
          </FieldDescription>
          <form.Field
            name="accent"
            listeners={{ onChange: ({ value }) => setAccent(value) }}
          >
            {(field) => (
              <div
                role="radiogroup"
                aria-label={t("appearance.accent.ariaLabel")}
                className="flex flex-wrap gap-3"
              >
                {ACCENTS.map((a) => {
                  const selected = field.state.value === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={a.label}
                      title={a.label}
                      disabled={disabled}
                      onClick={() => field.handleChange(a.id)}
                      className={cn(
                        "relative grid size-11 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-background transition-transform outline-none focus-visible:ring-ring active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
                        selected ? "ring-foreground" : "ring-transparent hover:ring-border",
                      )}
                      style={{ backgroundColor: `var(--swatch-${a.id})` }}
                    >
                      {selected && (
                        <Check
                          className="size-5 drop-shadow-sm"
                          style={{ color: `var(--swatch-ink-${a.id}, var(--swatch-ink))` }}
                          aria-hidden
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </form.Field>
        </FieldSet>
      )}

      {/* Base pink — the `pink` palette's configurable hue (presets + custom). */}
      {isPink && (
        <PinkBaseField
          value={pinkBase ?? DEFAULT_PINK_BASE}
          onChange={setPinkBase}
          disabled={disabled}
        />
      )}

      {/* Surface tone */}
      <FieldSet>
        <FieldLegend variant="label">{t("appearance.tone.legend")}</FieldLegend>
        <FieldDescription>
          {ownsSurfaces
            ? t("appearance.tone.descriptionLocked")
            : t("appearance.tone.description")}
        </FieldDescription>
        <form.Field
          name="tone"
          listeners={{ onChange: ({ value }) => setTone(value) }}
        >
          {(field) => (
            <ToggleGroup
              type="single"
              variant="segmented"
              value={field.state.value}
              onValueChange={(v) =>
                v && field.handleChange(v as (typeof TONES)[number]["id"])
              }
              disabled={disabled || ownsSurfaces}
              aria-label={t("appearance.tone.ariaLabel")}
            >
              {TONES.map((tone) => {
                const label = t(`appearance.tone.labels.${tone.id}`);
                return (
                  <ToggleGroupItem
                    key={tone.id}
                    value={tone.id}
                    aria-label={label}
                  >
                    <span
                      data-icon="inline-start"
                      className="size-3 rounded-full ring-1 ring-foreground/15"
                      style={{ backgroundColor: tone.swatch }}
                    />
                    {label}
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          )}
        </form.Field>
      </FieldSet>

      {/* Live preview — real controls on the live surface, so palette, accent,
          theme, and tone choices read on the same components they affect. */}
      <FieldSet>
        <FieldLegend variant="label">{t("preview.title")}</FieldLegend>
        <div className="space-y-3 rounded-xl border bg-background p-4">
          <p className="font-heading font-medium text-foreground">
            {t("preview.heading")}
          </p>
          <p className="text-sm text-muted-foreground">{t("preview.secondary")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">{t("preview.primaryAction")}</Button>
            <Button size="sm" variant="outline">
              {t("preview.outline")}
            </Button>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              {t("preview.accentChip")}
            </span>
          </div>
        </div>
      </FieldSet>
    </SettingsSection>
  );
}
