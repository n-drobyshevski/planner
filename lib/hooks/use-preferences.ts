"use client";

import { useCallback, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "next-themes";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  updateMemberPreferences,
  type MemberPreferencesPatch,
} from "@/lib/supabase/mutations";
import { useWorkspace, type WorkspaceData } from "@/lib/hooks/use-workspace";
import { qk } from "@/lib/supabase/query-keys";
import {
  DEFAULT_ACCENT,
  DEFAULT_TONE,
  DEFAULT_THEME,
  DEFAULT_PALETTE,
  DEFAULT_CONTEXT_LABEL,
  paletteMode,
} from "@/lib/theme/appearance";
import { writeAppearanceCookie } from "@/lib/theme/appearance-cookie";
import { withAppearanceTransition } from "@/lib/theme/appearance-transition";
import { localTimeZone } from "@/lib/datetime/local";
import type {
  AccentId,
  ContextLabel,
  Member,
  Palette,
  SurfaceTone,
  ThemePreference,
} from "@/lib/types";

function applyAppearance(accent: AccentId, tone: SurfaceTone, palette: Palette) {
  const el = document.documentElement;
  el.dataset.accent = accent;
  el.dataset.palette = palette;
  // A Catppuccin flavor owns its surfaces, so neutralize the tone preset
  // (`warm` has no override block); only `default` honors the chosen tone.
  el.dataset.tone = palette === "default" ? tone : "warm";
  // Mirror to the cookie so the layout's pre-paint script reproduces it with no
  // flash on the next full load (and on first load on a fresh device/browser).
  writeAppearanceCookie(accent, tone, palette);
}

/** Patch the cached workspace bundle so the current member's prefs update at once. */
function patchCachedMember(
  data: WorkspaceData | undefined,
  memberId: string,
  patch: MemberPreferencesPatch,
): WorkspaceData | undefined {
  if (!data) return data;
  const apply = (m: Member): Member => (m.id === memberId ? { ...m, ...patch } : m);
  return {
    ...data,
    members: data.members.map(apply),
    currentMember: data.currentMember ? apply(data.currentMember) : null,
  };
}

/**
 * Appearance preferences (theme / accent / surface tone), shared by the toolbar
 * theme toggle and the Settings page. The member row in Supabase is the source
 * of truth; changes are applied optimistically (DOM attribute + next-themes +
 * query cache) and persisted, rolling back on failure. On first load we
 * reconcile the stored theme into next-themes so the choice follows the profile
 * across devices. Accent/tone are also server-rendered onto <html> to avoid a
 * flash, so this hook's effect only re-asserts the same values on the client.
 */
export function usePreferences() {
  const { theme, setTheme } = useTheme();
  const workspace = useWorkspace();
  const member = workspace.data?.currentMember ?? null;
  const qc = useQueryClient();

  const accent = member?.accent ?? DEFAULT_ACCENT;
  const tone = member?.surfaceTone ?? DEFAULT_TONE;
  const themePreference = member?.themePreference ?? DEFAULT_THEME;
  const palette = member?.palette ?? DEFAULT_PALETTE;
  // Time zones: the stored value (null = follow device) and the resolved zone
  // the calendar actually renders in. The secondary zone is null when off.
  const rawTimezone = member?.timezone ?? null;
  const timeZone = rawTimezone ?? localTimeZone();
  const secondaryTimeZone = member?.secondaryTimezone ?? null;
  // Month-view display: whether inactive (grayed-out) events are shown there.
  const showInactiveInMonth = member?.showInactiveInMonth ?? true;
  // Toasts: whether success/confirmation toasts are shown (errors always are).
  const showSuccessToasts = member?.showSuccessToasts ?? true;
  // Week/day display: how context time-blocks are labelled (top bar vs side).
  const contextLabel = member?.contextLabel ?? DEFAULT_CONTEXT_LABEL;
  // Sleep planning: cycle length / onset latency / nightly cycle target.
  const sleepCycleLengthMin = member?.sleepCycleLengthMin ?? 90;
  const sleepOnsetLatencyMin = member?.sleepOnsetLatencyMin ?? 15;
  const targetSleepCycles = member?.targetSleepCycles ?? 5;

  // The light/dark mode to assert into next-themes: a Catppuccin flavor dictates
  // its own (Latte light, the rest dark); `default` defers to themePreference.
  const desiredTheme =
    palette === "default" ? themePreference : paletteMode(palette) ?? "dark";

  const themeReconciled = useRef(false);
  useEffect(() => {
    if (!member) return;
    applyAppearance(member.accent, member.surfaceTone, member.palette);
    if (!themeReconciled.current) {
      themeReconciled.current = true;
      if (desiredTheme !== theme) setTheme(desiredTheme);
    }
  }, [member, theme, setTheme, desiredTheme]);

  const persist = useCallback(
    async (patch: MemberPreferencesPatch) => {
      if (!member) return;
      const prev = qc.getQueryData<WorkspaceData>(qk.workspace);
      qc.setQueryData<WorkspaceData>(qk.workspace, (d) =>
        patchCachedMember(d, member.id, patch),
      );
      try {
        await updateMemberPreferences(createClient(), member.id, patch);
      } catch (e) {
        if (prev) qc.setQueryData(qk.workspace, prev); // roll back optimistic change
        toast.error(
          e instanceof Error ? e.message : "Couldn't save your preference",
        );
      }
    },
    [member, qc],
  );

  const setAccent = useCallback(
    (next: Member["accent"]) => {
      // Crossfade the re-tint via the View Transitions API (instant fallback
      // under reduced-motion / unsupported browsers — see withAppearanceTransition).
      withAppearanceTransition(() => applyAppearance(next, tone, palette)); // DOM + cookie
      void persist({ accent: next });
    },
    [persist, tone, palette],
  );

  const setTone = useCallback(
    (next: Member["surfaceTone"]) => {
      withAppearanceTransition(() => applyAppearance(accent, next, palette)); // DOM + cookie
      void persist({ surfaceTone: next });
    },
    [persist, accent, palette],
  );

  const setThemePref = useCallback(
    (next: ThemePreference) => {
      // flushSync so next-themes' class update lands inside the transition's
      // "after" snapshot (it's otherwise an async React state update).
      withAppearanceTransition(() => flushSync(() => setTheme(next)));
      void persist({ themePreference: next });
    },
    [persist, setTheme],
  );

  // Time-zone preferences have no DOM side-effect (unlike accent/tone, which
  // re-tint <html> at once); the calendar re-reads the resolved zone from the
  // workspace cache that `persist` patches. Passing null clears the column
  // (= follow device / turn the secondary zone off).
  const setTimezone = useCallback(
    (next: string | null) => {
      void persist({ timezone: next });
    },
    [persist],
  );

  const setSecondaryTimezone = useCallback(
    (next: string | null) => {
      void persist({ secondaryTimezone: next });
    },
    [persist],
  );

  // No DOM side-effect (like the time-zone setters): the month grid re-reads the
  // flag from the workspace cache that `persist` patches.
  const setShowInactiveInMonth = useCallback(
    (next: boolean) => {
      void persist({ showInactiveInMonth: next });
    },
    [persist],
  );

  // No DOM side-effect: `useNotify` re-reads the flag from the workspace cache
  // that `persist` patches, so the next toast is gated immediately.
  const setShowSuccessToasts = useCallback(
    (next: boolean) => {
      void persist({ showSuccessToasts: next });
    },
    [persist],
  );

  // No DOM side-effect: the week/day grid re-reads the variant from the
  // workspace cache that `persist` patches.
  const setContextLabel = useCallback(
    (next: ContextLabel) => {
      void persist({ contextLabel: next });
    },
    [persist],
  );

  // No DOM side-effect: the Sleep tab re-reads these from the workspace cache
  // that `persist` patches, so the calculator re-ranks immediately.
  const setSleepCycleLength = useCallback(
    (next: number) => {
      void persist({ sleepCycleLengthMin: next });
    },
    [persist],
  );

  const setSleepOnsetLatency = useCallback(
    (next: number) => {
      void persist({ sleepOnsetLatencyMin: next });
    },
    [persist],
  );

  const setTargetSleepCycles = useCallback(
    (next: number) => {
      void persist({ targetSleepCycles: next });
    },
    [persist],
  );

  const setPalette = useCallback(
    (next: Palette) => {
      // Crossfade the whole flavor swap (surfaces + light/dark + accent) as one
      // View Transition. applyAppearance handles the data-tone rule (default
      // honors tone, a Catppuccin flavor forces 'warm') and mirrors all three to
      // the cookie; flushSync lands the next-themes class in the after-snapshot.
      withAppearanceTransition(() => {
        applyAppearance(accent, tone, next);
        flushSync(() =>
          setTheme(next === "default" ? themePreference : paletteMode(next) ?? "dark"),
        );
      });
      void persist({ palette: next });
    },
    [persist, setTheme, accent, tone, themePreference],
  );

  return {
    themePreference,
    accent,
    tone,
    palette,
    /** Stored zone (null = follow device) — for the Settings picker's selected state. */
    rawTimezone,
    /** Resolved zone the calendar renders in (stored value or the device zone). */
    timeZone,
    /** Optional secondary zone (world-clock), or null when off. */
    secondaryTimeZone,
    /** Whether inactive events are shown in the month view. */
    showInactiveInMonth,
    /** Whether success/confirmation toasts are shown (errors always are). */
    showSuccessToasts,
    /** How context time-blocks are labelled in the week/day grid. */
    contextLabel,
    /** One full sleep cycle in minutes (70..110, default 90). */
    sleepCycleLengthMin,
    /** Minutes to fall asleep after getting into bed (0..60, default 15). */
    sleepOnsetLatencyMin,
    /** Nightly sleep-cycle target (3..7, default 5). */
    targetSleepCycles,
    setThemePref,
    setAccent,
    setTone,
    setPalette,
    setTimezone,
    setSecondaryTimezone,
    setShowInactiveInMonth,
    setShowSuccessToasts,
    setContextLabel,
    setSleepCycleLength,
    setSleepOnsetLatency,
    setTargetSleepCycles,
    /** false until the signed-in member is resolved (controls disabled meanwhile). */
    isReady: member != null,
  };
}
