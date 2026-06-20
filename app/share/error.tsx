"use client";

import { useEffect } from "react";
import { CalendarOff, RotateCw } from "lucide-react";

import { FullPageMessage } from "@/components/shared/full-page-message";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for the public share surface. This tree has no
 * NextIntlClientProvider (intl is mounted per-request inside the page's Suspense),
 * so a Client error boundary can't translate — the copy is English, matching the
 * surface's English-first design. Quiet by intent: it gives nothing away about the
 * calendar and offers only a reload.
 */
export default function ShareError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <FullPageMessage
      icon={CalendarOff}
      title="This calendar couldn't load"
      description="Something went wrong opening this shared calendar. Try again in a moment."
      alert
    >
      <Button onClick={reset}>
        <RotateCw data-icon="inline-start" />
        Reload
      </Button>
    </FullPageMessage>
  );
}
