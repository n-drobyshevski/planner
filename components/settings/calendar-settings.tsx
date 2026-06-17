"use client";

import { useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import { useTranslations } from "next-intl";
import { SettingsSection } from "@/components/settings/settings-section";
import {
  Field,
  FieldContent,
  FieldLabel,
  FieldSet,
  FieldLegend,
  FieldDescription,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePreferences } from "@/lib/hooks/use-preferences";
import type { ContextLabel } from "@/lib/types";

// Context-label variants; the visible label resolves via t(`calendarDisplay.contextLabel.${value}`).
const CONTEXT_LABEL_OPTIONS = ["bar", "side"] as const;

// Match the appearance segments: tie the active state to the accent so it stays
// legible in every theme/tone (default `bg-muted` is invisible when --muted == --card).
const SELECTED_SEGMENT =
  "data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary";

/**
 * How the calendar reads: which events show, how context blocks are labelled,
 * and whether success toasts appear. Instant apply, same as the rest of
 * /settings — each field's onChange listener writes straight through.
 */
export function CalendarSettings() {
  const t = useTranslations("settings");
  const {
    showInactiveInMonth,
    showSuccessToasts,
    contextLabel,
    setShowInactiveInMonth,
    setShowSuccessToasts,
    setContextLabel,
    isReady,
  } = usePreferences();
  const disabled = !isReady;

  const current = { showInactiveInMonth, contextLabel, showSuccessToasts };
  const form = useForm({ defaultValues: current });

  // Preferences load (and can change) outside the form — resync so the controls
  // never go stale. Identical echoes no-op right after a local change.
  useEffect(() => {
    form.reset(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactiveInMonth, contextLabel, showSuccessToasts]);

  return (
    <SettingsSection
      title={t("calendarDisplay.title")}
      description={t("calendarDisplay.description")}
    >
      <form.Field
        name="showInactiveInMonth"
        listeners={{ onChange: ({ value }) => setShowInactiveInMonth(value) }}
      >
        {(field) => (
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="show-inactive-month">
                {t("calendarDisplay.showInactive.label")}
              </FieldLabel>
              <FieldDescription>
                {t("calendarDisplay.showInactive.description")}
              </FieldDescription>
            </FieldContent>
            <Switch
              id="show-inactive-month"
              checked={field.state.value}
              onCheckedChange={field.handleChange}
              disabled={disabled}
            />
          </Field>
        )}
      </form.Field>

      {/* Context label variant (week/day grid) */}
      <FieldSet>
        <FieldLegend variant="label">
          {t("calendarDisplay.contextLabel.legend")}
        </FieldLegend>
        <FieldDescription>
          {t("calendarDisplay.contextLabel.description")}
        </FieldDescription>
        <form.Field
          name="contextLabel"
          listeners={{ onChange: ({ value }) => setContextLabel(value) }}
        >
          {(field) => (
            <ToggleGroup
              type="single"
              variant="outline"
              value={field.state.value}
              onValueChange={(v) => v && field.handleChange(v as ContextLabel)}
              disabled={disabled}
              aria-label={t("calendarDisplay.contextLabel.ariaLabel")}
            >
              {CONTEXT_LABEL_OPTIONS.map((value) => {
                const label = t(`calendarDisplay.contextLabel.${value}`);
                return (
                  <ToggleGroupItem
                    key={value}
                    value={value}
                    aria-label={label}
                    className={SELECTED_SEGMENT}
                  >
                    {label}
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          )}
        </form.Field>
      </FieldSet>

      {/* Success toasts (confirmation pop-ups) */}
      <form.Field
        name="showSuccessToasts"
        listeners={{ onChange: ({ value }) => setShowSuccessToasts(value) }}
      >
        {(field) => (
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="show-success-toasts">
                {t("calendarDisplay.successToasts.label")}
              </FieldLabel>
              <FieldDescription>
                {t("calendarDisplay.successToasts.description")}
              </FieldDescription>
            </FieldContent>
            <Switch
              id="show-success-toasts"
              checked={field.state.value}
              onCheckedChange={field.handleChange}
              disabled={disabled}
            />
          </Field>
        )}
      </form.Field>
    </SettingsSection>
  );
}
