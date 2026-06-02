"use client";

import { useCallback, useEffect, useRef } from "react";
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
  paletteMode,
} from "@/lib/theme/appearance";
import type { Member, Palette, ThemePreference } from "@/lib/types";

function applyAppearance(accent: string, tone: string, palette: Palette) {
  const el = document.documentElement;
  el.dataset.accent = accent;
  el.dataset.palette = palette;
  // A Catppuccin flavor owns its surfaces, so neutralize the tone preset
  // (`warm` has no override block); only `default` honors the chosen tone.
  el.dataset.tone = palette === "default" ? tone : "warm";
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
      document.documentElement.dataset.accent = next;
      void persist({ accent: next });
    },
    [persist],
  );

  const setTone = useCallback(
    (next: Member["surfaceTone"]) => {
      document.documentElement.dataset.tone = next;
      void persist({ surfaceTone: next });
    },
    [persist],
  );

  const setThemePref = useCallback(
    (next: ThemePreference) => {
      setTheme(next);
      void persist({ themePreference: next });
    },
    [persist, setTheme],
  );

  const setPalette = useCallback(
    (next: Palette) => {
      const el = document.documentElement;
      el.dataset.palette = next;
      if (next === "default") {
        el.dataset.tone = tone; // restore the member's chosen surface tone
        setTheme(themePreference); // and their own light / dark / system
      } else {
        el.dataset.tone = "warm"; // neutralize tone presets under Catppuccin
        setTheme(paletteMode(next) ?? "dark"); // the flavor owns light/dark
      }
      void persist({ palette: next });
    },
    [persist, setTheme, tone, themePreference],
  );

  return {
    themePreference,
    accent,
    tone,
    palette,
    setThemePref,
    setAccent,
    setTone,
    setPalette,
    /** false until the signed-in member is resolved (controls disabled meanwhile). */
    isReady: member != null,
  };
}
