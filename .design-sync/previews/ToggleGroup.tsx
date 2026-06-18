import { ToggleGroup, ToggleGroupItem } from "planner";
import { CalendarDays, CalendarRange, Calendar } from "lucide-react";

export function CalendarView() {
  return (
    <ToggleGroup type="single" defaultValue="week" variant="outline">
      <ToggleGroupItem value="day" aria-label="Day view">
        <Calendar data-icon="inline-start" /> Day
      </ToggleGroupItem>
      <ToggleGroupItem value="week" aria-label="Week view">
        <CalendarRange data-icon="inline-start" /> Week
      </ToggleGroupItem>
      <ToggleGroupItem value="month" aria-label="Month view">
        <CalendarDays data-icon="inline-start" /> Month
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function Segmented() {
  return (
    <ToggleGroup
      type="single"
      defaultValue="both"
      variant="outline"
      spacing={0}
    >
      <ToggleGroupItem value="mara">Mara</ToggleGroupItem>
      <ToggleGroupItem value="both">Both</ToggleGroupItem>
      <ToggleGroupItem value="sam">Sam</ToggleGroupItem>
    </ToggleGroup>
  );
}

export function Multiple() {
  return (
    <ToggleGroup type="multiple" defaultValue={["work"]}>
      <ToggleGroupItem value="work">Work</ToggleGroupItem>
      <ToggleGroupItem value="home">Home</ToggleGroupItem>
      <ToggleGroupItem value="travel">Travel</ToggleGroupItem>
    </ToggleGroup>
  );
}
