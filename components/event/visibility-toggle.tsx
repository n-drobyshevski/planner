"use client";

import { Eye, Lock, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { EventVisibility } from "@/lib/events/sharing";

/**
 * The private / visible / shared control (see lib/events/sharing). Shared by
 * the event dialog and the .ics import review; callers hide it when a shared
 * context is chosen.
 */
export function VisibilityToggle({
  value,
  onChange,
  size,
  className,
  "aria-label": ariaLabel,
}: {
  value: EventVisibility;
  onChange: (value: EventVisibility) => void;
  size?: "default" | "sm";
  className?: string;
  "aria-label"?: string;
}) {
  const t = useTranslations("events");
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size={size}
      value={value}
      onValueChange={(v) => v && onChange(v as EventVisibility)}
      aria-label={ariaLabel}
      className={cn(
        "flex-wrap justify-start max-sm:[&_[data-slot=toggle-group-item]]:h-11",
        className,
      )}
    >
      <ToggleGroupItem value="private">
        <Lock data-icon="inline-start" />
        {t("dialog.visibilityPrivate")}
      </ToggleGroupItem>
      <ToggleGroupItem value="visible">
        <Eye data-icon="inline-start" />
        {t("dialog.visibilityVisible")}
      </ToggleGroupItem>
      <ToggleGroupItem value="shared">
        <Users data-icon="inline-start" />
        {t("dialog.visibilityShared")}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
