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

/**
 * Shown when the selected period has no tracked time. Tabs can override the
 * copy to say what *they* would show; the calendar CTA stays — scheduling
 * something is the fix in every case.
 */
export function InsightsEmpty({
  title = "No tracked time in this period",
  description = "Insights count timed events from your calendar. Schedule something in this range — or pick a different period — to see where your time goes.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ChartColumnBig />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" size="sm" asChild>
          <Link href="/calendar">Open the calendar</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
