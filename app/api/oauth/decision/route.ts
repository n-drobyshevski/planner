import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMcpEnabled, isAllowedClientRedirect } from "@/lib/mcp/env";

/**
 * Completes the OAuth consent decision from /oauth/consent. Approving issues the
 * authorization code via Supabase and redirects the user back to the client
 * (claude.ai); denying redirects back with an error. Under /api, so outside the
 * proxy's locale + auth handling — it relies on the cookie session directly.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isMcpEnabled()) {
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }

  const form = await request.formData();
  const decision = form.get("decision");
  const authorizationId = form.get("authorization_id");

  if (typeof authorizationId !== "string" || !authorizationId) {
    return NextResponse.json({ error: "Missing authorization_id" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) {
    return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  }

  // "Claude only" guard (authoritative): never approve a client whose redirect
  // host isn't allowlisted, even if the page UI were bypassed. Re-fetch the
  // details server-side rather than trusting anything from the form.
  if (decision === "approve") {
    const { data: details } =
      await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
    const redirectUri =
      details && "redirect_uri" in details ? details.redirect_uri : undefined;
    if (!isAllowedClientRedirect(redirectUri)) {
      const denied = await supabase.auth.oauth.denyAuthorization(authorizationId);
      if (denied.data) {
        return NextResponse.redirect(denied.data.redirect_url, { status: 303 });
      }
      return NextResponse.json(
        { error: "This client is not allowed to connect." },
        { status: 403 },
      );
    }
  }

  const { data, error } =
    decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(authorizationId)
      : await supabase.auth.oauth.denyAuthorization(authorizationId);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Authorization failed" },
      { status: 400 },
    );
  }

  // 303 so the POST becomes a GET on the client's callback URL.
  return NextResponse.redirect(data.redirect_url, { status: 303 });
}
