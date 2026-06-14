"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  CalendarDays,
  ListChecks,
  ChartColumnBig,
  ChevronDown,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { SURFACE_PATHS } from "@/lib/surfaces";

const SURFACE_META = {
  "/calendar": { labelKey: "calendar", icon: CalendarDays },
  "/tasks": { labelKey: "tasks", icon: ListChecks },
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          data-app-nav
          aria-label={t("switcher.ariaLabel", { surface: activeLabel })}
          className="h-8 gap-2 pl-1 pr-2.5"
        >
          {/* The brand tile now lives inside the surface switcher, so the logo
              and the mode selector read as one control. It carries the active
              surface's icon and updates as you switch. */}
          <span className="flex size-6 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ActiveIcon className="size-4" />
          </span>
          {/* Phones: brand tile + chevron only — the header row is tight and the
              aria-label already names the active surface. */}
          <span className="hidden sm:inline">{activeLabel}</span>
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
                {isActive ? <Check className="size-4" /> : null}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
