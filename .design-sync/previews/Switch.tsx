import { Switch, Label } from "planner";

export function Off() {
  return (
    <div className="w-80 flex items-center justify-between gap-3">
      <Label htmlFor="sw-off">Show on shared calendar</Label>
      <Switch id="sw-off" />
    </div>
  );
}

export function On() {
  return (
    <div className="w-80 flex items-center justify-between gap-3">
      <Label htmlFor="sw-on">Notify Mara</Label>
      <Switch id="sw-on" defaultChecked />
    </div>
  );
}

export function Small() {
  return (
    <div className="w-80 flex items-center justify-between gap-3">
      <Label htmlFor="sw-sm">All-day event</Label>
      <Switch id="sw-sm" size="sm" defaultChecked />
    </div>
  );
}

export function Disabled() {
  return (
    <div className="w-80 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="sw-d-off" className="opacity-50">
          Weekend reminders
        </Label>
        <Switch id="sw-d-off" disabled />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="sw-d-on" className="opacity-50">
          Sync with phone
        </Label>
        <Switch id="sw-d-on" disabled defaultChecked />
      </div>
    </div>
  );
}
