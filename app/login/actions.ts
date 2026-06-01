"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCredentialsByEmail } from "@/lib/auth/profiles";
import { sha256Hex } from "@/lib/auth/pin";

export type SignInResult = { error: string; needsPin?: boolean };

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
  const name = nickname.trim();
  if (!name) return { error: "Enter your name." };

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select("auth_user_id, pin_hash")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  if (!member) return { error: "We couldn't find anyone with that name." };

  // PIN gate (only when this member has one configured).
  if (member.pin_hash) {
    if (!pin) return { error: "Enter your PIN.", needsPin: true };
    if ((await sha256Hex(pin)) !== member.pin_hash) {
      return { error: "Incorrect PIN." };
    }
  }

  // Resolve credentials from the linked auth user's email.
  if (!member.auth_user_id) {
    return { error: "This profile isn't linked to a login yet." };
  }
  const { data: authUser } = await admin.auth.admin.getUserById(member.auth_user_id);
  const cred = getCredentialsByEmail(authUser.user?.email);
  if (!cred) return { error: "Login isn't configured for this profile." };

  const sb = await createClient();
  const { error } = await sb.auth.signInWithPassword(cred);
  if (error) return { error: error.message };

  redirect("/calendar");
}

export async function signOutAction(): Promise<void> {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect("/login");
}
