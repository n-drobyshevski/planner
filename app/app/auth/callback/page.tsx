import type { Metadata } from "next";
import Link from "next/link";
import { Smartphone } from "lucide-react";

import { DEFAULT_ANDROID_PACKAGE_NAME } from "@/lib/android/asset-links";
import enMessages from "@/messages/en";
import ruMessages from "@/messages/ru";

import { OpenAppButton } from "./open-app-button";

/**
 * Fallback for the Android app's OAuth redirect, `/app/auth/callback`. Normally
 * the verified App Link hands this URL straight to Planr for Android and the
 * browser never loads it; it renders when the browser keeps links to itself
 * (Firefox, unless "Open links in apps" is on), link verification hasn't run
 * yet, or the app isn't installed. Its "Open Planr" button re-delivers the
 * callback to the app explicitly (see lib/android/callback-intent.ts).
 *
 * SECURITY: the URL carries a one-time authorization `code` (and `state`). The
 * server never reads `searchParams` — nothing is exchanged, logged or stored —
 * so it's a fully static page with no request-time work at all. Only the button,
 * in the browser, reads the query, and it hands it to the app's package alone.
 * The code is useless without the app's PKCE verifier and expires within minutes.
 *
 * Bilingual rather than negotiated: reading the locale cookie/Accept-Language
 * would make the page dynamic for a screen almost nobody sees, so it shows both
 * catalogs' copy, each block marked with its own `lang`.
 */
export const metadata: Metadata = {
  title: enMessages.consent.appCallback.metaTitle,
};

/** Read at build time (the page is prerendered); see docs/android.md. */
const PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME?.trim() || DEFAULT_ANDROID_PACKAGE_NAME;

const BLOCKS = [
  { lang: "en", copy: enMessages.consent.appCallback },
  { lang: "ru", copy: ruMessages.consent.appCallback },
] as const;

export default function AppAuthCallbackPage() {
  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center text-balance">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Smartphone aria-hidden className="size-6 text-muted-foreground" />
        </span>
        {BLOCKS.map(({ lang, copy }, index) => (
          <section
            key={lang}
            lang={lang}
            className={
              index > 0
                ? "mt-3 flex flex-col items-center gap-2 border-t border-border pt-5"
                : "flex flex-col items-center gap-2"
            }
          >
            {index === 0 ? (
              <h1 className="text-base font-semibold text-foreground">{copy.title}</h1>
            ) : (
              <h2 className="text-base font-semibold text-foreground">{copy.title}</h2>
            )}
            <p className="text-sm text-pretty text-muted-foreground">{copy.body}</p>
            <OpenAppButton label={copy.openApp} packageName={PACKAGE_NAME} />
            <p className="text-xs text-muted-foreground">{copy.note}</p>
            {/* `/` lives under another root layout, so this is a full navigation;
                the target carries no query, so the code is left behind. */}
            <Link
              href="/"
              prefetch={false}
              className="mt-1 text-sm font-medium text-foreground underline underline-offset-4"
            >
              {copy.goToCalendar}
            </Link>
          </section>
        ))}
      </div>
    </main>
  );
}
