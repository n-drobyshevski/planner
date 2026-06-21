"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { KeyRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/lib/hooks/use-profile";
import { browserSupportsWebAuthn } from "@/lib/auth/passkey-client";
import {
  isPasskeyNudgeDismissed,
  dismissPasskeyNudge,
} from "@/lib/auth/passkey-nudge-state";
import { fadeRise } from "@/lib/motion";

/**
 * A quiet, dismissible invitation to set up a passkey, shown after login to a
 * member who has none. Floats over the surface (fixed, no layout flow) so it
 * never pushes the schedule — the product register asks the tool to disappear,
 * so this stays a one-line nudge, not a modal. Renders nothing unless the member
 * is resolved with `hasPasskey === false`, the browser supports WebAuthn, and it
 * hasn't been dismissed this session (dismissal resets on the next sign-in).
 * Lives only in the (surfaces) shell, so it never appears on /login or /settings.
 */
export function PasskeyNudge() {
  const t = useTranslations("auth");
  const { member, isReady, enrollPasskey } = useProfile();
  const [supported, setSupported] = useState(false);
  // Delayed so the first paint lands on the schedule, not the nudge.
  const [revealed, setRevealed] = useState(false);
  // Default hidden until the per-member dismissal is read (avoids a flash).
  const [dismissed, setDismissed] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => setSupported(browserSupportsWebAuthn()), []);

  useEffect(() => {
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(() => setRevealed(true), {
        timeout: 1200,
      });
      return () => window.cancelIdleCallback?.(id);
    }
    const tm = setTimeout(() => setRevealed(true), 800);
    return () => clearTimeout(tm);
  }, []);

  useEffect(() => {
    setDismissed(member ? isPasskeyNudgeDismissed(member.id) : true);
  }, [member]);

  const visible =
    isReady &&
    !!member &&
    member.hasPasskey === false &&
    supported &&
    revealed &&
    !dismissed;

  const handleDismiss = () => {
    if (member) dismissPasskeyNudge(member.id);
    setDismissed(true);
  };

  const handleAdd = () => {
    setBusy(true);
    void enrollPasskey().then((res) => {
      setBusy(false);
      if ("ok" in res) toast.success(t("passkeyNudge.added"));
      else if ("error" in res) toast.error(res.error);
      // A cancelled ceremony resolves silently; leave the nudge for another try.
    });
  };

  return (
    <AnimatePresence>
      {visible && (
        <m.aside
          variants={fadeRise}
          initial="initial"
          animate="animate"
          exit="exit"
          role="region"
          aria-label={t("passkeyNudge.title")}
          className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] z-40 rounded-xl border bg-card text-card-foreground shadow-soft sm:inset-x-auto sm:bottom-4 sm:left-4 sm:max-w-sm"
        >
          <div className="flex gap-3 p-4">
            <KeyRound className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">{t("passkeyNudge.title")}</p>
                <button
                  type="button"
                  onClick={handleDismiss}
                  disabled={busy}
                  aria-label={t("passkeyNudge.dismiss")}
                  className="-mt-1 -mr-1 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("passkeyNudge.description")}
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="ghost" onClick={handleDismiss} disabled={busy}>
                  {t("passkeyNudge.notNow")}
                </Button>
                <Button onClick={handleAdd} disabled={busy}>
                  {busy ? t("passkeyNudge.adding") : t("passkeyNudge.add")}
                </Button>
              </div>
            </div>
          </div>
        </m.aside>
      )}
    </AnimatePresence>
  );
}
