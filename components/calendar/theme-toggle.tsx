"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { AnimatePresence, m } from "motion/react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/lib/hooks/use-preferences";

export function ThemeToggle() {
  const t = useTranslations("calendar");
  const { resolvedTheme } = useTheme();
  const { palette, setThemePref } = usePreferences();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  // A Catppuccin flavor owns its light/dark mode — manage it in Settings, so the
  // quick toggle would be a no-op fight. Hide it while a flavor is active.
  if (palette !== "default") return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("themeToggle.ariaLabel")}
      onClick={() => setThemePref(isDark ? "light" : "dark")}
    >
      {/* Crossfade Sun/Moon. initial={false} + gating on `mounted` keeps the
          first icon from animating on load; only deliberate toggles animate. */}
      <AnimatePresence mode="wait" initial={false}>
        {mounted && (
          <m.span
            key={isDark ? "moon" : "sun"}
            className="inline-flex"
            initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
            transition={{ type: "spring", duration: 0.3, bounce: 0 }}
          >
            {isDark ? <Moon /> : <Sun />}
          </m.span>
        )}
      </AnimatePresence>
    </Button>
  );
}
