import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";

import { createPublicClient } from "@/lib/supabase/anon";
import { fetchPublicShareMeta } from "@/lib/supabase/queries";
import { PublicCalendarView } from "@/components/share/public-calendar-view";
import { PublicShareInactive } from "@/components/share/public-share-inactive";
import {
  resolveShareLocale,
  SHARE_LOCALE_COOKIE,
  type ShareLocale,
} from "@/lib/i18n/share-locale";
import enMessages from "@/messages/en";
import ruMessages from "@/messages/ru";

// SECURITY / FRESHNESS: a share link's validity must always be evaluated live — a
// revoked or expired token has to stop serving immediately, so nothing here is
// cached. Under Cache Components the page is dynamic by construction (it awaits
// `params`/`cookies`/`headers` + makes an uncached per-token RPC); the dynamic
// work is isolated inside a <Suspense> boundary so the static chrome (the layout
// shell) renders first (a `dynamic = "force-dynamic"` export is both unnecessary
// and rejected when cacheComponents is on).
//
// i18n: the share tree sits OUTSIDE `[locale]`, so next-intl's middleware never
// runs for it and there's no provider from the layout. We resolve the locale
// ourselves (cookie → Accept-Language → Russian; see lib/i18n/share-locale) and
// mount a `NextIntlClientProvider` with the matching catalog — the reused calendar
// leaves read it via `useLocale`/`useTranslations`, so their dates and labels
// localise for free. `timeZone` is inert here (the calendar formats with date-fns
// in the viewer's own zone, not via next-intl).

/** cookie + Accept-Language → the active share locale ("en" | "ru"). */
async function resolveLocale(): Promise<ShareLocale> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  return resolveShareLocale(
    cookieStore.get(SHARE_LOCALE_COOKIE)?.value,
    headerList.get("accept-language"),
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  const t = await getTranslations({ locale, namespace: "share" });
  return {
    title: t("meta.title"),
    description: t("meta.description"),
    // A public link should never be indexed.
    robots: { index: false, follow: false },
  };
}

export default function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  // Runtime data (cookies/headers/params) is read INSIDE the boundary, in
  // <ShareBody>, so the static layout shell streams first — reading it here would
  // make the whole route blocking (a Cache Components error). The fallback's
  // sr-only label uses the surface's default-locale (Russian) string: it's
  // momentary and locale-neutral resolution isn't available before the boundary.
  return (
    <Suspense fallback={<ShareLoading label={ruMessages.share.loading} />}>
      <ShareBody params={params} />
    </Suspense>
  );
}

async function ShareBody({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const locale = await resolveLocale();
  const messages = locale === "ru" ? ruMessages : enMessages;
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <ShareContent params={params} locale={locale} />
    </NextIntlClientProvider>
  );
}

async function ShareContent({
  params,
  locale,
}: {
  params: Promise<{ token: string }>;
  locale: ShareLocale;
}) {
  const { token } = await params;
  // The anon client can only reach the public_* SECURITY DEFINER RPCs; the meta
  // call returns null for an unknown token and active=false for a revoked/expired one.
  const meta = await fetchPublicShareMeta(createPublicClient(), token).catch(
    () => null,
  );

  if (!meta || !meta.active) {
    return <PublicShareInactive locale={locale} />;
  }
  return (
    <PublicCalendarView token={token} label={meta.label} mode={meta.mode} />
  );
}

function ShareLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div
        aria-hidden
        className="size-6 animate-spin rounded-full border-2 border-muted border-t-foreground"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
