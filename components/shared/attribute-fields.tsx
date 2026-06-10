"use client";

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
  return (
    <div className="flex flex-col gap-4">
      <FieldDescription>
        All optional — tap a selected option again to clear it.
      </FieldDescription>
      {ATTRIBUTE_META.map((meta) => {
        const current = value[meta.key];
        return (
          <Field key={meta.key}>
            <FieldLabel htmlFor={`${idPrefix}-attr-${meta.key}`}>
              {meta.label}
            </FieldLabel>
            <ToggleGroup
              id={`${idPrefix}-attr-${meta.key}`}
              type="single"
              variant="outline"
              aria-label={meta.label}
              className="flex-wrap justify-start"
              value={current != null ? String(current) : ""}
              onValueChange={(v) =>
                onChange(
                  setAttribute(value, meta.key, v === "" ? undefined : meta.decode(v)),
                )
              }
            >
              {meta.options.map((opt) => (
                <ToggleGroupItem
                  key={opt.value}
                  value={opt.value}
                  // 44px touch targets on touch screens, existing desktop density.
                  className="min-h-11 px-3 tabular-nums sm:min-h-9"
                  aria-label={
                    meta.key === "satisfaction"
                      ? `Satisfaction ${opt.label} of 5`
                      : opt.label
                  }
                >
                  {opt.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription>{meta.description}</FieldDescription>
          </Field>
        );
      })}
    </div>
  );
}
