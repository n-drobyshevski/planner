import { TimeField } from "planner";

export function StartTime() {
  return (
    <div className="w-40">
      <TimeField value="19:30" onChange={() => {}} aria-label="Start time" />
    </div>
  );
}

export function EmptyTime() {
  return (
    <div className="w-40">
      <TimeField value="" onChange={() => {}} aria-label="End time" />
    </div>
  );
}
