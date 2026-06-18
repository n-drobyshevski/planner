import { Input, Label } from "planner";

export function Default() {
  return (
    <div className="w-80 flex flex-col gap-2">
      <Label htmlFor="in-title">Event title</Label>
      <Input id="in-title" defaultValue="Dinner with Mara" />
    </div>
  );
}

export function Placeholder() {
  return (
    <div className="w-80 flex flex-col gap-2">
      <Label htmlFor="in-loc">Location</Label>
      <Input id="in-loc" placeholder="Where are you meeting?" />
    </div>
  );
}

export function Invalid() {
  return (
    <div className="w-80 flex flex-col gap-2">
      <Label htmlFor="in-end">End time</Label>
      <Input id="in-end" aria-invalid defaultValue="6:00 PM" />
    </div>
  );
}

export function Disabled() {
  return (
    <div className="w-80 flex flex-col gap-2">
      <Label htmlFor="in-cal">Calendar</Label>
      <Input id="in-cal" disabled defaultValue="Shared with Mara" />
    </div>
  );
}

export function Types() {
  return (
    <div className="w-80 flex flex-col gap-3">
      <Input type="date" defaultValue="2026-06-22" />
      <Input type="time" defaultValue="19:30" />
      <Input type="search" placeholder="Search events" />
    </div>
  );
}
