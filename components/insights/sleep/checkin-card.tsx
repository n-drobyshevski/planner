"use client";

import { useState } from "react";
import { Sunrise, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SleepLogInput } from "@/lib/supabase/mappers";
import type { DerivedNight } from "@/lib/sleep/derive";
import { msToTimeInput } from "@/lib/datetime/local";
import {
  draftHasContent,
  draftToInstants,
  EMPTY_DRAFT,
  SleepLogFields,
  type SleepLogDraft,
} from "./log-fields";

// One dismissal per local day, viewer-scoped: the stored value is the last
// dismissed wake-date key. The parent remounts this card per (viewer, day),
// so the lazy initializer below re-reads storage exactly when it should —
// no setState-in-effect (and the tab chunk is ssr:false, so no hydration risk).
const STORAGE_PREFIX = "planner:sleep:checkin:v1:";

function readLastDismissed(storageKey: string): string | null {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

/**
 * Morning check-in for today's wake date. The parent only renders it when no
 * log exists for today; saving upserts the log (which hides the card), and
 * dismissing hides it until tomorrow.
 */
export function CheckinCard({
  viewerId,
  todayKey,
  timeZone,
  derivedToday,
  onSave,
}: {
  viewerId: string;
  todayKey: string;
  timeZone: string;
  /** today's derived night, for prefilling the time fields */
  derivedToday: DerivedNight | null;
  onSave: (input: Omit<SleepLogInput, "workspaceId" | "memberId">) => Promise<void>;
}) {
  const storageKey = `${STORAGE_PREFIX}${viewerId}`;
  const [dismissed, setDismissed] = useState(
    () => readLastDismissed(storageKey) === todayKey,
  );
  const [draft, setDraft] = useState<SleepLogDraft>(() => ({
    ...EMPTY_DRAFT,
    bedtime:
      derivedToday?.start != null ? msToTimeInput(derivedToday.start, timeZone) : "",
    wake: derivedToday?.end != null ? msToTimeInput(derivedToday.end, timeZone) : "",
  }));
  const [saving, setSaving] = useState(false);

  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, todayKey);
    } catch {
      /* private mode — the dismissal still applies for this mount */
    }
  }

  async function save() {
    setSaving(true);
    try {
      const { bedtimeAt, wokeAt } = draftToInstants(draft, todayKey, timeZone);
      await onSave({
        date: todayKey,
        bedtimeAt,
        wokeAt,
        quality: draft.quality,
        fatigue: draft.fatigue,
        note: draft.note.trim() === "" ? null : draft.note.trim(),
      });
    } catch {
      /* the mutation hook already toasted; keep the card open to retry */
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-label="Morning check-in"
      className="rounded-lg border bg-card p-3 shadow-soft"
    >
      <div className="flex items-start gap-3">
        <Sunrise aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">Good morning — how did you sleep?</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A few seconds now sharpens your sleep hints. Everything is optional
            and stays private to you.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="-mt-1 -mr-1 size-11 shrink-0 text-muted-foreground sm:size-8"
          onClick={dismiss}
          aria-label="Dismiss the morning check-in for today"
        >
          <X />
        </Button>
      </div>
      <div className="mt-3">
        <SleepLogFields draft={draft} onChange={setDraft} idPrefix="checkin" />
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          onClick={() => void save()}
          disabled={saving || !draftHasContent(draft)}
        >
          {saving ? "Saving…" : "Save check-in"}
        </Button>
      </div>
    </section>
  );
}
