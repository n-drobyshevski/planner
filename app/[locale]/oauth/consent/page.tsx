import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  Unplug,
  Link2Off,
  CalendarDays,
  ListChecks,
  Moon,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { isMcpEnabled, isAllowedClientRedirect } from "@/lib/mcp/env";
import { FullPageMessage } from "@/components/shared/full-page-message";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/**
 * OAuth 2.1 consent screen for Supabase's authorization server. Supabase
 * redirects here (Authorization Path = Site URL + `/oauth/consent`) with an
 * `authorization_id` when a client (e.g. Claude) requests access.
 *
 * All states are localized and calm: terminal states (unavailable / missing /
 * expired / not-allowed) reuse the app-wide `FullPageMessage`; the live request
 * renders an authorize card. The dynamic work runs inside <Suspense> so the
 * static shell prerenders under Cache Components.
 *
 * See: https://supabase.com/docs/guides/auth/oauth-server/getting-started
 */
export default function ConsentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  return (
    <Suspense fallback={<ConsentLoading />}>
      <ConsentFlow params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** Calm skeleton while the authorization request is fetched. */
function ConsentLoading() {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center p-6">
      <div
        aria-hidden
        className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="size-10 animate-pulse rounded-2xl bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-28 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="mt-6 space-y-2.5">
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </main>
  );
}

/** Dynamic part: reads the request + session and resolves the authorization. */
async function ConsentFlow({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const { locale } = await params;
  const { authorization_id: authorizationId } = await searchParams;
  const t = await getTranslations({ locale, namespace: "consent" });

  const goToCalendar = (
    <Button asChild>
      <Link href="/calendar">{t("goToCalendar")}</Link>
    </Button>
  );

  if (!isMcpEnabled()) {
    return (
      <FullPageMessage
        lang={locale}
        icon={Unplug}
        title={t("states.unavailableTitle")}
        description={t("states.unavailableBody")}
      >
        {goToCalendar}
      </FullPageMessage>
    );
  }

  if (!authorizationId) {
    return (
      <FullPageMessage
        lang={locale}
        icon={Link2Off}
        title={t("states.missingTitle")}
        description={t("states.missingBody")}
      >
        {goToCalendar}
      </FullPageMessage>
    );
  }

  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) {
    // The proxy normally catches this (preserving authorization_id); guard anyway.
    redirect(
      `${locale === routing.defaultLocale ? "" : `/${locale}`}/login?authorization_id=${encodeURIComponent(authorizationId)}`,
    );
  }

  const { data: details, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

  // Expired, already used, or otherwise invalid — the flow can't be revived here.
  if (error || !details) {
    return (
      <FullPageMessage
        lang={locale}
        alert
        icon={Clock}
        title={t("states.expiredTitle")}
        description={t("states.expiredBody")}
      >
        {goToCalendar}
      </FullPageMessage>
    );
  }

  // Already consented for these scopes — Supabase returns a redirect target.
  if (!("authorization_id" in details)) {
    redirect(details.redirect_url);
  }

  // "Claude only" guard (mirrors the authoritative check in /api/oauth/decision).
  if (!isAllowedClientRedirect(details.redirect_uri)) {
    return (
      <FullPageMessage
        lang={locale}
        alert
        icon={ShieldAlert}
        title={t("states.notAllowedTitle")}
        description={t("states.notAllowedBody", {
          client: details.client.name,
          uri: details.redirect_uri,
        })}
      >
        {goToCalendar}
      </FullPageMessage>
    );
  }

  // Show the member's name, not the raw auth email (internal @planner.local seed).
  const { data: member } = await supabase
    .from("members")
    .select("name")
    .eq("auth_user_id", details.user.id)
    .maybeSingle();
  const accountLabel = (member?.name as string | undefined) ?? details.user.email;

  let redirectHost = details.redirect_uri;
  try {
    redirectHost = new URL(details.redirect_uri).host;
  } catch {
    /* fall back to the raw value if it doesn't parse */
  }

  // Plain-language capabilities: what the connection actually grants. The raw
  // OAuth scopes (openid/profile/email) are identity jargon and understate the
  // member-scoped data access the tools have, so we describe that instead.
  const capabilities = [
    { icon: CalendarDays, label: t("capCalendar") },
    { icon: ListChecks, label: t("capTasks") },
    { icon: Moon, label: t("capSleep") },
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div className="rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold leading-tight">
              {t("title", { client: details.client.name })}
            </h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>

        <dl className="mt-6 space-y-2.5 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="shrink-0 text-muted-foreground">{t("signedInAs")}</dt>
            <dd className="min-w-0 truncate text-right font-medium">{accountLabel}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="shrink-0 text-muted-foreground">{t("redirectsTo")}</dt>
            <dd className="min-w-0 truncate text-right">{redirectHost}</dd>
          </div>
        </dl>

        <div className="mt-5">
          <p className="text-xs font-medium text-muted-foreground">
            {t("canAccessTitle")}
          </p>
          <ul className="mt-2 space-y-2">
            {capabilities.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2.5 text-sm">
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-5 text-xs text-muted-foreground">{t("grantNote")}</p>

        <form action="/api/oauth/decision" method="post" className="mt-6 flex gap-3">
          <input type="hidden" name="authorization_id" value={authorizationId} />
          <Button type="submit" name="decision" value="approve" className="flex-1">
            {t("allow")}
          </Button>
          <Button
            type="submit"
            name="decision"
            value="deny"
            variant="outline"
            className="flex-1"
          >
            {t("deny")}
          </Button>
        </form>
      </div>
    </main>
  );
}
