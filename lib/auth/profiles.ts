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
    if (cred.email?.toLowerCase() === lower) return cred;
  }
  return null;
}
