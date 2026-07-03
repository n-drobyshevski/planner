import "server-only";

export type MemberKey = "A" | "B";

export function getMemberCredentials(key: MemberKey): {
  email: string;
  password: string;
} {
  return key === "A"
    ? {
        email: process.env.MEMBER_A_EMAIL!,
        password: process.env.MEMBER_A_PASSWORD!,
      }
    : {
        email: process.env.MEMBER_B_EMAIL!,
        password: process.env.MEMBER_B_PASSWORD!,
      };
}

// These passwords are full-strength credentials: Supabase's password grant is
// publicly reachable with the anon key, so they — not the login form — are the
// real perimeter. Refuse the obvious placeholders in production; warn (never
// throw) on short-but-real values so a legitimate password can't brick login.
const PLACEHOLDER_PASSWORDS = new Set([
  "change-me",
  "replace-with-a-strong-unique-random-password",
]);

function assertUsableCredential(cred: { email: string; password: string }): void {
  if (process.env.NODE_ENV !== "production") return;
  if (!cred.password || PLACEHOLDER_PASSWORDS.has(cred.password)) {
    throw new Error(
      "MEMBER_*_PASSWORD is unset or still the placeholder — set a strong random password in production.",
    );
  }
  if (cred.password.length < 16) {
    console.warn(
      "[planner] MEMBER_*_PASSWORD is under 16 chars — use a longer random secret (e.g. `openssl rand -base64 24`).",
    );
  }
}

/**
 * Map a member's auth email back to its (server-held) credentials. Lets login
 * resolve the password from the member row's linked auth user — robust to
 * nickname renames, since it keys on the email, not the display name.
 */
export function getCredentialsByEmail(
  email: string | null | undefined,
): { email: string; password: string } | null {
  if (!email) return null;
  const lower = email.toLowerCase();
  for (const key of ["A", "B"] as const) {
    const cred = getMemberCredentials(key);
    if (cred.email?.toLowerCase() === lower) {
      assertUsableCredential(cred);
      return cred;
    }
  }
  return null;
}
