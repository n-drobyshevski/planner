"use client";

import Link from "next/link";
import { ChartColumnBig } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/** Shown when the selected period has no tracked time at all. */
export function InsightsEmpty() {
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ChartColumnBig />
        </EmptyMedia>
        <EmptyTitle>No tracked time in this period</EmptyTitle>
        <EmptyDescription>
          Insights count timed events from your calendar. Schedule something in
          this range — or pick a different period — to see where your time goes.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" size="sm" asChild>
          <Link href="/calendar">Open the calendar</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
