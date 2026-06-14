"use client";

import { ChartColumnBig } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
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
  title,
  description,
}: {
  title?: string;
  description?: string;
}) {
  const t = useTranslations("insights");
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ChartColumnBig />
        </EmptyMedia>
        <EmptyTitle>{title ?? t("empty.title")}</EmptyTitle>
        <EmptyDescription>{description ?? t("empty.description")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" size="sm" asChild>
          <Link href="/calendar">{t("empty.openCalendar")}</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

/**
 * In-section placeholder for a card that has nothing to show YET. Always says
 * what would populate it ("Log 3 more nights to unlock this") instead of
 * rendering a blank box; optional deep link to the place where that happens.
 */
export function SectionEmpty({
  children,
  actionLabel,
  actionHref,
}: {
  children: React.ReactNode;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-3">
      <p className="text-xs text-muted-foreground">{children}</p>
      {actionLabel && actionHref && (
        <Button variant="ghost" size="sm" className="min-h-11 px-1.5 text-xs sm:min-h-7" asChild>
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  );
}
