import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "planner";
import { CalendarPlus, Inbox } from "lucide-react";

export function NoEvents() {
  return (
    <Empty className="w-80 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CalendarPlus />
        </EmptyMedia>
        <EmptyTitle>Nothing planned yet</EmptyTitle>
        <EmptyDescription>
          Saturday is wide open. Add the first thing you and Sam want to do.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <span className="inline-flex h-9 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-medium text-primary-foreground">
          <CalendarPlus className="size-4" /> Add an event
        </span>
      </EmptyContent>
    </Empty>
  );
}

export function EmptyInbox() {
  return (
    <Empty className="w-80 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox />
        </EmptyMedia>
        <EmptyTitle>All caught up</EmptyTitle>
        <EmptyDescription>
          No tasks waiting. Mara cleared the last one this morning.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
