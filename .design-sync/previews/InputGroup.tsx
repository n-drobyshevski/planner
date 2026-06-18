import {
  InputGroup,
  InputGroupInput,
  InputGroupTextarea,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  Label,
} from "planner";
import { Search, MapPin, Clock, CornerDownLeft } from "lucide-react";

export function WithLeadingIcon() {
  return (
    <div className="w-80 flex flex-col gap-2">
      <Label htmlFor="ig-loc">Location</Label>
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <MapPin />
        </InputGroupAddon>
        <InputGroupInput id="ig-loc" defaultValue="Osteria, downtown" />
      </InputGroup>
    </div>
  );
}

export function WithSuffixText() {
  return (
    <div className="w-80 flex flex-col gap-2">
      <Label htmlFor="ig-dur">Duration</Label>
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <Clock />
        </InputGroupAddon>
        <InputGroupInput id="ig-dur" defaultValue="90" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>minutes</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

export function WithButton() {
  return (
    <div className="w-80 flex flex-col gap-2">
      <Label htmlFor="ig-search">Find an event</Label>
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <Search />
        </InputGroupAddon>
        <InputGroupInput id="ig-search" placeholder="Dinner with Mara" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton variant="default">Search</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

export function TextareaWithFooter() {
  return (
    <div className="w-80 flex flex-col gap-2">
      <Label htmlFor="ig-note">Quick note</Label>
      <InputGroup>
        <InputGroupTextarea
          id="ig-note"
          placeholder="Add a note for this event…"
        />
        <InputGroupAddon align="block-end">
          <InputGroupText className="ml-auto">
            <CornerDownLeft />
            Save
          </InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
