"use client";

import { useTranslations } from "next-intl";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { CalendarView } from "@/lib/types";

export function ViewSwitcher({
  view,
  onViewChange,
}: {
  view: CalendarView;
  onViewChange: (v: CalendarView) => void;
}) {
  const t = useTranslations("calendar");
  return (
    <ToggleGroup
      type="single"
      value={view}
      onValueChange={(v) => {
        if (v) onViewChange(v as CalendarView);
      }}
      variant="segmented"
      size="sm"
    >
      <ToggleGroupItem value="agenda">{t("views.agenda")}</ToggleGroupItem>
      <ToggleGroupItem value="day">{t("views.day")}</ToggleGroupItem>
      <ToggleGroupItem value="3day">{t("views.threeDay")}</ToggleGroupItem>
      <ToggleGroupItem value="week">{t("views.week")}</ToggleGroupItem>
      <ToggleGroupItem value="month">{t("views.month")}</ToggleGroupItem>
    </ToggleGroup>
  );
}
