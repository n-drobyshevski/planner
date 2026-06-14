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
    <div className="flex flex-col gap-4">
      <FieldDescription>
        {t("attributes.clearHint")}
      </FieldDescription>
      {ATTRIBUTE_META.map((meta) => {
        const current = value[meta.key];
        const fieldLabel = ta(`attributes.${meta.key}.label`);
        return (
          <Field key={meta.key}>
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
                // Satisfaction options are bare numbers (1–5): keep them as-is and
                // use the existing "Satisfaction N of 5" aria. The rest localize.
                const optLabel =
                  meta.key === "satisfaction"
                    ? opt.label
                    : ta(`attributes.${meta.key}.options.${opt.value}`);
                return (
                  <ToggleGroupItem
                    key={opt.value}
                    value={opt.value}
                    // 44px touch targets on touch screens, existing desktop density.
                    className="min-h-11 px-3 tabular-nums sm:min-h-9"
                    aria-label={
                      meta.key === "satisfaction"
                        ? t("attributes.satisfactionAriaLabel", { label: opt.label })
                        : optLabel
                    }
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
