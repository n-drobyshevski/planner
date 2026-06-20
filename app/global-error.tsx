"use client";

import { useEffect } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";

import { FullPageMessage } from "@/components/shared/full-page-message";
import { Button } from "@/components/ui/button";
import "./globals.css";

/**
 * Last-resort boundary: catches errors thrown by the root layout itself, so it
 * replaces that layout entirely and must render its own `<html>`/`<body>`. It
 * lives outside every provider (no intl, no theme, no fonts), so the copy is
 * hardcoded English and the page leans on the base tokens in globals.css for the
 * warm-paper surface. This is a rare screen; keep it self-contained and calm.
 */
export default function GlobalError({
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
    <html lang="en">
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <FullPageMessage
          icon={TriangleAlert}
          title="Something went wrong"
          description="The app ran into an unexpected problem. Reloading usually fixes it."
          alert
        >
          <Button onClick={reset}>
            <RotateCw data-icon="inline-start" />
            Reload
          </Button>
        </FullPageMessage>
      </body>
    </html>
  );
}
