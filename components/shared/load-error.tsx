"use client";

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
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="max-w-xs space-y-1">
        <p className="text-sm font-medium text-foreground">
          We couldn&apos;t load your {subject}.
        </p>
        <p className="text-sm text-muted-foreground">
          Check your connection and try again.
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw data-icon="inline-start" />
          Try again
        </Button>
      )}
    </div>
  );
}
