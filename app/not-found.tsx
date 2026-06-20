import Link from "next/link";
import { MapPinOff } from "lucide-react";

import { FullPageMessage } from "@/components/shared/full-page-message";
import { Button } from "@/components/ui/button";
import "./globals.css";

/**
 * Root fallback 404 for paths that never resolve to a locale (e.g. an invalid
 * locale rejected by the locale layout, which has no parent layout to wrap it).
 * Renders its own `<html>`/`<body>` and stays English, since there is no intl
 * context this far out. A plain `/` link lets the proxy route the visitor home.
 */
export default function RootNotFound() {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <FullPageMessage
          icon={MapPinOff}
          title="Page not found"
          description="We couldn't find that page. It may have moved."
        >
          <Button asChild>
            <Link href="/">Go to calendar</Link>
          </Button>
        </FullPageMessage>
      </body>
    </html>
  );
}
