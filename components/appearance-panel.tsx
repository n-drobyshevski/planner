"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  PaletteField,
  ThemeField,
} from "@/components/settings/appearance-fields";
import { usePreferences } from "@/lib/hooks/use-preferences";
import { paletteMode } from "@/lib/theme/appearance";
import { useUiStore } from "@/stores/ui-store";

/**
 * App-wide Appearance panel + its Shift+T shortcut. Mounted once on the signed-in
 * surface chrome so you can flip the theme (light/dark mode + color palette) from
 * any view without leaving it. The controls are the same `ThemeField` / `PaletteField`
 * the /settings page renders, dropped into a quiet right-side sheet; the mode toggle
 * is enlarged here since it's the panel's primary action.
 *
 * The keydown guards mirror the calendar grid + `UndoHotkey`: ignore the keystroke
 * while typing in a field, and (when opening) while another dialog/sheet is open,
 * so Shift+T never stacks the panel over an existing modal. Toggling closed always
 * works, so the same key dismisses it. Reads/writes the store via `getState()` so
 * the listener binds once and never goes stale.
 */
export function AppearancePanel() {
  const t = useTranslations("settings");
  const open = useUiStore((s) => s.appearancePanelOpen);
  const setOpen = useUiStore((s) => s.setAppearancePanelOpen);
  const { palette, themePreference, setPalette, setThemePref, isReady } =
    usePreferences();
  // A Catppuccin flavor owns light/dark, so it locks the mode toggle (the palette
  // picker stays live). `default` / `pink` keep the toggle usable.
  const catppuccin = paletteMode(palette) !== null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        !e.shiftKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.key.toLowerCase() !== "t"
      )
        return;

      const ae = document.activeElement;
      if (
        ae instanceof HTMLElement &&
        (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)
      )
        return;

      const isOpen = useUiStore.getState().appearancePanelOpen;
      // Don't stack the panel over another open dialog/sheet/alert (Radix sets
      // these). Skip the check when it's already open, so Shift+T can close it.
      if (
        !isOpen &&
        document.querySelector(
          "[role='dialog'][data-state='open'], [role='alertdialog'][data-state='open']",
        )
      )
        return;

      e.preventDefault();
      useUiStore.getState().setAppearancePanelOpen(!isOpen);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        // Calmer than the default popover surface, with a lighter scrim, so the
        // panel sits quietly over the view it's tuning.
        className="w-full gap-0 overflow-y-auto bg-background sm:max-w-md"
        overlayClassName="bg-black/15"
      >
        <SheetHeader>
          <SheetTitle>{t("appearance.title")}</SheetTitle>
          <SheetDescription>{t("appearance.description")}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-7 px-6 pb-8">
          {/* Hidden under a Catppuccin flavor, which sets its own light/dark mode. */}
          {!catppuccin && (
            <ThemeField
              size="lg"
              value={themePreference}
              onChange={setThemePref}
              disabled={!isReady}
            />
          )}
          <PaletteField
            value={palette}
            onChange={setPalette}
            disabled={!isReady}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
