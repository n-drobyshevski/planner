"use client";

import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/app/login/actions";
import type { Member } from "@/lib/types";

/**
 * The account block at the tail of every surface's phone-only `⋯` menu:
 * "Signed in as", Settings, Sign out. A fragment of menu items, so it composes
 * into any DropdownMenuContent after the surface-specific entries.
 */
export function MobileAccountSection({ current }: { current: Member | null }) {
  return (
    <>
      <DropdownMenuSeparator />
      {current && (
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          Signed in as {current.name}
        </DropdownMenuLabel>
      )}
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
    </>
  );
}
