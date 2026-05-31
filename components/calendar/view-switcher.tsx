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
      <ToggleGroupItem value="month">Month</ToggleGroupItem>
      <ToggleGroupItem value="week">Week</ToggleGroupItem>
      <ToggleGroupItem value="day">Day</ToggleGroupItem>
    </ToggleGroup>
  );
}
