import { Suspense } from "react";
import { cookies } from "next/headers";
import { hasLocale } from "next-intl";
import Link from "next/link";
import { MapPinOff } from "lucide-react";

import { routing } from "@/i18n/routing";
import { FullPageMessage } from "@/components/shared/full-page-message";
import { Button } from "@/components/ui/button";
import { errorThemeInitScript } from "@/lib/theme/appearance-cookie";
import enErrors from "@/messages/en/errors.json";
import ruErrors from "@/messages/ru/errors.json";
import "./globals.css";

/**
 * Root fallback 404 for paths that never resolve to a locale — every genuinely
 * unmatched URL lands here (the localized `[locale]/not-found.tsx` only fires on an
 * explicit `notFound()` inside a locale). Since there's no `app/layout.tsx`, Next
 * wraps this with its own default `<html>`/`<body>`; rendering our own here would
 * collide with that and break hydration, so we render only the content inside a
 * themed wrapper `<div>` (it can't theme `<html>`, which DefaultLayout owns). The
 * `<main lang>` from FullPageMessage carries the resolved content language.
 *
 * Localized per-request from next-intl's `NEXT_LOCALE` cookie. The dynamic read is
 * isolated in `<LocalizedNotFound>` inside a <Suspense> so the static shell renders
 * first (the Cache Components rule — same pattern as app/share/[token]/page.tsx).
 * The fallback is the synchronous English message: identical layout (no shift), and
 * for en / no-cookie it equals the final render, so there's no flash.
 */
type NotFoundStrings = typeof enErrors.notFound;

function NotFoundView({
  strings,
  lang,
}: {
  strings: NotFoundStrings;
  lang: string;
}) {
  return (
    <FullPageMessage
      lang={lang}
      icon={MapPinOff}
      title={strings.title}
      description={strings.body}
    >
      <Button asChild>
        <Link href="/">{strings.action}</Link>
      </Button>
    </FullPageMessage>
  );
}

export default function RootNotFound() {
  return (
    <div
      suppressHydrationWarning
      className="flex min-h-dvh flex-col bg-background text-foreground"
    >
      {/* Theme this page like the rest of the app. DefaultLayout owns <html>, so
          this can't live in <head>; as the wrapper's first child it runs during
          parse — before the message paints — applying the user's appearance + dark
          to this div, which cascades to the message. `suppressHydrationWarning`
          absorbs the script's mutations. On an in-app client-nav to a 404 the
          script doesn't re-run, but the wrapper then inherits the already-themed
          documentElement, so `bg-background` is correct either way. */}
      <script
        dangerouslySetInnerHTML={{ __html: errorThemeInitScript("parent") }}
      />
      <Suspense fallback={<NotFoundView strings={enErrors.notFound} lang="en" />}>
        <LocalizedNotFound />
      </Suspense>
    </div>
  );
}

async function LocalizedNotFound() {
  // next-intl sets NEXT_LOCALE on every middleware response, so for an authed user
  // it's the authoritative record of their chosen locale. Cookie → default ("en");
  // no Accept-Language (it would mislead an en user on a ru browser).
  const cookieLocale = (await cookies()).get("NEXT_LOCALE")?.value;
  const locale = hasLocale(routing.locales, cookieLocale)
    ? cookieLocale
    : routing.defaultLocale;
  const strings = locale === "ru" ? ruErrors.notFound : enErrors.notFound;
  return <NotFoundView strings={strings} lang={locale} />;
}
