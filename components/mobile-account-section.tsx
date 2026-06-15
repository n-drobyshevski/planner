"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { LogOut, Settings } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/app/[locale]/login/actions";
import { toPaletteColor, toPaletteInk } from "@/lib/theme/appearance";
import type { Member } from "@/lib/types";

/**
 * The account block at the tail of every surface's phone-only `⋯` menu:
 * "Signed in as", switch-account entries, Settings, Sign out. A fragment of menu
 * items, so it composes into any DropdownMenuContent after the surface-specific
 * entries. The switch handler + PIN dialog come from `useAccountSwitch`, called by
 * the parent menu so the dialog can render outside (and survive) the dropdown.
 */
export function MobileAccountSection({
  current,
  switchable,
  onSelectSwitch,
  pending,
}: {
  current: Member | null;
  switchable: Member[];
  onSelectSwitch: (member: Member) => void;
  pending: boolean;
}) {
  const t = useTranslations("nav");
  return (
    <>
      <DropdownMenuSeparator />
      {current && (
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          {t("userMenu.signedInAs", { name: current.name })}
        </DropdownMenuLabel>
      )}
      {switchable.map((member) => (
        <DropdownMenuItem
          key={member.id}
          disabled={pending}
          onSelect={() => onSelectSwitch(member)}
        >
          <Avatar className="size-5">
            <AvatarFallback
              style={{ backgroundColor: toPaletteColor(member.color), color: toPaletteInk(member.color) }}
              className="text-[0.625rem] font-semibold"
            >
              {member.name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {t("userMenu.switchTo", { name: member.name })}
        </DropdownMenuItem>
      ))}
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
    </>
  );
}
