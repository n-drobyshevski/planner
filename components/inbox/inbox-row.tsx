"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { format, formatDistance } from "date-fns";
import { tz } from "@date-fns/tz";
import {
  BedDouble,
  CalendarCheck,
  CalendarPlus,
  ChevronDown,
  SquareCheckBig,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  SleepLogFields,
  EMPTY_DRAFT,
  draftHasContent,
  type SleepLogDraft,
} from "@/components/insights/sleep/log-fields";
import { ATTRIBUTE_META } from "@/lib/attributes/schema";
import { dateInputToMs } from "@/lib/datetime/local";
import { dateFnsLocale } from "@/lib/datetime/date-locale";
import { cn } from "@/lib/utils";
import type {
  InboxItem,
  LogSleepItem,
  RateEventItem,
  RateTaskItem,
  RequestItem,
} from "@/lib/inbox/derive";

const KIND_ICON: Record<InboxItem["kind"], LucideIcon> = {
  "rate-event": CalendarCheck,
  "rate-task": SquareCheckBig,
  "log-sleep": BedDouble,
  request: CalendarPlus,
};

// The shared 4-level satisfaction control, sourced from the single attribute
// registry so the inbox poll and the event/task dialogs can never drift.
const SATISFACTION = ATTRIBUTE_META.find((m) => m.key === "satisfaction")!;

type RateItem = RateEventItem | RateTaskItem;

export function InboxRow({
  item,
  timeZone,
  now,
  onRate,
  onLogSleep,
  onApprove,
  onDecline,
}: {
  item: InboxItem;
  timeZone: string;
  now: number;
  /** Returns true on a successful write (the row then leaves via re-derivation);
   *  false re-enables the control for a retry. */
  onRate: (item: RateItem, value: 1 | 2 | 3 | 4) => Promise<boolean>;
  onLogSleep: (item: LogSleepItem, draft: SleepLogDraft) => Promise<void>;
  /** Approve a timeslot request → creates the event; true on success. */
  onApprove: (item: RequestItem) => Promise<boolean>;
  /** Decline a timeslot request; true on success. */
  onDecline: (item: RequestItem) => Promise<boolean>;
}) {
  const t = useTranslations("inbox");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const Icon = KIND_ICON[item.kind];
  const { frame, subtitle } = describe(item, t, timeZone, now, locale);

  async function rate(value: 1 | 2 | 3 | 4) {
    if (busy || item.kind === "log-sleep" || item.kind === "request") return;
    setBusy(true);
    // On success the optimistic cache patch drops this row from the derived list
    // (it unmounts); on failure the hook reverts + toasts, so re-enable to retry.
    const ok = await onRate(item, value);
    if (!ok) setBusy(false);
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? t("collapse", { title: frame }) : t("expand", { title: frame })}
        className="flex min-h-14 w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{frame}</span>
          {subtitle && (
            <span className="block truncate text-xs tabular-nums text-muted-foreground">
              {subtitle}
            </span>
          )}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="px-3 pb-4 pl-10">
          {item.kind === "request" ? (
            <RequestExpando
              item={item}
              onApprove={onApprove}
              onDecline={onDecline}
            />
          ) : item.kind === "log-sleep" ? (
            <SleepExpando
              item={item}
              onLogSleep={onLogSleep}
              saveLabel={t("saveSleep")}
            />
          ) : (
            <ToggleGroup
              type="single"
              variant="outline"
              aria-label={tc("attributes.satisfaction.label")}
              className="flex-wrap justify-start"
              disabled={busy}
              value=""
              onValueChange={(v) => v && void rate(Number(v) as 1 | 2 | 3 | 4)}
            >
              {SATISFACTION.options.map((opt) => {
                const label = tc(`attributes.satisfaction.options.${opt.value}`);
                return (
                  <ToggleGroupItem
                    key={opt.value}
                    value={opt.value}
                    aria-label={label}
                    className="min-h-11 px-3 tabular-nums pointer-fine:min-h-9"
                  >
                    {label}
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          )}
        </div>
      )}
    </li>
  );
}

/** The sleep-log form lives in its own draft state; saving leaves the row. */
function SleepExpando({
  item,
  onLogSleep,
  saveLabel,
}: {
  item: LogSleepItem;
  onLogSleep: (item: LogSleepItem, draft: SleepLogDraft) => Promise<void>;
  saveLabel: string;
}) {
  const [draft, setDraft] = useState<SleepLogDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const canSave = draftHasContent(draft) && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onLogSleep(item, draft);
      // success: the new log row re-derives this item out of the list
    } catch {
      setSaving(false); // hook already toasted the failure
    }
  }

  return (
    <div className="space-y-3">
      <SleepLogFields
        draft={draft}
        onChange={setDraft}
        idPrefix={`inbox-${item.dateKey}`}
      />
      <Button
        onClick={() => void save()}
        disabled={!canSave}
        className="min-h-11 sm:min-h-9"
      >
        {saveLabel}
      </Button>
    </div>
  );
}

/** Approve (→ create the event) or decline a public timeslot request. The row
 *  leaves via re-derivation once the request cache drops it. */
function RequestExpando({
  item,
  onApprove,
  onDecline,
}: {
  item: RequestItem;
  onApprove: (item: RequestItem) => Promise<boolean>;
  onDecline: (item: RequestItem) => Promise<boolean>;
}) {
  const t = useTranslations("inbox");
  const [busy, setBusy] = useState<null | "approve" | "decline">(null);

  async function run(action: "approve" | "decline") {
    if (busy) return;
    setBusy(action);
    const ok = await (action === "approve" ? onApprove(item) : onDecline(item));
    if (!ok) setBusy(null); // failure toasted by the hook; re-enable to retry
  }

  return (
    <div className="space-y-3">
      {item.message && (
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {item.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => void run("approve")}
          disabled={busy !== null}
          className="min-h-11 sm:min-h-9"
        >
          {t("request.approve")}
        </Button>
        <Button
          variant="outline"
          onClick={() => void run("decline")}
          disabled={busy !== null}
          className="min-h-11 sm:min-h-9"
        >
          {t("request.decline")}
        </Button>
      </div>
    </div>
  );
}

/** The localized one-line frame + (for ratings) a relative-time subtitle. */
function describe(
  item: InboxItem,
  t: ReturnType<typeof useTranslations<"inbox">>,
  timeZone: string,
  now: number,
  locale: string,
): { frame: string; subtitle: string | null } {
  const dfLocale = dateFnsLocale(locale);
  if (item.kind === "rate-event") {
    return {
      frame: t("rateEvent.frame", { title: item.titleText }),
      subtitle: t("endedAgo", {
        ago: formatDistance(item.sortMs, now, { addSuffix: true, locale: dfLocale }),
      }),
    };
  }
  if (item.kind === "rate-task") {
    return {
      frame: t("rateTask.frame", { title: item.titleText }),
      subtitle: t("doneAgo", {
        ago: formatDistance(item.sortMs, now, { addSuffix: true, locale: dfLocale }),
      }),
    };
  }
  if (item.kind === "request") {
    const name = item.requesterName?.trim();
    const day = format(item.proposedStart, "EEE d MMM", {
      in: tz(timeZone),
      locale: dfLocale,
    });
    const from = format(item.proposedStart, "HH:mm", { in: tz(timeZone), locale: dfLocale });
    const to = format(item.proposedEnd, "HH:mm", { in: tz(timeZone), locale: dfLocale });
    return {
      frame: name ? t("request.frame", { name }) : t("request.frameAnon"),
      subtitle: `${day}, ${from}–${to}`,
    };
  }
  return {
    frame: t("logSleep.frame", {
      date: format(dateInputToMs(item.dateKey, timeZone), "EEEE d MMM", {
        in: tz(timeZone),
        locale: dfLocale,
      }),
    }),
    subtitle: null,
  };
}
