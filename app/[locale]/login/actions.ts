"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCredentialsByEmail } from "@/lib/auth/profiles";
import { sha256Hex } from "@/lib/auth/pin";

export type SignInResult = { error: string; needsPin?: boolean };

/**
 * Shared tail of every sign-in path: verify the member's PIN (when one is set),
 * then establish a session with the server-held credentials linked to their
 * auth user. `signInWithPassword` replaces any session already on the request,
 * so callers don't need to sign out first. Returns `null` on success, or a
 * localized {@link SignInResult} describing the failure.
 */
async function authenticateMember(
  member: { auth_user_id: string | null; pin_hash: string | null },
  pin: string,
): Promise<SignInResult | null> {
  const tv = await getTranslations({
    locale: await getLocale(),
    namespace: "validation",
  });

  // PIN gate (only when this member has one configured).
  if (member.pin_hash) {
    if (!pin) return { error: tv("enterPin"), needsPin: true };
    if ((await sha256Hex(pin)) !== member.pin_hash) {
      return { error: tv("incorrectPin") };
    }
  }

  // Resolve credentials from the linked auth user's email.
  if (!member.auth_user_id) {
    return { error: tv("profileNotLinked") };
  }
  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(
    member.auth_user_id,
  );
  const cred = getCredentialsByEmail(authUser.user?.email);
  if (!cred) return { error: tv("loginNotConfigured") };

  const sb = await createClient();
  const { error } = await sb.auth.signInWithPassword(cred);
  if (error) return { error: error.message };

  return null;
}

/**
 * Sign in by typed nickname + PIN. Looks the member up by their current name,
 * verifies the PIN against members.pin_hash (when one is set), then signs in
 * with the server-held credentials linked to that member's auth user. On
 * success this redirects to /calendar.
 */
export async function signIn(
  nickname: string,
  pin: string,
): Promise<SignInResult | void> {
  // Localize the user-facing toast copy against the request locale.
  const tv = await getTranslations({
    locale: await getLocale(),
    namespace: "validation",
  });

  const name = nickname.trim();
  if (!name) return { error: tv("enterName") };

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select("auth_user_id, pin_hash")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  if (!member) return { error: tv("memberNotFound") };

  const failure = await authenticateMember(member, pin);
  if (failure) return failure;

  redirect({ href: "/calendar", locale: await getLocale() });
}

/**
 * Switch to the other member from inside the app. Keyed on member id (not name,
 * which can be renamed), it applies the same PIN gate as login and swaps the
 * session in place. Unlike {@link signIn} it does NOT redirect: it returns
 * success so the client can hard-navigate, which is the only reliable way to
 * reset the per-member React Query caches (workspace, events, tasks, insights).
 */
export async function switchAccountAction(
  memberId: string,
  pin: string,
): Promise<SignInResult | void> {
  const tv = await getTranslations({
    locale: await getLocale(),
    namespace: "validation",
  });

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select("auth_user_id, pin_hash")
    .eq("id", memberId)
    .maybeSingle();

  if (!member) return { error: tv("memberNotFound") };

  const failure = await authenticateMember(member, pin);
  if (failure) return failure;
  // Success: no redirect — the client hard-navigates to reset cached state.
}

export async function signOutAction(): Promise<void> {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect({ href: "/login", locale: await getLocale() });
}
