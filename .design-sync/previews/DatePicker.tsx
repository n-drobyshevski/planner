import { DatePicker } from "planner";

export function EventDate() {
  return (
    <div className="w-56">
      <DatePicker value="2026-06-25" onChange={() => {}} aria-label="Event date" />
    </div>
  );
}

export function EmptyDate() {
  return (
    <div className="w-56">
      <DatePicker value="" onChange={() => {}} aria-label="End date" />
    </div>
  );
}
