import { Calendar } from "planner";

export function MonthCalendar() {
  return (
    <Calendar
      mode="single"
      selected={new Date(2026, 5, 18)}
      defaultMonth={new Date(2026, 5, 18)}
      className="rounded-2xl border"
    />
  );
}

export function RangeCalendar() {
  return (
    <Calendar
      mode="range"
      selected={{ from: new Date(2026, 5, 15), to: new Date(2026, 5, 21) }}
      defaultMonth={new Date(2026, 5, 18)}
      numberOfMonths={1}
      className="rounded-2xl border"
    />
  );
}
