"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Normalize loose 24-hour input to "HH:mm"; null if unparseable. */
export function normalizeTime(raw: string): string | null {
  const s = raw.trim();
  let h: number;
  let m: number;
  const colon = /^(\d{1,2}):(\d{1,2})$/.exec(s);
  const digits = /^(\d{3,4})$/.exec(s);
  const hourOnly = /^(\d{1,2})$/.exec(s);
  if (colon) {
    h = Number(colon[1]);
    m = Number(colon[2]);
  } else if (digits) {
    const d = digits[1].padStart(4, "0");
    h = Number(d.slice(0, 2));
    m = Number(d.slice(2));
  } else if (hourOnly) {
    h = Number(hourOnly[1]);
    m = 0;
  } else {
    return null;
  }
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Controlled 24-hour time field; value/onChange use "HH:mm". */
export function TimeField({
  value,
  onChange,
  id,
  disabled,
  "aria-label": ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
}) {
  // While editing, hold the raw draft; otherwise display the controlled value.
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? value;

  function commit() {
    const norm = normalizeTime(draft ?? value);
    if (norm && norm !== value) onChange(norm);
    setDraft(null);
  }

  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      placeholder="hh:mm"
      disabled={disabled}
      aria-label={ariaLabel}
      value={display}
      onFocus={() => setDraft(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn("tabular-nums", className)}
    />
  );
}
