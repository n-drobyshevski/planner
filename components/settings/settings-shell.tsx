"use client";

import { useEffect, useRef, useState } from "react";
import { m } from "motion/react";
import { useTranslations } from "next-intl";
import {
  CalendarDays,
  Clock,
  Moon,
  Palette,
  Share2,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { tween } from "@/lib/motion";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { CalendarSettings } from "@/components/settings/calendar-settings";
import { TimezoneSettings } from "@/components/settings/timezone-settings";
import { SleepSettings } from "@/components/settings/sleep-settings";
import { SharingSettings } from "@/components/settings/sharing/sharing-settings";

type SectionId =
  | "profile"
  | "appearance"
  | "calendar"
  | "time"
  | "sleep"
  | "sharing";

const SECTIONS: { id: SectionId; icon: LucideIcon; Component: () => React.JSX.Element }[] = [
  { id: "profile", icon: User, Component: ProfileSettings },
  { id: "appearance", icon: Palette, Component: AppearanceSettings },
  { id: "calendar", icon: CalendarDays, Component: CalendarSettings },
  { id: "time", icon: Clock, Component: TimezoneSettings },
  { id: "sleep", icon: Moon, Component: SleepSettings },
  { id: "sharing", icon: Share2, Component: SharingSettings },
];

const SECTION_IDS = SECTIONS.map((s) => s.id);
const isSection = (v: string | null): v is SectionId =>
  v != null && (SECTION_IDS as string[]).includes(v);

/**
 * Two-pane settings: a quiet category rail beside a content panel on desktop,
 * collapsing to a horizontal tab strip above the panel on phones. The active
 * section lives in the URL (`?section=`) so it's shareable and deep-linkable;
 * the legacy `/settings#sleep` anchor still resolves to the Sleep section.
 *
 * Only the active section mounts — instant-apply state lives in the prefs /
 * profile hooks, so switching is free and the DOM stays light. The first paint
 * never animates (the product bans load sequences); section *switches* get a
 * quiet crossfade, dropped under reduced motion by the global MotionConfig.
 */
export function SettingsShell() {
  const t = useTranslations("settings");
  const [section, setSection] = useState<SectionId>("profile");
  // Gate the swap animation: false on first paint, true once mounted, so the
  // initial section appears instantly and only later switches crossfade.
  const [painted, setPainted] = useState(false);

  // Resolve the initial section from the URL once, on the client: `?section=`
  // wins, then the legacy `#sleep` hash. Reading from window (not
  // useSearchParams) keeps the route statically prerenderable.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("section");
    const initial = isSection(fromQuery)
      ? fromQuery
      : window.location.hash === "#sleep"
        ? "sleep"
        : null;
    if (initial) setSection(initial);
    setPainted(true);
  }, []);

  const select = (id: SectionId) => {
    setSection(id);
    // Reflect the choice in the URL without a navigation (no refetch, no new
    // history entry), and clear any legacy hash so it doesn't re-trigger.
    const url = new URL(window.location.href);
    url.hash = "";
    if (id === "profile") url.searchParams.delete("section");
    else url.searchParams.set("section", id);
    window.history.replaceState(null, "", url);
  };

  const renderItem = (id: SectionId, Icon: LucideIcon, layout: "rail" | "strip") => {
    const active = id === section;
    return (
      <button
        key={id}
        type="button"
        onClick={() => select(id)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "inline-flex shrink-0 items-center gap-2.5 rounded-2xl text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40",
          layout === "rail"
            ? "h-10 w-full justify-start px-3"
            : "h-11 justify-center px-3.5",
          active
            ? "bg-card text-foreground ring-1 ring-foreground/10"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        )}
      >
        <Icon
          className={cn("size-4", active ? "text-primary" : "text-current")}
          aria-hidden
        />
        {t(`sections.${id}`)}
      </button>
    );
  };

  const Active = SECTIONS.find((s) => s.id === section)!.Component;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-8 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10 lg:py-10">
      {/* Mobile / tablet: horizontal tab strip pinned above the panel. */}
      <nav
        aria-label={t("sections.ariaLabel")}
        className="-mx-4 mb-5 flex gap-1 overflow-x-auto px-4 pb-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {SECTIONS.map((s) => renderItem(s.id, s.icon, "strip"))}
      </nav>

      {/* Desktop: vertical rail beside the panel; sticks while the panel scrolls. */}
      <nav
        aria-label={t("sections.ariaLabel")}
        className="hidden lg:flex lg:flex-col lg:gap-1 lg:self-start lg:sticky lg:top-20"
      >
        {SECTIONS.map((s) => renderItem(s.id, s.icon, "rail"))}
      </nav>

      {/* Content panel — the single surface; sections inside use hairline-divided
          groups, never their own cards. */}
      <div className="min-w-0 rounded-2xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6 lg:p-8">
        <m.div
          key={section}
          initial={painted ? { opacity: 0 } : false}
          animate={{ opacity: 1, transition: tween }}
        >
          <Active />
        </m.div>
      </div>
    </div>
  );
}
