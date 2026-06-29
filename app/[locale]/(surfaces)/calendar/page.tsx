import { Suspense } from "react";
import { cacheLife } from "next/cache";
import { CalendarShell } from "@/components/calendar/calendar-shell";
import { CalendarDataSeed } from "./calendar-data-seed";
import { CalendarSkeleton } from "@/components/shared/surface-skeletons";
import {
  parseViewParam,
  parseDateParam,
  isCalendarViewParam,
} from "@/lib/datetime/format";
import type { CalendarView } from "@/lib/types";

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
  // Params are parsed OUT here, in the dynamic scope, and the plain results
  // become the cache key below. In particular parseDateParam defaults to
  // *today* when ?date= is absent — request-time and non-deterministic, so it
  // must not run inside "use cache" (it would freeze "today" into the entry);
  // resolved out here it just keys one entry per day.
  const view = parseViewParam(sp.view);
  const dateMs = parseDateParam(sp.date);
  // Server-seed the workspace + focused window into React Query (dynamic,
  // per-user) so the grid paints without the client fetch waterfall. The cached
  // shell below is unchanged — no per-user data crosses into "use cache".
  return (
    <CalendarDataSeed view={view} dateMs={dateMs}>
      <CachedCalendar
        view={view}
        dateMs={dateMs}
        viewFromUrl={isCalendarViewParam(sp.view)}
      />
    </CalendarDataSeed>
  );
}

/**
 * The RSC payload for a given (view, date) is pure code-derived UI — all data
 * is client-fetched — so it's cached: repeat visits skip the server render,
 * and within the profile's client `stale` window the router serves surface
 * back-navigation from browser memory with no roundtrip at all.
 */
async function CachedCalendar({
  view,
  dateMs,
  viewFromUrl,
}: {
  view: CalendarView;
  dateMs: number;
  viewFromUrl: boolean;
}) {
  "use cache";
  cacheLife("hours");
  return (
    <CalendarShell
      initialView={view}
      initialDate={dateMs}
      viewFromUrl={viewFromUrl}
    />
  );
}
