import { CalendarShell } from "@/components/calendar/calendar-shell";
import {
  parseViewParam,
  parseDateParam,
  isCalendarViewParam,
} from "@/lib/datetime/format";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const sp = await searchParams;
  return (
    <CalendarShell
      initialView={parseViewParam(sp.view)}
      initialDate={parseDateParam(sp.date)}
      viewFromUrl={isCalendarViewParam(sp.view)}
    />
  );
}
