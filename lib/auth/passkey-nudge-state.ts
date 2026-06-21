// Session-scoped dismissal for the post-login "add a passkey" nudge.
//
// `sessionStorage` (not `localStorage`) so a "Not now" survives reloads and
// surface navigation within the session, but the nudge returns on the next
// sign-in: the login screen clears these keys on mount (it only renders when
// logged out, so reaching it means a fresh session is about to begin).
//
// Keyed per member so two people sharing a device get independent decisions.
// Every access is wrapped — `sessionStorage` throws in private-mode Safari and
// is absent during SSR.

const PREFIX = "passkey-nudge-dismissed:";

export function isPasskeyNudgeDismissed(memberId: string): boolean {
  try {
    return sessionStorage.getItem(PREFIX + memberId) === "1";
  } catch {
    return false;
  }
}

export function dismissPasskeyNudge(memberId: string): void {
  try {
    sessionStorage.setItem(PREFIX + memberId, "1");
  } catch {
    // best-effort; a failed write just means the nudge may reappear
  }
}

/** Clear every member's dismissal — called on login so the next session starts fresh. */
export function clearPasskeyNudgeDismissals(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) sessionStorage.removeItem(key);
  } catch {
    // nothing to clear if storage is unavailable
  }
}
