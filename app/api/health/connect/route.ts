import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { currentMember } from "@/lib/health/session";
import { buildAuthUrl, generatePkce } from "@/lib/health/google";

/**
 * GET /api/health/connect — start the Google Health OAuth flow. Redirects to
 * Google's consent screen; the PKCE verifier + anti-CSRF state travel in a
 * short-lived httpOnly cookie (mirrors the WebAuthn challenge cookies in
 * app/[locale]/login/actions.ts), read back by /api/health/callback.
 */
const STATE_COOKIE = "health_oauth_state";
const STATE_MAX_AGE = 600; // 10 minutes — long enough for the consent screen

export async function GET(request: Request): Promise<Response> {
  const member = await currentMember();
  if (!member) {
    return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  }

  const { verifier, challenge } = generatePkce();
  const state = randomBytes(16).toString("base64url");
  const redirectUri = new URL("/api/health/callback", request.url).toString();

  const store = await cookies();
  store.set(
    STATE_COOKIE,
    JSON.stringify({ state, verifier, memberId: member.memberId, redirectUri }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: STATE_MAX_AGE,
      path: "/api/health",
    },
  );

  const authUrl = buildAuthUrl({ redirectUri, state, codeChallenge: challenge });
  return NextResponse.redirect(authUrl, { status: 303 });
}
