"use client";

import { useEffect, useMemo, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { addDays, addMonths, getTime, startOfDay, format } from "date-fns";
import { tz } from "@date-fns/tz";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Lock,
} from "lucide-react";

import { createPublicClient } from "@/lib/supabase/anon";
import { fetchWindowPublic } from "@/lib/supabase/queries";
import { expandEvents } from "@/lib/recurrence/expand";
import { mergeRanges } from "@/lib/calendar/bands";
import { getWindow, getVisibleDays } from "@/lib/datetime/window";
import { localTimeZone } from "@/lib/datetime/local";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CalendarCanvas } from "@/components/calendar/calendar-canvas";
import { PublicRequestDialog } from "@/components/share/public-request-dialog";
import type { CalendarView, Occurrence, TimeWindow } from "@/lib/types";

// The public surface is deliberately quiet: every block renders in one calm warm
// stone (NOT per-member colors, NOT the terracotta accent), and with no editable
// owner the canvas draws them all in its read-only "outlined" style — "look, don't
// touch". A single token keeps the public view from reading like the private app.
const PUBLIC_BLOCK_COLOR = "#57534e"; // warm stone-600 (AAA with white text)
const NOOP = () => {};
const EMPTY_SHARED: ReadonlySet<string> = new Set();
const NEVER_EDIT = () => false;

// Only week / day / month on the public surface — the prosumer 3-day/agenda views
// stay in the private app.
const VIEWS: { id: CalendarView; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

export function PublicCalendarView(props: {
  token: string;
  label: string | null;
  mode: "details" | "busy";
}) {
  // A private QueryClient: the public view shares nothing with the authed app.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <LazyMotion features={domMax} strict>
        <MotionConfig reducedMotion="user">
          <TooltipProvider delayDuration={200}>
            <PublicCalendarInner {...props} />
            <Toaster position="bottom-center" />
          </TooltipProvider>
        </MotionConfig>
      </LazyMotion>
    </QueryClientProvider>
  );
}

function PublicCalendarInner({
  token,
  label,
}: {
  token: string;
  label: string | null;
  mode: "details" | "busy";
}) {
  const timeZone = localTimeZone(); // the public viewer's own device zone
  const [view, setView] = useState<CalendarView>("week");
  // Client-only "now" so server and client agree (0 until mounted → skeleton),
  // mirroring the use-inbox day-bucket gate. The route is dynamic, but this also
  // keeps hydration stable.
  const [focusedDate, setFocusedDate] = useState(0);
  const [requestOpen, setRequestOpen] = useState(false);
  useEffect(() => {
    if (!focusedDate) setFocusedDate(Date.now());
  }, [focusedDate]);
  const ready = focusedDate > 0;

  const win = useMemo<TimeWindow>(
    () =>
      ready
        ? getWindow(view, focusedDate, { timeZone })
        : { start: 0, end: 0 },
    [ready, view, focusedDate, timeZone],
  );
  const days = useMemo(
    () => (ready ? getVisibleDays(view, focusedDate, { timeZone }) : []),
    [ready, view, focusedDate, timeZone],
  );

  const query = useQuery({
    queryKey: ["public-window", token, win.start, win.end],
    enabled: ready,
    queryFn: () => fetchWindowPublic(createPublicClient(), token, win),
  });

  // Split the expanded events two ways: active events become real blocks; inactive
  // (sleep / blocked) events become a quiet "Unavailable" band instead — their time
  // shows, their content never does (the RPC already redacted it). The RPC only
  // returns inactive rows when the share opts in (`show_inactive`), so an empty band
  // list just means the owner turned the band off (or has no inactive time here).
  const { occurrences, unavailableBands } = useMemo<{
    occurrences: Occurrence[];
    unavailableBands: { start: number; end: number }[];
  }>(() => {
    if (!query.data) return { occurrences: [], unavailableBands: [] };
    const all = expandEvents(
      query.data.events,
      query.data.overrides,
      win,
      EMPTY_SHARED,
      // Context paint-blocks reveal category structure and have no public meaning;
      // keep the public view to real events.
    ).filter((o) => o.kind === "event");
    return {
      occurrences: all.filter((o) => !o.inactive),
      // Cancelled inactive occurrences aren't "unavailable" — drop them.
      unavailableBands: mergeRanges(
        all
          .filter((o) => o.inactive && o.status !== "cancelled")
          .map((o) => ({ start: o.start, end: o.end })),
      ),
    };
  }, [query.data, win]);

  function shift(dir: -1 | 1) {
    const ctx = { in: tz(timeZone) };
    const base = focusedDate;
    const next =
      view === "day"
        ? addDays(base, dir, ctx)
        : view === "month"
          ? addMonths(base, dir, ctx)
          : addDays(base, dir * 7, ctx); // week (+ any other)
    setFocusedDate(getTime(startOfDay(next, ctx)));
  }

  const periodLabel = ready
    ? format(focusedDate, view === "day" ? "EEEE d MMMM" : "MMMM yyyy", {
        in: tz(timeZone),
      })
    : "";

  return (
    <div className="flex h-dvh flex-col">
      {/* Quiet, obviously-not-the-app header. */}
      <header className="flex shrink-0 flex-col gap-2 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-base font-semibold text-foreground">
              {label?.trim() || "Shared calendar"}
            </h1>
            {/* Non-color read-only signal: icon + text. */}
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              <Lock aria-hidden className="size-3" />
              Read-only
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRequestOpen(true)}
            className="shrink-0"
          >
            <CalendarPlus aria-hidden className="size-4" />
            Request a time
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Previous"
              onClick={() => shift(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setFocusedDate(Date.now())}
            >
              Today
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Next"
              onClick={() => shift(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
            <span
              aria-live="polite"
              className="ml-1 text-sm font-medium tabular-nums text-foreground"
            >
              {periodLabel}
            </span>
          </div>

          <div
            role="tablist"
            aria-label="Calendar view"
            className="flex items-center gap-1 rounded-lg bg-muted p-0.5"
          >
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={view === v.id}
                onClick={() => setView(v.id)}
                className={`min-h-8 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  view === v.id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        {ready && (
          <CalendarCanvas
            view={view}
            days={days}
            occurrences={occurrences}
            unavailableBands={unavailableBands}
            focusedMs={focusedDate}
            colorOf={() => PUBLIC_BLOCK_COLOR}
            canEdit={NEVER_EDIT}
            selectedKey={null}
            onSelect={NOOP}
            onPickDay={NOOP}
            onCreateRange={NOOP}
            onCreateDay={NOOP}
            onReschedule={NOOP}
            onChangeColor={NOOP}
            onDeleteEvent={NOOP}
            loading={query.isLoading}
            error={query.isError}
            onRetry={() => void query.refetch()}
          />
        )}
      </main>

      <PublicRequestDialog
        token={token}
        open={requestOpen}
        onOpenChange={setRequestOpen}
        timeZone={timeZone}
      />
    </div>
  );
}
