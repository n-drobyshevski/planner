"use client";

import { useEffect, useMemo, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { LazyMotion, MotionConfig, domMax, m } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";

import { createPublicClient } from "@/lib/supabase/anon";
import { fetchWindowPublic } from "@/lib/supabase/queries";
import { expandEvents } from "@/lib/recurrence/expand";
import { partitionPublicOccurrences } from "@/lib/calendar/bands";
import { getWindow, getVisibleDays, navigate } from "@/lib/datetime/window";
import { formatRangeLabel } from "@/lib/datetime/format";
import { dateFnsLocale } from "@/lib/datetime/date-locale";
import { PUBLIC_BUSY_LABEL } from "@/lib/scope/visibility";
import { localTimeZone, defaultStartOnDay } from "@/lib/datetime/local";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CalendarCanvas } from "@/components/calendar/calendar-canvas";
import { PublicRequestDialog } from "@/components/share/public-request-dialog";
import { ShareLanguageToggle } from "@/components/share/share-language-toggle";
import type { CalendarView, Occurrence, TimeWindow } from "@/lib/types";

// The public surface is deliberately quiet: every block renders in one calm warm
// stone (NOT per-member colors, NOT the terracotta accent), and with no editable
// owner the canvas draws them all in its read-only "outlined" style — "look, don't
// touch". A single token keeps the public view from reading like the private app.
const PUBLIC_BLOCK_COLOR = "#57534e"; // warm stone-600 (AAA with white text)
const NOOP = () => {};
const EMPTY_SHARED: ReadonlySet<string> = new Set();
const NEVER_EDIT = () => false;

// Day / 3-day / week / month on the public surface — the agenda view stays in the
// private app. 3-day is the legible "week-lite" and the default on phones, where
// week's 7 columns crowd a narrow viewport. Labels come from the `share.views.*`
// catalog (resolved at render via `useTranslations`).
const VIEWS: { id: CalendarView; labelKey: string }[] = [
  { id: "day", labelKey: "views.day" },
  { id: "3day", labelKey: "views.threeDay" },
  { id: "week", labelKey: "views.week" },
  { id: "month", labelKey: "views.month" },
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
  const t = useTranslations("share");
  const locale = useLocale();
  const timeZone = localTimeZone(); // the public viewer's own device zone
  const isMobile = useIsMobile();
  const [view, setView] = useState<CalendarView>("week");
  // Sentinel for the once-only phone default applied in the render-time block
  // below. State (not a ref) so it can be read during render lint-cleanly.
  const [mobileDefaultApplied, setMobileDefaultApplied] = useState(false);
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
  // The RPC redacts any hidden title to the server `PUBLIC_BUSY_LABEL` sentinel
  // ("Busy") — independently per axis: events when titles are off, context bands
  // when their names are off. Localise the sentinel wherever it lands; a block that
  // kept its real title is never touched (the sentinel is a server-only constant).
  const busyLabel = t("busy");
  const { occurrences, unavailableBands } = useMemo<{
    occurrences: Occurrence[];
    unavailableBands: { start: number; end: number }[];
  }>(() => {
    if (!query.data) return { occurrences: [], unavailableBands: [] };
    const partitioned = partitionPublicOccurrences(
      expandEvents(query.data.events, query.data.overrides, win, EMPTY_SHARED),
    );
    return {
      ...partitioned,
      occurrences: partitioned.occurrences.map((o) =>
        o.title === PUBLIC_BUSY_LABEL ? { ...o, title: busyLabel } : o,
      ),
    };
  }, [query.data, win, busyLabel]);

  // The shared helper steps each view by one of its own units (day ±1, 3-day ±3,
  // week ±1 week, month ±1 month) and re-aligns to local midnight.
  function shift(dir: -1 | 1) {
    setFocusedDate(navigate(view, focusedDate, dir, { timeZone }));
  }

  // The manual entry point to the request flow (the desktop header button and the
  // mobile FAB): no drawn slot, so the dialog falls back to today's defaults.
  function openManualRequest() {
    setPrefill(null);
    setRequestOpen(true);
  }

  const periodLabel = ready
    ? view === "3day"
      ? formatRangeLabel("3day", focusedDate, timeZone, locale)
      : format(focusedDate, view === "day" ? "EEEE d MMMM" : "MMMM yyyy", {
          in: tz(timeZone),
          locale: dateFnsLocale(locale),
        })
    : "";
  // A tighter label for phones, where the full weekday/month would crowd the
  // single-row header off-screen. The 3-day range is already compact enough to
  // share between both.
  const periodLabelShort = ready
    ? view === "3day"
      ? formatRangeLabel("3day", focusedDate, timeZone, locale)
      : format(focusedDate, view === "day" ? "EEE d MMM" : "MMM yyyy", {
          in: tz(timeZone),
          locale: dateFnsLocale(locale),
        })
    : "";

  // Phones default to 3-day, applied once at render time (React's "adjust state on
  // changed input" pattern, mirroring calendar-shell) rather than in an effect, so
  // it converges without a cascading set-state-in-effect and never paints a week
  // frame: `useIsMobile` is false until mounted (matching SSR), and the canvas is
  // gated on `ready`, so this flips before the first canvas paint. The `view` guard
  // means it only overrides the untouched default — week stays selectable on phones.
  if (isMobile && !mobileDefaultApplied) {
    setMobileDefaultApplied(true);
    if (view === "week") setView("3day");
  }

  return (
    <div lang={locale} className="relative flex h-dvh flex-col">
      {/* Quiet, obviously-not-the-app header. One calm band; never wraps. */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2.5 sm:gap-3 sm:px-4">
        {/* Navigation */}
        <div className="flex min-w-0 items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label={t("nav.previous")}
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
            {t("nav.today")}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t("nav.next")}
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
            {t("dragHint")}
          </span>
          {/* A quiet EN/RU switch — the anonymous surface auto-picks a language but
              any recipient can flip it. Mirrors the view-switcher's segmented look. */}
          <ShareLanguageToggle />
          {/* Phones: a compact dropdown — clearer than four single-letter tabs in a
              narrow row. Reuses the standard form-control vocabulary already on this
              surface; portals its content, so the header never clips it. */}
          <Select value={view} onValueChange={(v) => setView(v as CalendarView)}>
            <SelectTrigger
              size="sm"
              aria-label={t("nav.viewLabel")}
              className="h-8 w-[6.75rem] md:hidden"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {VIEWS.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {t(v.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* md+: the segmented control, with room for all four full labels. */}
          <div
            role="tablist"
            aria-label={t("nav.viewLabel")}
            className="hidden items-center gap-1 rounded-lg bg-muted p-0.5 md:flex"
          >
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={view === v.id}
                aria-label={t(v.labelKey)}
                onClick={() => setView(v.id)}
                className={`min-h-8 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  view === v.id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(v.labelKey)}
              </button>
            ))}
          </div>
          {/* Desktop keeps the action in the header; on phones it moves to the
              thumb-reachable FAB below, so the mobile header stays purely
              navigational (move through time · switch view). */}
          <Button
            size="sm"
            variant="outline"
            onClick={openManualRequest}
            className="hidden h-8 md:inline-flex"
          >
            <CalendarPlus aria-hidden className="size-4" />
            {t("requestCta")}
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

      {/* Phones: the single primary action floats into the right-thumb zone as a
          labeled FAB (the desktop header keeps its own button). The terracotta is
          the one accent on an otherwise neutral surface, so the action reads
          unmistakably against the stone event cards instead of blending in. Sits
          above the canvas (events top out at z-30) and clears the home indicator. */}
      <m.div
        className="absolute right-4 z-40 md:hidden"
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
        initial={{ opacity: 0, scale: 0.9, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        <Button
          onClick={openManualRequest}
          className="h-12 gap-2 rounded-full px-5 shadow-soft-lg"
        >
          <CalendarPlus aria-hidden className="size-5" />
          {t("requestCta")}
        </Button>
      </m.div>

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
