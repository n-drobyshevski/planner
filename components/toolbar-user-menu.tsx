"use client";

import { useState, useTransition } from "react";
import { Link, getPathname } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PinInput } from "@/components/auth/pin-input";
import { ThemeToggle } from "@/components/calendar/theme-toggle";
import {
  signOutAction,
  switchAccountAction,
} from "@/app/[locale]/login/actions";
import { toPaletteColor, toPaletteInk } from "@/lib/theme/appearance";
import type { Locale } from "@/i18n/routing";
import type { Member } from "@/lib/types";

/** Theme toggle + profile menu, rendered by the shared surface header. */
export function ToolbarUserMenu({
  current,
  others = [],
}: {
  current: Member | null;
  /** The workspace's other member(s) — exactly one in practice. */
  others?: Member[];
}) {
  const t = useTranslations("nav");
  const locale = useLocale();
  // The member whose PIN we're collecting before switching (null = no dialog).
  const [pinTarget, setPinTarget] = useState<Member | null>(null);
  const [pin, setPin] = useState("");
  const [pending, startTransition] = useTransition();

  // Only members linked to an auth user can actually be switched into.
  const switchable = others.filter((m) => m.authUserId);

  function runSwitch(member: Member, pinValue: string) {
    if (pending) return;
    startTransition(async () => {
      const res = await switchAccountAction(member.id, pinValue);
      if (res && "error" in res) {
        toast.error(res.error);
        return;
      }
      // A hard navigation is the only reliable way to drop the previous
      // member's React Query caches (workspace, events, tasks, insights).
      window.location.assign(
        getPathname({ href: "/calendar", locale: locale as Locale }),
      );
    });
  }

  function onSelectSwitch(member: Member) {
    if (member.hasPin) {
      setPin("");
      setPinTarget(member);
    } else {
      runSwitch(member, "");
    }
  }

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
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              {t("userMenu.signedInAs", { name: current.name })}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
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
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Controlled as a sibling of the menu (not nested in its content) so the
          dropdown can close cleanly without a focus race. */}
      <Dialog
        open={pinTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPinTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t("userMenu.switchDialog.title", { name: pinTarget?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {t("userMenu.switchDialog.description", {
                name: pinTarget?.name ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (pinTarget) runSwitch(pinTarget, pin);
            }}
          >
            <PinInput
              value={pin}
              onChange={setPin}
              disabled={pending}
              autoFocus
            />
            <DialogFooter className="mt-4">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={pending}>
                  {t("userMenu.switchDialog.cancel")}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending || pin.length !== 8}>
                {pending
                  ? t("userMenu.switchDialog.switching")
                  : t("userMenu.switchDialog.submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
