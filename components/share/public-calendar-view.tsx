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
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";

import { createPublicClient } from "@/lib/supabase/anon";
import { fetchWindowPublic } from "@/lib/supabase/queries";
import { expandEvents } from "@/lib/recurrence/expand";
import { partitionPublicOccurrences } from "@/lib/calendar/bands";
import { getWindow, getVisibleDays } from "@/lib/datetime/window";
import { localTimeZone, defaultStartOnDay } from "@/lib/datetime/local";
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
  // The slot the viewer drew (epoch ms), used to pre-fill the request dialog.
  // null = the manual header button → today's defaults.
  const [prefill, setPrefill] = useState<{ start: number; end: number } | null>(
    null,
  );
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

  // Split the expanded occurrences for the public surface: context zones and active
  // events become drawable blocks/backdrops; inactive (sleep / blocked) events
  // become a quiet "Unavailable" band instead — their time shows, their content
  // never does (the RPC already redacted it). The RPC only returns inactive rows
  // when the share opts in (`show_inactive`), so an empty band list just means the
  // owner turned the band off (or has no inactive time here). Context windows carry
  // the owner's day-structure and obey the same privacy filters as events, so they
  // render here too (neutral stone, read-only) just as they do in the private app.
  const { occurrences, unavailableBands } = useMemo<{
    occurrences: Occurrence[];
    unavailableBands: { start: number; end: number }[];
  }>(() => {
    if (!query.data) return { occurrences: [], unavailableBands: [] };
    return partitionPublicOccurrences(
      expandEvents(query.data.events, query.data.overrides, win, EMPTY_SHARED),
    );
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
  // A tighter label for phones, where the full weekday/month would crowd the
  // single-row header off-screen.
  const periodLabelShort = ready
    ? format(focusedDate, view === "day" ? "EEE d MMM" : "MMM yyyy", {
        in: tz(timeZone),
      })
    : "";

  return (
    <div className="flex h-dvh flex-col">
      {/* Quiet, obviously-not-the-app header. One calm band; never wraps. */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2.5 sm:gap-3 sm:px-4">
        {/* Navigation */}
        <div className="flex min-w-0 items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Previous"
            onClick={() => shift(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          {/* Today is the most expendable nav affordance on a phone (the arrows
              still move the window); hide it there to keep the row intact. */}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 max-sm:hidden"
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
            className="ml-1 truncate text-sm font-medium tabular-nums text-foreground"
          >
            <span className="sm:hidden">{periodLabelShort}</span>
            <span className="hidden sm:inline">{periodLabel}</span>
          </span>
        </div>

        {/* View switcher + primary action, pushed to the right edge. */}
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          {/* Quiet discoverability nudge for the drag-to-request gesture. Only on
              wide screens — where there's room and a mouse-drag is the gesture —
              so the calm single-row header never crowds or wraps on phones. */}
          <span className="hidden text-xs text-muted-foreground lg:inline">
            Drag a slot to request a time
          </span>
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
                aria-label={v.label}
                onClick={() => setView(v.id)}
                className={`min-h-8 rounded-md px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3 ${
                  view === v.id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {/* Single letter on phones, full word once there's room. */}
                <span aria-hidden className="sm:hidden">
                  {v.label.charAt(0)}
                </span>
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            aria-label="Request a time"
            onClick={() => {
              setPrefill(null);
              setRequestOpen(true);
            }}
            className="h-8 max-sm:w-8 max-sm:px-0"
          >
            <CalendarPlus aria-hidden className="size-4" />
            <span className="hidden sm:inline">Request a time</span>
          </Button>
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
            // Context zones use the slim vertical side label here, not the full-width
            // top bar: a thin labelled spine keeps the quiet public surface from
            // stacking heavy header bars, and lets the events inside read cleanly.
            contextLabel="side"
            canEdit={NEVER_EDIT}
            selectedKey={null}
            onSelect={NOOP}
            onPickDay={NOOP}
            // Drawing a slot on the read-only public surface proposes a time
            // rather than creating an event: seed and open the request dialog.
            onCreateRange={(start, end) => {
              setPrefill({ start, end });
              setRequestOpen(true);
            }}
            onCreateDay={(dayMs) => {
              const start = defaultStartOnDay(dayMs, timeZone);
              setPrefill({ start, end: start + 3_600_000 });
              setRequestOpen(true);
            }}
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
        // Remount per drawn slot so the dialog's field initializers re-seed
        // (avoids a set-state-in-effect that the react-hooks lint rejects).
        key={prefill ? `${prefill.start}-${prefill.end}` : "manual"}
        token={token}
        open={requestOpen}
        onOpenChange={setRequestOpen}
        timeZone={timeZone}
        prefillStart={prefill?.start}
        prefillEnd={prefill?.end}
      />
    </div>
  );
}
