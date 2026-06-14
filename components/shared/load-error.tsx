"use client";

import { useTranslations } from "next-intl";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The shared "couldn't load" state for the calendar and task data queries. Human,
 * connection-framed copy with a Retry — the technical hint (fresh DB needs its
 * schema applied + seeded) is logged to the console by the caller, not shown
 * here. `subject` is the thing that failed to load ("calendar" / "tasks").
 */
export function LoadError({
  subject,
  onRetry,
}: {
  subject: string;
  onRetry?: () => void;
}) {
  const t = useTranslations("nav");
  return (
    <div
      role="alert"
      className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <div className="max-w-xs space-y-1">
        <p className="text-sm font-medium text-foreground">
          {t("loadError.title", { subject })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("loadError.body")}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw data-icon="inline-start" />
          {t("loadError.retry")}
        </Button>
      )}
    </div>
  );
}
