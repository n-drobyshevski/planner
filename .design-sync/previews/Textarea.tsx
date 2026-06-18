import { Textarea, Label } from "planner";

export function Default() {
  return (
    <div className="w-80 flex flex-col gap-2">
      <Label htmlFor="ta-notes">Notes</Label>
      <Textarea
        id="ta-notes"
        defaultValue="Book the corner table and pick up flowers on the way."
      />
    </div>
  );
}

export function Placeholder() {
  return (
    <div className="w-80 flex flex-col gap-2">
      <Label htmlFor="ta-empty">Notes</Label>
      <Textarea id="ta-empty" placeholder="Anything to remember?" />
    </div>
  );
}

export function Invalid() {
  return (
    <div className="w-80 flex flex-col gap-2">
      <Label htmlFor="ta-invalid">Notes</Label>
      <Textarea
        id="ta-invalid"
        aria-invalid
        defaultValue="This note is a little too long to save."
      />
    </div>
  );
}

export function Disabled() {
  return (
    <div className="w-80 flex flex-col gap-2">
      <Label htmlFor="ta-disabled">Notes</Label>
      <Textarea
        id="ta-disabled"
        disabled
        defaultValue="Synced from the shared calendar."
      />
    </div>
  );
}
