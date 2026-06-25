"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { combineDateTime, msToDateInput, msToTimeInput } from "@/lib/datetime/local";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { TimeField } from "@/components/ui/time-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Propose a timeslot on a public share link. Posts to the unauthenticated,
 * rate-limited API route (app/api/share/[token]/request) — the only public write.
 * On success the owner sees the request in their Inbox; the requester just gets a
 * calm confirmation. Names/messages are optional; the owner may not know who's asking.
 */
export function PublicRequestDialog({
  token,
  open,
  onOpenChange,
  timeZone,
  prefillStart,
  prefillEnd,
}: {
  token: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timeZone: string;
  /**
   * Optional epoch-ms range to seed the form with — e.g. a slot the viewer drew
   * on the public calendar. Absent → today, 09:00–10:00 (the manual-button path).
   * The parent remounts this dialog via `key` so a fresh gesture re-seeds these
   * initializers; the fields stay fully editable afterwards.
   */
  prefillStart?: number;
  prefillEnd?: number;
}) {
  const t = useTranslations("share");
  const [name, setName] = useState("");
  const [date, setDate] = useState(() =>
    msToDateInput(prefillStart ?? Date.now(), timeZone),
  );
  const [startTime, setStartTime] = useState(() =>
    prefillStart != null ? msToTimeInput(prefillStart, timeZone) : "09:00",
  );
  const [endTime, setEndTime] = useState(() =>
    prefillEnd != null ? msToTimeInput(prefillEnd, timeZone) : "10:00",
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  function reset() {
    setName("");
    setMessage("");
    setDone(false);
    setBusy(false);
  }

  async function submit() {
    if (busy) return;
    const start = combineDateTime(date, startTime, timeZone);
    const end = combineDateTime(date, endTime, timeZone);
    if (!(end > start)) {
      toast.error(t("errors.endAfterStart"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/share/${token}/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          message: message.trim() || undefined,
          start,
          end,
        }),
      });
      if (res.ok) {
        setDone(true);
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.error(data?.error || t("errors.send"));
    } catch {
      toast.error(t("errors.network"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("success.title")}</DialogTitle>
              <DialogDescription>{t("success.body")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>
                {t("success.close")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("dialog.title")}</DialogTitle>
              <DialogDescription>{t("dialog.description")}</DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="req-name">{t("dialog.nameLabel")}</Label>
                <Input
                  id="req-name"
                  value={name}
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("dialog.namePlaceholder")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="req-date">{t("dialog.dateLabel")}</Label>
                <DatePicker
                  id="req-date"
                  value={date}
                  onChange={setDate}
                  aria-label={t("dialog.dateAria")}
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="req-start">{t("dialog.fromLabel")}</Label>
                  <TimeField
                    id="req-start"
                    value={startTime}
                    onChange={setStartTime}
                    aria-label={t("dialog.fromLabel")}
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="req-end">{t("dialog.toLabel")}</Label>
                  <TimeField
                    id="req-end"
                    value={endTime}
                    onChange={setEndTime}
                    aria-label={t("dialog.toLabel")}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="req-message">{t("dialog.messageLabel")}</Label>
                <Textarea
                  id="req-message"
                  value={message}
                  maxLength={1000}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("dialog.messagePlaceholder")}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                {t("dialog.cancel")}
              </Button>
              <Button onClick={() => void submit()} disabled={busy}>
                {busy ? t("dialog.sending") : t("dialog.send")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
