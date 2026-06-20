"use client";

import { useEffect } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";

import { FullPageMessage } from "@/components/shared/full-page-message";
import { Button } from "@/components/ui/button";
import { errorThemeInitScript } from "@/lib/theme/appearance-cookie";
import "./globals.css";

/**
 * Last-resort boundary: catches errors thrown by the root layout itself, so it
 * replaces that layout entirely and must render its own `<html>`/`<body>`. It
 * lives outside every provider (no intl, no fonts), so the copy is hardcoded
 * English. Since it owns `<html>`, a parse-blocking `<head>` script applies the
 * user's appearance + dark before paint (next-themes isn't mounted here), so a
 * dark-mode user doesn't get a warm-paper flash on a crash. Rare screen; calm.
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: errorThemeInitScript("documentElement"),
          }}
        />
      </head>
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
