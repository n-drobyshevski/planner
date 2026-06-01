"use client";

import { useState } from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function parseIso(value: string): Date | undefined {
  if (!value) return undefined;
  const d = parse(value, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
}

/** Date picker showing dd/MM/yyyy; value/onChange use ISO "yyyy-MM-dd" ("" = empty). */
export function DatePicker({
  value,
  onChange,
  id,
  disabled,
  clearable = false,
  placeholder = "dd/mm/yyyy",
  "aria-label": ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  clearable?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseIso(value);
  const label =
    ariaLabel && selected
      ? `${ariaLabel}, ${format(selected, "dd/MM/yyyy")}`
      : ariaLabel;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={label}
          className={cn(
            "w-full justify-start font-normal tabular-nums",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon data-icon="inline-start" />
          {selected ? format(selected, "dd/MM/yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          weekStartsOn={1}
          autoFocus
          onSelect={(d) => {
            if (d) {
              onChange(format(d, "yyyy-MM-dd"));
              setOpen(false);
            }
          }}
        />
        {clearable && value && (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
