import { CalendarOff } from "lucide-react";

/**
 * The calm terminal state for a share link that doesn't exist, has expired, or has
 * been revoked. Deliberately quiet and reassuring — it gives nothing away about the
 * calendar (a missing and a revoked link look identical) and offers no next step.
 */
export function PublicShareInactive() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
          <CalendarOff aria-hidden className="size-6 text-muted-foreground" />
        </span>
        <h1 className="text-base font-semibold text-foreground">
          This link is no longer active
        </h1>
        <p className="text-sm text-muted-foreground">
          The shared calendar you’re looking for has been turned off or has
          expired. Ask the person who shared it for a new link.
        </p>
      </div>
    </main>
  );
}
