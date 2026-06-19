"use client";

import { useState } from "react";
import { toast } from "sonner";

import { combineDateTime, msToDateInput, msToTimeInput } from "@/lib/datetime/local";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
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
      toast.error("The end time must be after the start time.");
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
      toast.error(data?.error || "Couldn't send your request. Please try again.");
    } catch {
      toast.error("Couldn't send your request. Please check your connection.");
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
              <DialogTitle>Request sent</DialogTitle>
              <DialogDescription>
                Thanks — your proposed time has been sent. It’s up to the calendar’s
                owner to accept or decline.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Request a time</DialogTitle>
              <DialogDescription>
                Propose a time that works for you. The owner decides whether to
                accept it.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="req-name">Your name (optional)</Label>
                <Input
                  id="req-name"
                  value={name}
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="So they know who’s asking"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="req-date">Date</Label>
                <DatePicker
                  id="req-date"
                  value={date}
                  onChange={setDate}
                  aria-label="Requested date"
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="req-start">From</Label>
                  <Input
                    id="req-start"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="req-end">To</Label>
                  <Input
                    id="req-end"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="req-message">Message (optional)</Label>
                <Textarea
                  id="req-message"
                  value={message}
                  maxLength={1000}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What’s it about?"
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
                Cancel
              </Button>
              <Button onClick={() => void submit()} disabled={busy}>
                {busy ? "Sending…" : "Send request"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
