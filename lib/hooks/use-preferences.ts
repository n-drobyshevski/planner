"use client";

import { useCallback, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "next-themes";
import { useLocale } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter, usePathname } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  updateMemberPreferences,
  upsertMemberSleepPrefs,
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
  AppLocale,
  ContextLabel,
  Member,
  MemberSleepPrefs,
  Palette,
  SurfaceTone,
  ThemePreference,
} from "@/lib/types";

const SLEEP_PREFS_DEFAULTS = {
  sleepCycleLengthMin: 90,
  sleepOnsetLatencyMin: 15,
  targetSleepCycles: 5,
  sleepCategoryId: null,
  nightWindowStartHour: 20,
  nightWindowEndHour: 12,
} as const;

function applyAppearance(
  accent: AccentId,
  tone: SurfaceTone,
  palette: Palette,
  pinkBase: string | null,
) {
  const el = document.documentElement;
  el.dataset.accent = accent;
  el.dataset.palette = palette;
  // A non-default palette owns its surfaces, so neutralize the tone preset
  // (`warm` has no override block); only `default` honors the chosen tone.
  el.dataset.tone = palette === "default" ? tone : "warm";
  // The `pink` palette derives every token from this base hue; other palettes
  // ignore it. Clear it otherwise so a stale value can't leak into the var.
  if (palette === "pink" && pinkBase) {
    el.style.setProperty("--pink-base", pinkBase);
  } else {
    el.style.removeProperty("--pink-base");
  }
  // Mirror to the cookie so the layout's pre-paint script reproduces it with no
  // flash on the next full load (and on first load on a fresh device/browser).
  writeAppearanceCookie(accent, tone, palette, pinkBase);
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

/** Patch the cached sleep prefs (member-private), seeding defaults if none yet. */
function patchCachedSleepPrefs(
  data: WorkspaceData | undefined,
  member: Member,
  patch: Partial<MemberSleepPrefs>,
): WorkspaceData | undefined {
  if (!data) return data;
  const base: MemberSleepPrefs = data.sleepPrefs ?? {
    memberId: member.id,
    workspaceId: member.workspaceId,
    ...SLEEP_PREFS_DEFAULTS,
  };
  return { ...data, sleepPrefs: { ...base, ...patch } };
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

  // UI language: the active URL locale vs the member's stored preference. The
  // profile is the cross-device source of truth — on first load we reconcile the
  // URL to it (a fresh device may have landed on a browser-detected locale).
  const urlLocale = useLocale() as AppLocale;
  const router = useRouter();
  const pathname = usePathname();
  const locale: AppLocale = member?.locale ?? "en";

  const accent = member?.accent ?? DEFAULT_ACCENT;
  const tone = member?.surfaceTone ?? DEFAULT_TONE;
  const themePreference = member?.themePreference ?? DEFAULT_THEME;
  const palette = member?.palette ?? DEFAULT_PALETTE;
  // The `pink` palette's configurable base hue (null = default pink #ec4899).
  const pinkBase = member?.pinkBase ?? null;
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
  // Sleep prefs live in a member-private table (not on the shared members row),
  // so the partner can't read them; null until the first save.
  const sleepPrefs = workspace.data?.sleepPrefs ?? null;
  // Sleep planning: cycle length / onset latency / nightly cycle target.
  const sleepCycleLengthMin = sleepPrefs?.sleepCycleLengthMin ?? 90;
  const sleepOnsetLatencyMin = sleepPrefs?.sleepOnsetLatencyMin ?? 15;
  const targetSleepCycles = sleepPrefs?.targetSleepCycles ?? 5;
  // Sleep derivation: dedicated category (null = inactive heuristic) + window.
  const sleepCategoryId = sleepPrefs?.sleepCategoryId ?? null;
  const nightWindowStartHour = sleepPrefs?.nightWindowStartHour ?? 20;
  const nightWindowEndHour = sleepPrefs?.nightWindowEndHour ?? 12;

  // The light/dark mode to assert into next-themes: a Catppuccin flavor dictates
  // its own (Latte light, the rest dark); `default` defers to themePreference.
  const desiredTheme =
    palette === "default" ? themePreference : paletteMode(palette) ?? "dark";

  const themeReconciled = useRef(false);
  useEffect(() => {
    if (!member) return;
    applyAppearance(member.accent, member.surfaceTone, member.palette, member.pinkBase);
    if (!themeReconciled.current) {
      themeReconciled.current = true;
      if (desiredTheme !== theme) setTheme(desiredTheme);
    }
  }, [member, theme, setTheme, desiredTheme]);

  // Once the signed-in member resolves, pull the URL onto their saved language
  // (cross-device: the profile wins over the browser-detected first-touch
  // locale). Runs once; a manual switch via `setLocale` already aligns the two.
  const localeReconciled = useRef(false);
  useEffect(() => {
    if (!member || localeReconciled.current) return;
    localeReconciled.current = true;
    if (member.locale !== urlLocale) {
      router.replace(pathname, { locale: member.locale });
    }
  }, [member, urlLocale, router, pathname]);

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

  // Sleep prefs persist to the member-private member_sleep_prefs table (not the
  // members row), so the same optimistic-patch-then-upsert dance runs against
  // `data.sleepPrefs`. A partial patch upserts only the touched columns.
  const persistSleepPrefs = useCallback(
    async (patch: Partial<Omit<MemberSleepPrefs, "memberId" | "workspaceId">>) => {
      if (!member) return;
      const prev = qc.getQueryData<WorkspaceData>(qk.workspace);
      qc.setQueryData<WorkspaceData>(qk.workspace, (d) =>
        patchCachedSleepPrefs(d, member, patch),
      );
      try {
        await upsertMemberSleepPrefs(createClient(), {
          memberId: member.id,
          workspaceId: member.workspaceId,
          ...patch,
        });
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
      withAppearanceTransition(() => applyAppearance(next, tone, palette, pinkBase)); // DOM + cookie
      void persist({ accent: next });
    },
    [persist, tone, palette, pinkBase],
  );

  const setTone = useCallback(
    (next: Member["surfaceTone"]) => {
      withAppearanceTransition(() => applyAppearance(accent, next, palette, pinkBase)); // DOM + cookie
      void persist({ surfaceTone: next });
    },
    [persist, accent, palette, pinkBase],
  );

  // Switch UI language: persist to the member row (so it follows across devices)
  // and navigate to the same path under the new locale. The navigation re-renders
  // the tree with the new message catalog; `router.replace` keeps history clean.
  const setLocale = useCallback(
    (next: AppLocale) => {
      void persist({ locale: next });
      if (next !== urlLocale) router.replace(pathname, { locale: next });
    },
    [persist, urlLocale, router, pathname],
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
  // that `persistSleepPrefs` patches, so the calculator re-ranks immediately.
  const setSleepCycleLength = useCallback(
    (next: number) => {
      void persistSleepPrefs({ sleepCycleLengthMin: next });
    },
    [persistSleepPrefs],
  );

  const setSleepOnsetLatency = useCallback(
    (next: number) => {
      void persistSleepPrefs({ sleepOnsetLatencyMin: next });
    },
    [persistSleepPrefs],
  );

  const setTargetSleepCycles = useCallback(
    (next: number) => {
      void persistSleepPrefs({ targetSleepCycles: next });
    },
    [persistSleepPrefs],
  );

  const setSleepCategory = useCallback(
    (next: string | null) => {
      void persistSleepPrefs({ sleepCategoryId: next });
    },
    [persistSleepPrefs],
  );

  const setNightWindowStart = useCallback(
    (next: number) => {
      void persistSleepPrefs({ nightWindowStartHour: next });
    },
    [persistSleepPrefs],
  );

  const setNightWindowEnd = useCallback(
    (next: number) => {
      void persistSleepPrefs({ nightWindowEndHour: next });
    },
    [persistSleepPrefs],
  );

  const setPalette = useCallback(
    (next: Palette) => {
      // Crossfade the whole flavor swap (surfaces + light/dark + accent) as one
      // View Transition. applyAppearance handles the data-tone rule (default
      // honors tone, a Catppuccin flavor forces 'warm') and mirrors all three to
      // the cookie; flushSync lands the next-themes class in the after-snapshot.
      withAppearanceTransition(() => {
        applyAppearance(accent, tone, next, pinkBase);
        // `default` and `pink` defer to the member's themePreference (paletteMode
        // → null); the Catppuccin flavors force their own light/dark mode.
        flushSync(() => setTheme(paletteMode(next) ?? themePreference));
      });
      void persist({ palette: next });
    },
    [persist, setTheme, accent, tone, themePreference, pinkBase],
  );

  const setPinkBase = useCallback(
    (next: string | null) => {
      // Re-tint the whole pink palette live (the var drives every token). Crossfade
      // it like the other appearance swaps; instant under reduced motion.
      withAppearanceTransition(() => applyAppearance(accent, tone, palette, next)); // DOM + cookie
      void persist({ pinkBase: next });
    },
    [persist, accent, tone, palette],
  );

  return {
    /** The member's stored UI language ("en" | "ru"); drives the Settings toggle. */
    locale,
    setLocale,
    themePreference,
    accent,
    tone,
    palette,
    /** The `pink` palette's base hue (`#rrggbb`), or null = the default pink. */
    pinkBase,
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
    /** Dedicated sleep category id, or null = the inactive≡sleep heuristic. */
    sleepCategoryId,
    /** Night window start hour on the evening before (12..23, default 20). */
    nightWindowStartHour,
    /** Night window end hour on the wake day (4..16, default 12). */
    nightWindowEndHour,
    setThemePref,
    setAccent,
    setTone,
    setPalette,
    setPinkBase,
    setTimezone,
    setSecondaryTimezone,
    setShowInactiveInMonth,
    setShowSuccessToasts,
    setContextLabel,
    setSleepCycleLength,
    setSleepOnsetLatency,
    setTargetSleepCycles,
    setSleepCategory,
    setNightWindowStart,
    setNightWindowEnd,
    /** false until the signed-in member is resolved (controls disabled meanwhile). */
    isReady: member != null,
  };
}
