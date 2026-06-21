"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  CalendarDays,
  ListChecks,
  Inbox,
  ChartColumnBig,
  ChevronDown,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { SURFACE_PATHS } from "@/lib/surfaces";
import { useInboxCount } from "@/lib/hooks/use-inbox";

const SURFACE_META = {
  "/calendar": { labelKey: "calendar", icon: CalendarDays },
  "/tasks": { labelKey: "tasks", icon: ListChecks },
  "/inbox": { labelKey: "inbox", icon: Inbox },
  "/insights": { labelKey: "insights", icon: ChartColumnBig },
} as const;

const items = SURFACE_PATHS.map((href) => ({ href, ...SURFACE_META[href] }));

/** Top-level switch between the Calendar, Tasks, and Insights surfaces. */
export function AppNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const active = items.find(({ href }) => pathname.startsWith(href)) ?? items[0];
  const ActiveIcon = active.icon;
  const activeLabel = t(`surface.${active.labelKey}`);
  // A small red (destructive-token) notification pip on the closed trigger. The
  // exact count lives on the Inbox row of the open menu, and is folded into the
  // trigger's aria-label so the signal is never color/shape alone.
  const inboxCount = useInboxCount();
  const inboxLabel = inboxCount > 0 ? t("inboxCount", { count: inboxCount }) : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          data-app-nav
          aria-label={[
            t("switcher.ariaLabel", { surface: activeLabel }),
            inboxLabel,
          ]
            .filter(Boolean)
            .join(". ")}
          className="h-8 gap-1 px-1.5"
        >
          {/* The brand tile now lives inside the surface switcher, so the logo
              and the mode selector read as one control. It carries the active
              surface's icon and updates as you switch. The closed trigger is
              icon-only — the open menu and the aria-label both name the surface,
              so the label text would only be redundant chrome here. */}
          <span className="relative flex size-6 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ActiveIcon className="size-4" />
            {/* A red pip (theme-aware --destructive token) signals a waiting
                inbox item when you're elsewhere. The exact count stays on the
                Inbox row in the open menu; the count is also folded into the
                trigger's aria-label, so this dot is decorative for screen
                readers. The background ring lifts it off both the tile and the
                paper toolbar where it overflows the corner. */}
            {inboxCount > 0 && active.href !== "/inbox" && (
              <span
                aria-hidden
                className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-destructive ring-2 ring-background"
              />
            )}
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        {items.map(({ href, labelKey, icon: Icon }) => {
          const isActive = active.href === href;
          return (
            <DropdownMenuItem key={href} asChild>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn("gap-1.5", isActive && "font-medium")}
              >
                <Icon className="size-4" />
                <span className="flex-1">{t(`surface.${labelKey}`)}</span>
                {href === "/inbox" && inboxCount > 0 && (
                  <Badge
                    variant="secondary"
                    aria-label={inboxLabel}
                    className="tabular-nums"
                  >
                    {inboxCount}
                  </Badge>
                )}
                {isActive ? <Check className="size-4" /> : null}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
