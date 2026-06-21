"use client";

import { useTranslations } from "next-intl";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ATTRIBUTE_META,
  setAttribute,
  type ItemAttributes,
} from "@/lib/attributes/schema";

/**
 * Generic editor for the optimization-attribute bag, rendered entirely from
 * ATTRIBUTE_META — adding a key to the registry adds its control here for both
 * the event and task dialogs. All values are optional; re-tapping the selected
 * option clears it (Radix single ToggleGroup emits "" for that), and clearing
 * deletes the key rather than writing null. Edits go through setAttribute, so
 * unknown keys written by newer clients always survive a round-trip.
 */
export function AttributeFields({
  value,
  onChange,
  idPrefix,
}: {
  value: ItemAttributes;
  onChange: (next: ItemAttributes) => void;
  /** stable id namespace when both dialogs are mounted ("ev" | "task") */
  idPrefix: string;
}) {
  const t = useTranslations("nav");
  // Field/option copy lives in the shared `common` namespace (also used by the
  // day-detail attribute chips) — the ATTRIBUTE_META registry stays language-free.
  const ta = useTranslations("common");
  return (
    // Two-up on desktop so the four rating scales sit in two rows rather than a
    // tall stack; single column on mobile. The clear-hint spans both columns as
    // one helper line under the section header.
    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      <FieldDescription className="sm:col-span-2">
        {t("attributes.clearHint")}
      </FieldDescription>
      {ATTRIBUTE_META.map((meta) => {
        const current = value[meta.key];
        const fieldLabel = ta(`attributes.${meta.key}.label`);
        return (
          // The wider scales (4 options, e.g. Energy/Satisfaction) span both
          // columns so their options never wrap mid-row; the compact 2–3 option
          // scales pair up beside each other.
          <Field
            key={meta.key}
            className={meta.options.length >= 4 ? "sm:col-span-2" : undefined}
          >
            <FieldLabel htmlFor={`${idPrefix}-attr-${meta.key}`}>
              {fieldLabel}
            </FieldLabel>
            <ToggleGroup
              id={`${idPrefix}-attr-${meta.key}`}
              type="single"
              variant="outline"
              aria-label={fieldLabel}
              className="flex-wrap justify-start"
              value={current != null ? String(current) : ""}
              onValueChange={(v) =>
                onChange(
                  setAttribute(value, meta.key, v === "" ? undefined : meta.decode(v)),
                )
              }
            >
              {meta.options.map((opt) => {
                // Every scale renders number + word from the shared `common`
                // catalog (e.g. "3 Good"), which doubles as the option's
                // accessible name — meaning never rides on position alone.
                const optLabel = ta(`attributes.${meta.key}.options.${opt.value}`);
                return (
                  <ToggleGroupItem
                    key={opt.value}
                    value={opt.value}
                    // 44px touch targets on touch screens, existing desktop density.
                    className="min-h-11 px-3 tabular-nums sm:min-h-9"
                    aria-label={optLabel}
                  >
                    {optLabel}
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
            <FieldDescription>
              {ta(`attributes.${meta.key}.description`)}
            </FieldDescription>
          </Field>
        );
      })}
    </div>
  );
}
