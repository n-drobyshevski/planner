"use client";

import Link from "next/link";
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
import { signOutAction } from "@/app/login/actions";
import { toPaletteColor, toPaletteInk } from "@/lib/theme/appearance";
import type { Member } from "@/lib/types";

/** Theme toggle + profile menu, shared by the calendar and tasks toolbars. */
export function ToolbarUserMenu({ current }: { current: Member | null }) {
  return (
    <>
      <ThemeToggle />
      {current && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              aria-label="Profile menu"
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
            <DropdownMenuLabel>Signed in as {current.name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings data-icon="inline-start" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  void signOutAction();
                }}
              >
                <LogOut data-icon="inline-start" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}
