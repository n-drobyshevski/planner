import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
  Button,
  Label,
  Switch,
} from "planner";
import { SlidersHorizontal } from "lucide-react";

export function FiltersPopover() {
  return (
    <Popover open>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal className="size-4" /> Filters
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>Show on calendar</PopoverTitle>
          <PopoverDescription>Pick which events appear.</PopoverDescription>
        </PopoverHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="shared">Shared events</Label>
            <Switch id="shared" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="private">My private events</Label>
            <Switch id="private" defaultChecked />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
