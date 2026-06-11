"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  "/calendar": { label: "Calendar", icon: CalendarDays },
  "/tasks": { label: "Tasks", icon: ListChecks },
  "/insights": { label: "Insights", icon: ChartColumnBig },
} as const;

const items = SURFACE_PATHS.map((href) => ({ href, ...SURFACE_META[href] }));

/** Top-level switch between the Calendar, Tasks, and Insights surfaces. */
export function AppNav() {
  const pathname = usePathname();
  const active = items.find(({ href }) => pathname.startsWith(href)) ?? items[0];
  const ActiveIcon = active.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-app-nav
          aria-label={`Current surface: ${active.label}. Switch surface`}
        >
          <ActiveIcon className="size-4" />
          <span>{active.label}</span>
          <ChevronDown
            data-icon="inline-end"
            className="size-4 text-muted-foreground"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        {items.map(({ href, label, icon: Icon }) => {
          const isActive = active.href === href;
          return (
            <DropdownMenuItem key={href} asChild>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn("gap-1.5", isActive && "font-medium")}
              >
                <Icon className="size-4" />
                <span className="flex-1">{label}</span>
                {isActive ? <Check className="size-4" /> : null}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
