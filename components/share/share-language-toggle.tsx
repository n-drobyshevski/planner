"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";

import { type ShareLocale } from "@/lib/i18n/share-locale";
import { setShareLocale } from "@/app/share/locale-action";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * A quiet EN/RU switch for the anonymous share surface. The share view auto-picks
 * a language (cookie → Accept-Language → Russian), but a recipient may want the
 * other one — this lets them override it in one tap.
 *
 * The choice is persisted via the `setShareLocale` Server Action (the `share_locale`
 * cookie, a plain UI pref) and followed by `router.refresh()`: the dynamic share
 * page re-renders with the new cookie, swapping the provider's locale + messages.
 * The refresh is soft, so PublicCalendarView's client state (focused date, current
 * view) is preserved — the viewer keeps their place while the language flips.
 *
 * Like the view switcher, it splits by width: a compact globe dropdown on phones
 * (one tap, rhyming with the header's other ghost icon buttons instead of crowding
 * the row) and an inline segmented control on md+ (both options at a glance).
 */
// Endonyms — a language name stays in its own language, never translated.
const OPTIONS: { value: ShareLocale; code: string; endonym: string }[] = [
  { value: "ru", code: "RU", endonym: "Русский" },
  { value: "en", code: "EN", endonym: "English" },
];

export function ShareLanguageToggle() {
  const locale = useLocale() as ShareLocale;
  const t = useTranslations("share");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: string) {
    if (next === locale || pending) return;
    startTransition(async () => {
      await setShareLocale(next as ShareLocale);
      router.refresh();
    });
  }

  return (
    <>
      {/* Phones: a compact globe dropdown. Portals its content, so the header
          never clips it; aligned to the right edge it shares. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t("language.label")}
            disabled={pending}
            className="md:hidden"
          >
            <Globe className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup value={locale} onValueChange={choose}>
            {OPTIONS.map((opt) => (
              <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                {opt.endonym}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* md+: the segmented control, both options inline. Mirrors the view
          switcher's segmented look so it reads as part of the surface. */}
      <ToggleGroup
        type="single"
        variant="segmented"
        value={locale}
        onValueChange={(v) => v && choose(v)}
        disabled={pending}
        aria-label={t("language.label")}
        className="hidden shrink-0 md:flex"
      >
        {OPTIONS.map((opt) => (
          <ToggleGroupItem
            key={opt.value}
            value={opt.value}
            aria-label={opt.endonym}
            className="text-xs tabular-nums"
          >
            {opt.code}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </>
  );
}
