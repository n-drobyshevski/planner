/**
 * Helpers for returning a user to the OAuth consent screen after they sign in.
 *
 * When an unauthenticated user starts the Supabase OAuth flow, the proxy bounces
 * them to /login with the `authorization_id` preserved. After login we send them
 * back to /oauth/consent so the flow continues seamlessly.
 *
 * The `authorization_id` is an opaque Supabase token. We validate its shape and
 * always redirect to a HARDCODED `/oauth/consent` path (the id is only ever a
 * query value), so there is no open-redirect surface — a caller can never steer
 * the destination, only supply the token.
 */
const AUTHORIZATION_ID_RE = /^[A-Za-z0-9._~-]{8,128}$/;

/** Returns the id if it's a well-formed authorization token, else null. */
export function safeAuthorizationId(
  value: string | null | undefined,
): string | null {
  return value && AUTHORIZATION_ID_RE.test(value) ? value : null;
}

/** Post-login destination: the consent screen when resuming an OAuth flow,
 *  otherwise the calendar. `locale` is prefixed for the client hard-navigation. */
export function postLoginPath(
  locale: string,
  authorizationId: string | null | undefined,
): string {
  const id = safeAuthorizationId(authorizationId);
  return id
    ? `/${locale}/oauth/consent?authorization_id=${encodeURIComponent(id)}`
    : `/${locale}/calendar`;
}
