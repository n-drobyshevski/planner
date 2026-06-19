"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { CheckCheck } from "lucide-react";

import {
  TimezoneProvider,
  useViewerTimeZone,
} from "@/lib/datetime/timezone-context";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import { useInboxItems } from "@/lib/hooks/use-inbox";
import { useEventMutations } from "@/lib/hooks/use-event-mutations";
import { useTaskMutations } from "@/lib/hooks/use-task-mutations";
import { useUpsertSleepLog } from "@/lib/hooks/use-sleep-logs";
import { useTimeslotRequests } from "@/lib/hooks/use-timeslot-requests";
import { setAttribute } from "@/lib/attributes/schema";
import {
  draftToInstants,
  type SleepLogDraft,
} from "@/components/insights/sleep/log-fields";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { InboxSkeleton } from "@/components/shared/surface-skeletons";
import { InboxRow } from "./inbox-row";
import type {
  LogSleepItem,
  RateEventItem,
  RateTaskItem,
  RequestItem,
} from "@/lib/inbox/derive";

const emptySubscribe = () => () => {};

/** The timezone context is mounted per surface (the calendar/insights shells do
 *  the same); the inbox reads the member's zone through it. */
export function InboxShell() {
  return (
    <TimezoneProvider>
      <InboxShellInner />
    </TimezoneProvider>
  );
}

function InboxShellInner() {
  const t = useTranslations("inbox");
  const timeZone = useViewerTimeZone();
  const { data: ws } = useWorkspace();
  const wsId = ws?.workspaceId;
  const viewerId = ws?.currentMember?.id;
  const { items, isLoading } = useInboxItems();
  // A mount-time "now" for the relative-time subtitles ("2 hours ago"). It need
  // not tick; the rows are short-lived (you resolve them).
  const [now] = useState(() => Date.now());

  // SSR has no member data; paint the frame, fill in after mount (shell pattern).
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  const events = useEventMutations(wsId);
  const tasks = useTaskMutations(wsId);
  const upsertSleep = useUpsertSleepLog(wsId, viewerId);
  const requests = useTimeslotRequests(wsId);

  // Merge the picked satisfaction into the entity's existing attribute bag and
  // write it through the optimistic mutation; the cache patch drops the row.
  const onRate = useCallback(
    (item: RateEventItem | RateTaskItem, value: 1 | 2 | 3 | 4): Promise<boolean> => {
      const next = setAttribute(item.attributes, "satisfaction", value);
      return item.kind === "rate-event"
        ? events.updateSingle(
            item.eventId,
            { attributes: next },
            { attributes: item.attributes },
            { attributes: next },
          )
        : tasks.update(
            item.taskId,
            { attributes: next },
            { attributes: item.attributes },
            { attributes: next },
          );
    },
    [events, tasks],
  );

  // Approve a public timeslot request → create the event at the proposed time
  // (owned by the approving member), then mark the request approved. Both steps
  // must land for the row to leave; the event create toasts on its own failure.
  const onApprove = useCallback(
    async (item: RequestItem): Promise<boolean> => {
      if (!wsId || !viewerId) return false;
      const created = await events.create({
        workspaceId: wsId,
        ownerId: viewerId,
        title: item.requesterName?.trim() || t("request.defaultTitle"),
        description: item.message ?? null,
        start: item.proposedStart,
        end: item.proposedEnd,
        timeZone,
      });
      if (!created) return false;
      return requests.markApproved(item.requestId);
    },
    [events, requests, wsId, viewerId, timeZone, t],
  );

  const onDecline = useCallback(
    (item: RequestItem) => requests.markDeclined(item.requestId),
    [requests],
  );

  const onLogSleep = useCallback(
    async (item: LogSleepItem, draft: SleepLogDraft) => {
      const { bedtimeAt, wokeAt } = draftToInstants(draft, item.dateKey, timeZone);
      await upsertSleep({
        date: item.dateKey,
        bedtimeAt,
        wokeAt,
        quality: draft.quality,
        fatigue: draft.fatigue,
        note: draft.note.trim() || null,
      });
    },
    [upsertSleep, timeZone],
  );

  if (!mounted || isLoading) return <InboxSkeleton />;

  return (
    <div className="mx-auto w-full max-w-2xl p-3 sm:p-4">
      <header className="mb-4 px-1">
        <h1 className="text-base font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        <p className="sr-only" aria-live="polite">
          {t("srCount", { count: items.length })}
        </p>
      </header>

      {items.length === 0 ? (
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckCheck />
            </EmptyMedia>
            <EmptyTitle>{t("allCaughtUp")}</EmptyTitle>
            <EmptyDescription>{t("allCaughtUpHint")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul
          role="list"
          className="divide-y divide-border overflow-hidden rounded-xl border bg-card"
        >
          {items.map((item) => (
            <InboxRow
              key={item.id}
              item={item}
              timeZone={timeZone}
              now={now}
              onRate={onRate}
              onLogSleep={onLogSleep}
              onApprove={onApprove}
              onDecline={onDecline}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
