import { Label, Input, Checkbox } from "planner";

export function Default() {
  return (
    <div className="w-80 flex flex-col gap-2">
      <Label htmlFor="lb-title">Event title</Label>
      <Input id="lb-title" defaultValue="Dinner with Mara" />
    </div>
  );
}

export function WithCheckbox() {
  return (
    <div className="w-80 flex items-center gap-2.5">
      <Checkbox id="lb-remind" defaultChecked />
      <Label htmlFor="lb-remind">Remind us both</Label>
    </div>
  );
}

export function Disabled() {
  return (
    <div className="group w-80 flex items-center gap-2.5" data-disabled="true">
      <Checkbox id="lb-disabled" disabled />
      <Label htmlFor="lb-disabled">Notify by email</Label>
    </div>
  );
}
