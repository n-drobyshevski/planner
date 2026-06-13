"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { CalendarView } from "@/lib/types";

export function ViewSwitcher({
  view,
  onViewChange,
}: {
  view: CalendarView;
  onViewChange: (v: CalendarView) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={view}
      onValueChange={(v) => {
        if (v) onViewChange(v as CalendarView);
      }}
      variant="outline"
      size="sm"
    >
      <ToggleGroupItem value="agenda">Agenda</ToggleGroupItem>
      <ToggleGroupItem value="day">Day</ToggleGroupItem>
      <ToggleGroupItem value="3day">3 Day</ToggleGroupItem>
      <ToggleGroupItem value="week">Week</ToggleGroupItem>
      <ToggleGroupItem value="month">Month</ToggleGroupItem>
    </ToggleGroup>
  );
}
