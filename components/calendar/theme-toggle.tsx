"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
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
      {isDark ? <Moon /> : <Sun />}
    </Button>
  );
}
