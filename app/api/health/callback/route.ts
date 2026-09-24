import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { currentMember } from "@/lib/health/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCode, fetchHealthUserId, HEALTH_SCOPES } from "@/lib/health/google";
import { encryptToken, bufferToPgBytea } from "@/lib/health/crypto";

const STATE_COOKIE = "health_oauth_state";

interface StateCookie {
  state: string;
  verifier: string;
  memberId: string;
  redirectUri: string;
}

function settingsUrl(request: Request, status: "connected" | "error"): URL {
  const url = new URL("/settings", request.url);
  url.searchParams.set("section", "health");
  url.searchParams.set("health", status);
  return url;
}

/**
 * GET /api/health/callback — Google redirects here with `code`/`state`.
 * Verifies the session member and the PKCE state cookie, exchanges the code,
 * encrypts the refresh token, and upserts `health_connections`. All writes go
 * through the service role — this route is the only client-facing surface
 * that's allowed to set `refresh_token_enc`.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const store = await cookies();
  const raw = store.get(STATE_COOKIE)?.value;
  store.delete({ name: STATE_COOKIE, path: "/api/health" });

  const member = await currentMember();
  if (!member) return NextResponse.redirect(new URL("/login", request.url), { status: 303 });

  if (oauthError || !code || !returnedState || !raw) {
    return NextResponse.redirect(settingsUrl(request, "error"), { status: 303 });
  }

  let parsed: StateCookie;
  try {
    parsed = JSON.parse(raw) as StateCookie;
  } catch {
    return NextResponse.redirect(settingsUrl(request, "error"), { status: 303 });
  }

  // The state must match AND the callback must land in the same member's
  // session that started the flow — otherwise one member could hijack the
  // OAuth grant into the OTHER member's connection.
  if (parsed.state !== returnedState || parsed.memberId !== member.memberId) {
    return NextResponse.redirect(settingsUrl(request, "error"), { status: 303 });
  }

  try {
    const tokens = await exchangeCode(code, parsed.verifier, parsed.redirectUri);
    if (!tokens.refreshToken) {
      // access_type=offline&prompt=consent should always yield one; if Google
      // ever doesn't, there's nothing durable to store — surface as an error
      // rather than silently creating a connection that can't outlive the hour.
      throw new Error("Google did not return a refresh token.");
    }
    const healthUserId = await fetchHealthUserId(tokens.accessToken);

    const admin = createAdminClient();
    const { error } = await admin.from("health_connections").upsert(
      {
        member_id: member.memberId,
        workspace_id: member.workspaceId,
        provider: "google_health",
        health_user_id: healthUserId,
        scopes: HEALTH_SCOPES,
        refresh_token_enc: bufferToPgBytea(encryptToken(tokens.refreshToken)),
        status: "active",
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "member_id" },
    );
    if (error) throw error;

    return NextResponse.redirect(settingsUrl(request, "connected"), { status: 303 });
  } catch (err) {
    console.error("[planner] Google Health OAuth callback failed:", err);
    return NextResponse.redirect(settingsUrl(request, "error"), { status: 303 });
  }
}
