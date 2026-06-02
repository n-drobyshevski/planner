"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toPaletteColor } from "@/lib/theme/appearance";
import { ColorSwatchPicker, SWATCHES } from "./color-swatch-picker";

/**
 * Compact, select-styled color control for forms: a trigger showing the current
 * color dot + label that opens the swatch grid in a popover. `null` = "Default"
 * (the color is derived from the item's category/owner). Presentational — the
 * parent owns the value and persistence. Pairs with the inline ColorSwatchPicker
 * used by the right-click menu / mobile sheet (same swatches, same null = default).
 */
export function ColorField({
  value,
  onChange,
  id,
  disabled,
  className,
}: {
  /** current own color (hex), or null when using the derived default */
  value: string | null;
  onChange: (color: string | null) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const swatch = value
    ? SWATCHES.find((s) => s.value.toLowerCase() === value.toLowerCase())
    : undefined;
  const label = swatch?.label ?? (value ? "Custom" : "Default");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={`Color: ${label}`}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn(
                "size-4 shrink-0 rounded-full",
                !value && "border bg-background",
              )}
              style={value ? { backgroundColor: toPaletteColor(value) } : undefined}
            />
            {label}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <ColorSwatchPicker
          value={value}
          onSelect={(c) => {
            onChange(c);
            setOpen(false);
          }}
          className="max-w-44"
        />
      </PopoverContent>
    </Popover>
  );
}
