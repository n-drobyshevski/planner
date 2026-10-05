"use client";

import { useSyncExternalStore } from "react";

import { buttonVariants } from "@/components/ui/button";
import { buildCallbackIntentUrl } from "@/lib/android/callback-intent";
import { cn } from "@/lib/utils";

const noSubscribe = () => () => {};

/**
 * "Open Planr": re-delivers this callback to the app via an `intent://` URL
 * when the browser didn't hand the App Link over by itself. The query is read
 * here in the browser, so the page itself stays static and the code is never
 * sent anywhere but the app. Renders nothing on the server, and nothing when
 * the URL has no code or error to finish.
 */
export function OpenAppButton({ label, packageName }: { label: string; packageName: string }) {
  const href = useSyncExternalStore(
    noSubscribe,
    () =>
      buildCallbackIntentUrl(
        window.location.host,
        window.location.pathname,
        window.location.search,
        packageName,
      ),
    () => null,
  );
  if (!href) return null;
  return (
    <a href={href} className={cn(buttonVariants({ size: "lg" }), "mt-1 h-11 w-full max-w-60")}>
      {label}
    </a>
  );
}
