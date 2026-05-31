"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMemberCredentials, getMemberProfiles, type MemberKey } from "@/lib/auth/profiles";
import { sha256Hex } from "@/lib/auth/pin";

export type SignInResult = { ok: true } | { error: string; needsPin?: boolean };

/**
 * Sign in as one of the two preset members. If that member has a PIN set, it
 * must be supplied and verified before the (server-held) credentials are used.
 * On success this redirects to /calendar.
 */
export async function signInAsMember(
  key: MemberKey,
  pin?: string,
): Promise<SignInResult> {
  const profile = getMemberProfiles().find((p) => p.key === key);
  if (!profile) return { error: "Unknown profile" };

  // PIN gate (only if a hash is configured for this member).
  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select("pin_hash")
    .eq("name", profile.name)
    .maybeSingle();

  if (member?.pin_hash) {
    if (!pin) return { error: "PIN required", needsPin: true };
    const hash = await sha256Hex(pin);
    if (hash !== member.pin_hash) return { error: "Incorrect PIN", needsPin: true };
  }

  const { email, password } = getMemberCredentials(key);
  const sb = await createClient();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect("/calendar");
}

export async function signOutAction(): Promise<void> {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect("/select-profile");
}
