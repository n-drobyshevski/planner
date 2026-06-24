import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { isMcpEnabled, isAllowedClientRedirect } from "@/lib/mcp/env";
import { Button } from "@/components/ui/button";

/**
 * OAuth 2.1 consent screen for Supabase's authorization server. Supabase
 * redirects here (the configured Authorization Path = Site URL + `/oauth/consent`)
 * with an `authorization_id` when a client (e.g. claude.ai) requests access.
 *
 * Lives under `[locale]` so it inherits the proxy's auth gate (unauthenticated →
 * /login) and i18n shell. The dynamic work (reading searchParams + the user's
 * session) runs inside <Suspense> so the static shell can prerender under Cache
 * Components — the page itself accesses no request data.
 *
 * See: https://supabase.com/docs/guides/auth/oauth-server/getting-started
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-16">
      {children}
    </main>
  );
}

function NoticeCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <h1 className="text-base font-medium">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function PendingCard() {
  return (
    <div className="rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <div className="h-5 w-40 animate-pulse rounded bg-muted" />
      <div className="mt-4 h-4 w-full animate-pulse rounded bg-muted" />
    </div>
  );
}

export default function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  if (!isMcpEnabled()) {
    return (
      <Shell>
        <NoticeCard
          title="Not available"
          body="The Claude connector is not enabled for this workspace."
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <Suspense fallback={<PendingCard />}>
        <ConsentFlow searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

/** Dynamic part: reads the request + session, fetches authorization details. */
async function ConsentFlow({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const { authorization_id: authorizationId } = await searchParams;
  if (!authorizationId) {
    return <NoticeCard title="Missing request" body="No authorization request was provided." />;
  }

  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) {
    // Not signed in — the proxy normally catches this, but guard anyway.
    redirect("/login");
  }

  const { data: details, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !details) {
    return (
      <NoticeCard
        title="Invalid request"
        body={error?.message ?? "This authorization request is invalid or has expired."}
      />
    );
  }

  // Already consented for these scopes — Supabase returns a redirect target.
  if (!("authorization_id" in details)) {
    redirect(details.redirect_url);
  }

  // "Claude only" guard (mirrors the authoritative check in /api/oauth/decision):
  // refuse clients whose redirect host isn't allowlisted.
  if (!isAllowedClientRedirect(details.redirect_uri)) {
    return (
      <NoticeCard
        title="Client not allowed"
        body={`"${details.client.name}" (${details.redirect_uri}) isn't on the allowed list, so it can't connect to this planner.`}
      />
    );
  }

  let redirectHost = details.redirect_uri;
  try {
    redirectHost = new URL(details.redirect_uri).host;
  } catch {
    /* show the raw value if it doesn't parse */
  }

  // Show the member's name, not the raw auth email — the @planner.local seed
  // emails are internal identifiers that don't match member nicknames.
  const { data: member } = await supabase
    .from("members")
    .select("name")
    .eq("auth_user_id", details.user.id)
    .maybeSingle();
  const accountLabel = (member?.name as string | undefined) ?? details.user.email;

  const scopes = details.scope?.trim() ? details.scope.trim().split(/\s+/) : [];

  return (
    <div className="rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-base font-medium leading-tight">
            Authorize {details.client.name}
          </h1>
          <p className="text-sm text-muted-foreground">wants to access your planner</p>
        </div>
      </div>

      <dl className="mt-6 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Signed in as</dt>
          <dd className="truncate text-right">{accountLabel}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Redirects to</dt>
          <dd className="truncate text-right">{redirectHost}</dd>
        </div>
        {scopes.length > 0 && (
          <div>
            <dt className="text-muted-foreground">Requested access</dt>
            <dd>
              <ul className="mt-1 list-inside list-disc">
                {scopes.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>

      <p className="mt-5 text-xs text-muted-foreground">
        This grants the app access to your calendar, tasks and sleep data, scoped to
        your member account. You can revoke it any time in Supabase.
      </p>

      <form action="/api/oauth/decision" method="post" className="mt-6 flex gap-3">
        <input type="hidden" name="authorization_id" value={authorizationId} />
        <Button type="submit" name="decision" value="approve" className="flex-1">
          Allow
        </Button>
        <Button
          type="submit"
          name="decision"
          value="deny"
          variant="outline"
          className="flex-1"
        >
          Deny
        </Button>
      </form>
    </div>
  );
}
