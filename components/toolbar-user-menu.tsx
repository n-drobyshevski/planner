"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { LogOut, Settings } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/calendar/theme-toggle";
import { signOutAction } from "@/app/[locale]/login/actions";
import { toPaletteColor, toPaletteInk } from "@/lib/theme/appearance";
import type { Member } from "@/lib/types";

/** Theme toggle + profile menu, rendered by the shared surface header. */
export function ToolbarUserMenu({ current }: { current: Member | null }) {
  const t = useTranslations("nav");
  return (
    <>
      <ThemeToggle />
      {/* The avatar's footprint is reserved while the workspace query resolves
          so the header row doesn't shift when it lands. */}
      {!current && <span aria-hidden className="size-8" />}
      {current && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              aria-label={t("userMenu.ariaLabel")}
            >
              <Avatar className="size-8">
                <AvatarFallback
                  style={{ backgroundColor: toPaletteColor(current.color), color: toPaletteInk(current.color) }}
                  className="text-sm font-semibold"
                >
                  {current.name.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>
              {t("userMenu.signedInAs", { name: current.name })}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings data-icon="inline-start" />
                  {t("userMenu.settings")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  void signOutAction();
                }}
              >
                <LogOut data-icon="inline-start" />
                {t("userMenu.signOut")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}
