import { RadioGroup, RadioGroupItem, Label } from "planner";

export function Repeat() {
  return (
    <RadioGroup defaultValue="weekly" className="w-80">
      <div className="flex items-center gap-2.5">
        <RadioGroupItem value="never" id="rp-never" />
        <Label htmlFor="rp-never">Does not repeat</Label>
      </div>
      <div className="flex items-center gap-2.5">
        <RadioGroupItem value="weekly" id="rp-weekly" />
        <Label htmlFor="rp-weekly">Every week</Label>
      </div>
      <div className="flex items-center gap-2.5">
        <RadioGroupItem value="monthly" id="rp-monthly" />
        <Label htmlFor="rp-monthly">Every month</Label>
      </div>
    </RadioGroup>
  );
}

export function Visibility() {
  return (
    <RadioGroup defaultValue="shared" className="w-80">
      <div className="flex items-center gap-2.5">
        <RadioGroupItem value="shared" id="vis-shared" />
        <Label htmlFor="vis-shared">Shared with Mara</Label>
      </div>
      <div className="flex items-center gap-2.5">
        <RadioGroupItem value="private" id="vis-private" />
        <Label htmlFor="vis-private">Just me</Label>
      </div>
    </RadioGroup>
  );
}

export function Disabled() {
  return (
    <RadioGroup defaultValue="busy" className="w-80" disabled>
      <div className="flex items-center gap-2.5">
        <RadioGroupItem value="busy" id="st-busy" />
        <Label htmlFor="st-busy" className="opacity-50">
          Show as busy
        </Label>
      </div>
      <div className="flex items-center gap-2.5">
        <RadioGroupItem value="free" id="st-free" />
        <Label htmlFor="st-free" className="opacity-50">
          Show as free
        </Label>
      </div>
    </RadioGroup>
  );
}
