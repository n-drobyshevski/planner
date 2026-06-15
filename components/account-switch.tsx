"use client";

import { type ReactNode, useState, useTransition } from "react";
import { getPathname } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { switchAccountAction } from "@/app/[locale]/login/actions";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import type { Locale } from "@/i18n/routing";
import type { Member } from "@/lib/types";

export interface AccountSwitch {
  /** Workspace members the session can switch into (auth-linked, not current). */
  switchable: Member[];
  /** Begin a switch: opens the PIN dialog when the target has a PIN, else now. */
  onSelectSwitch: (member: Member) => void;
  /** True while a switch is in flight (disable the triggers). */
  pending: boolean;
  /** The PIN prompt — render as a SIBLING of the menu, never inside it. */
  dialog: ReactNode;
}

/**
 * Account-switching shared by the desktop profile menu and the phone-only `⋯`
 * menus. The PIN `dialog` is returned separately so callers render it outside the
 * dropdown: selecting a menu item closes (unmounts) the dropdown, which would tear
 * a nested dialog down mid-flow.
 */
export function useAccountSwitch(): AccountSwitch {
  const t = useTranslations("nav");
  const locale = useLocale();
  const { data } = useWorkspace();
  const current = data?.currentMember ?? null;
  // Only members linked to an auth user (and not the current one) can be switched
  // into.
  const switchable = (data?.members ?? []).filter(
    (m) => m.id !== current?.id && m.authUserId,
  );

  // The member whose PIN we're collecting before switching (null = no dialog).
  const [pinTarget, setPinTarget] = useState<Member | null>(null);
  const [pin, setPin] = useState("");
  const [pending, startTransition] = useTransition();

  function runSwitch(member: Member, pinValue: string) {
    if (pending) return;
    startTransition(async () => {
      const res = await switchAccountAction(member.id, pinValue);
      if (res && "error" in res) {
        toast.error(res.error);
        return;
      }
      // A hard navigation is the only reliable way to drop the previous member's
      // React Query caches (workspace, events, tasks, insights).
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

  const dialog = (
    // Controlled as a sibling of the menu (not nested in its content) so the
    // dropdown can close cleanly without a focus race.
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
            {t("userMenu.switchDialog.description", { name: pinTarget?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (pinTarget) runSwitch(pinTarget, pin);
          }}
        >
          <PinInput value={pin} onChange={setPin} disabled={pending} autoFocus />
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
  );

  return { switchable, onSelectSwitch, pending, dialog };
}
