"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import { localTimeZone } from "@/lib/datetime/local";

/**
 * The viewer's effective time zones, resolved from the signed-in member's
 * preferences (the React Query workspace cache — the same source `usePreferences`
 * writes to, so picking a zone in Settings updates the calendar at once):
 *  - `timeZone`: the member's chosen IANA zone, or the device zone when unset
 *    (null in the DB = "follow the device").
 *  - `secondaryTimeZone`: an optional second zone for the world-clock gutter;
 *    null = off.
 *
 * Calendar leaves read this without prop-drilling and pass it into the pure
 * datetime helpers (which keep an explicit `timeZone` param so they stay
 * testable). The provider is mounted around the calendar tree in CalendarShell.
 */
interface ViewerTimeZones {
  timeZone: string;
  secondaryTimeZone: string | null;
}

const TimezoneContext = createContext<ViewerTimeZones | null>(null);

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const workspace = useWorkspace();
  const member = workspace.data?.currentMember ?? null;
  const rawTimezone = member?.timezone ?? null;
  const secondaryTimeZone = member?.secondaryTimezone ?? null;

  const value = useMemo<ViewerTimeZones>(
    () => ({ timeZone: rawTimezone ?? localTimeZone(), secondaryTimeZone }),
    [rawTimezone, secondaryTimeZone],
  );

  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>;
}

/** The zone the calendar renders in. Falls back to the device zone outside a provider. */
export function useViewerTimeZone(): string {
  return useContext(TimezoneContext)?.timeZone ?? localTimeZone();
}

/** The optional secondary zone (world-clock gutter), or null when off. */
export function useSecondaryTimeZone(): string | null {
  return useContext(TimezoneContext)?.secondaryTimeZone ?? null;
}
