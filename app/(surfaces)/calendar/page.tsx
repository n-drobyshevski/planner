import { Suspense } from "react";
import { CalendarShell } from "@/components/calendar/calendar-shell";
import { CalendarSkeleton } from "@/components/shared/surface-skeletons";
import {
  parseViewParam,
  parseDateParam,
  isCalendarViewParam,
} from "@/lib/datetime/format";

// Reading searchParams is request-time data. Under Cache Components it must sit
// behind a Suspense boundary so the rest of the route (the static shell) can be
// prerendered while the params-dependent shell streams in. The skeleton
// fallback prerenders into the shell too: cold loads paint header + placeholder.
export default function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  return (
    <Suspense fallback={<CalendarSkeleton />}>
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
