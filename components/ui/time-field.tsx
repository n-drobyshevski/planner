"use client";

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

/**
 * Controlled 24-hour time field built on the platform `<input type="time">`.
 * value/onChange use "HH:mm" ("" = empty). The native control gives us the real
 * OS picker on mobile (iOS wheel, Android clock) and a segmented keyboard-
 * friendly field on desktop; the stored value is always 24-hour regardless of
 * the locale-driven display format.
 */
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
  return (
    <Input
      id={id}
      type="time"
      disabled={disabled}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("tabular-nums", className)}
    />
  );
}
