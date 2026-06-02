import { Suspense } from "react";
import { CalendarShell } from "@/components/calendar/calendar-shell";
import {
  parseViewParam,
  parseDateParam,
  isCalendarViewParam,
} from "@/lib/datetime/format";

// Reading searchParams is request-time data. Under Cache Components it must sit
// behind a Suspense boundary so the rest of the route (the static shell) can be
// prerendered while the params-dependent shell streams in.
export default function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <CalendarRoute searchParams={searchParams} />
    </Suspense>
  );
}

async function CalendarRoute({
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
