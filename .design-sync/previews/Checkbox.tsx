import { Checkbox, Label } from "planner";

export function Unchecked() {
  return (
    <div className="w-80 flex items-center gap-2.5">
      <Checkbox id="cb-off" />
      <Label htmlFor="cb-off">Add to shared calendar</Label>
    </div>
  );
}

export function Checked() {
  return (
    <div className="w-80 flex items-center gap-2.5">
      <Checkbox id="cb-on" defaultChecked />
      <Label htmlFor="cb-on">Remind us both</Label>
    </div>
  );
}

export function TaskList() {
  return (
    <div className="w-80 flex flex-col gap-3">
      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
        <Checkbox defaultChecked />
        <span className="text-muted-foreground line-through">Reserve a table</span>
      </label>
      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
        <Checkbox />
        <span>Pick up flowers</span>
      </label>
      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
        <Checkbox />
        <span>Confirm with Mara</span>
      </label>
    </div>
  );
}

export function Invalid() {
  return (
    <div className="w-80 flex items-center gap-2.5">
      <Checkbox id="cb-invalid" aria-invalid />
      <Label htmlFor="cb-invalid">Accept the shared schedule</Label>
    </div>
  );
}

export function Disabled() {
  return (
    <div className="w-80 flex items-center gap-2.5">
      <Checkbox id="cb-disabled" disabled defaultChecked />
      <Label htmlFor="cb-disabled" className="opacity-50">
        Synced from Mara's calendar
      </Label>
    </div>
  );
}
