import { Suspense } from "react";
import { NextIntlClientProvider } from "next-intl";

import { createPublicClient } from "@/lib/supabase/anon";
import { fetchPublicShareMeta } from "@/lib/supabase/queries";
import { PublicCalendarView } from "@/components/share/public-calendar-view";
import { PublicShareInactive } from "@/components/share/public-share-inactive";
import enMessages from "@/messages/en";

// SECURITY / FRESHNESS: a share link's validity must always be evaluated live — a
// revoked or expired token has to stop serving immediately, so nothing here is
// cached. Under Cache Components the page is dynamic by construction (it awaits
// `params` + makes an uncached per-token RPC); the dynamic work is isolated inside
// a <Suspense> boundary so the static chrome can render first (a `dynamic =
// "force-dynamic"` export is both unnecessary and rejected when cacheComponents is on).
//
// i18n: the calendar leaves rendered here call `useTranslations`, so they need a
// `NextIntlClientProvider`. The share tree sits OUTSIDE `[locale]` (no provider from
// the layout), so we mount a fixed-English one. It lives INSIDE the <Suspense> — not
// in the static layout — because a server-rendered provider inherits `now` from the
// request config; doing that in the dynamic subtree keeps the shared layout shell
// free of request-data reads. Explicit `locale`/`timeZone` (the calendar formats
// dates with date-fns, not next-intl, so the zone here is inert).

export default function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <Suspense fallback={<ShareLoading />}>
      <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
        <ShareContent params={params} />
      </NextIntlClientProvider>
    </Suspense>
  );
}

async function ShareContent({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // The anon client can only reach the public_* SECURITY DEFINER RPCs; the meta
  // call returns null for an unknown token and active=false for a revoked/expired one.
  const meta = await fetchPublicShareMeta(createPublicClient(), token).catch(
    () => null,
  );

  if (!meta || !meta.active) {
    return <PublicShareInactive />;
  }
  return (
    <PublicCalendarView token={token} label={meta.label} mode={meta.mode} />
  );
}

function ShareLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div
        aria-hidden
        className="size-6 animate-spin rounded-full border-2 border-muted border-t-foreground"
      />
      <span className="sr-only">Loading the shared calendar…</span>
    </div>
  );
}
