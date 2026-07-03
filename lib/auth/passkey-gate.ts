/**
 * True when the member's only enrolled sign-in factor is a passkey. The typed
 * nickname path must refuse these members outright — a nickname is not a
 * secret, and the member has explicitly enrolled a stronger factor. Members
 * with no factor at all still pass (initial-setup bootstrap: enrollment
 * requires a session, so a fresh workspace must be able to sign in by name
 * once — the post-login nudge then pushes enrollment).
 */
export function passkeyOnly(member: {
  has_passkey: boolean;
  has_secret: boolean;
}): boolean {
  return member.has_passkey && !member.has_secret;
}
