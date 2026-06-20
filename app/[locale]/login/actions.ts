"use server";

import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCredentialsByEmail } from "@/lib/auth/profiles";
import { sha256Hex } from "@/lib/auth/pin";
import { hashSecret, verifySecret } from "@/lib/auth/secret";
import {
  buildAuthenticationOptions,
  verifyAuthentication,
  buildRegistrationOptions,
  verifyRegistration,
  type StoredCredential,
} from "@/lib/auth/webauthn";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
  PublicKeyCredentialCreationOptionsJSON,
} from "@simplewebauthn/server";
import { APPEARANCE_COOKIE, serializeAppearance } from "@/lib/theme/appearance-cookie";
import {
  normalizeAccent,
  normalizePalette,
  normalizeTone,
} from "@/lib/theme/appearance";

type MemberRow = {
  id: string;
  auth_user_id: string | null;
  has_secret: boolean;
  pin_hash: string | null;
  accent: string | null;
  surface_tone: string | null;
  palette: string | null;
};

const MEMBER_COLS = "id, auth_user_id, has_secret, pin_hash, accent, surface_tone, palette";

// Short-lived cookies binding a WebAuthn ceremony's challenge to the request.
const CHAL_LOGIN = "wa_login_chal";
const CHAL_LOGIN_MEMBER = "wa_login_member";
const CHAL_ENROLL = "wa_enroll_chal";
const CHALLENGE_MAX_AGE = 300; // 5 minutes

async function setEphemeral(name: string, value: string): Promise<void> {
  const store = await cookies();
  store.set(name, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CHALLENGE_MAX_AGE,
  });
}

async function clearEphemeral(...names: string[]): Promise<void> {
  const store = await cookies();
  for (const n of names) store.set(n, "", { path: "/", maxAge: 0 });
}

/**
 * Seed the appearance cookie from the member's saved theme at sign-in, so the
 * very first authed paint on this device uses their accent/tone/palette. The
 * layout's pre-paint script reads this cookie; without it the static shell
 * paints the default accent and the client reconcile repaints it once the
 * member row loads over the network — the visible accent "color splash". Every
 * session originates here (refreshes only extend it) and the cookie outlives
 * them (1-year), so seeding it once per device removes the flash at the source.
 * Mirrors the client writer in lib/hooks/use-preferences.ts (path/maxAge/lax,
 * not httpOnly — the inline script must read it).
 */
async function seedAppearanceCookie(member: {
  accent: string | null;
  surface_tone: string | null;
  palette: string | null;
}): Promise<void> {
  const store = await cookies();
  store.set(
    APPEARANCE_COOKIE,
    serializeAppearance(
      normalizeAccent(member.accent),
      normalizeTone(member.surface_tone),
      normalizePalette(member.palette),
    ),
    { path: "/", maxAge: 31_536_000, sameSite: "lax" },
  );
}

export type SignInResult = { error: string; needsPin?: boolean };

/**
 * Mint a Supabase session for a verified member: resolve the server-held
 * credentials linked to their auth user and sign in. This is the unchanged
 * "bridge" — every proof factor (passphrase or passkey) funnels through here, so
 * auth.uid() and RLS never have to know which factor was used.
 * `signInWithPassword` replaces any session already on the request.
 */
async function mintSession(member: MemberRow): Promise<SignInResult | null> {
  const tv = await getTranslations({
    locale: await getLocale(),
    namespace: "validation",
  });

  if (!member.auth_user_id) return { error: tv("profileNotLinked") };

  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(member.auth_user_id);
  const cred = getCredentialsByEmail(authUser.user?.email);
  if (!cred) return { error: tv("loginNotConfigured") };

  const sb = await createClient();
  const { error } = await sb.auth.signInWithPassword(cred);
  if (error) return { error: error.message };

  await seedAppearanceCookie(member);
  return null;
}

/**
 * Verify a member's passphrase. The salted-scrypt digest in member_secrets is
 * authoritative; a legacy unsalted-SHA256 pin_hash is accepted once and silently
 * upgraded to scrypt on the spot. Returns whether a secret was required and
 * whether the candidate matched.
 */
async function checkSecret(
  member: MemberRow,
  secret: string,
): Promise<{ required: boolean; ok: boolean }> {
  if (!member.has_secret) return { required: false, ok: true };
  if (!secret) return { required: true, ok: false };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("member_secrets")
    .select("secret_hash, secret_salt")
    .eq("member_id", member.id)
    .maybeSingle();

  if (row) {
    return { required: true, ok: await verifySecret(secret, row.secret_salt, row.secret_hash) };
  }

  // Legacy path: verify against the old SHA-256 pin_hash, then upgrade.
  if (member.pin_hash && (await sha256Hex(secret)) === member.pin_hash) {
    const { salt, hash } = await hashSecret(secret);
    await admin.from("member_secrets").upsert({
      member_id: member.id,
      secret_hash: hash,
      secret_salt: salt,
    });
    await admin.from("members").update({ pin_hash: null }).eq("id", member.id);
    return { required: true, ok: true };
  }

  return { required: true, ok: false };
}

/**
 * Shared tail of the passphrase sign-in paths: verify the member's secret (when
 * one is set), then mint the session. Returns `null` on success, or a localized
 * {@link SignInResult} describing the failure.
 */
async function authenticateMember(
  member: MemberRow,
  secret: string,
): Promise<SignInResult | null> {
  const tv = await getTranslations({
    locale: await getLocale(),
    namespace: "validation",
  });

  const { required, ok } = await checkSecret(member, secret);
  if (required && !secret) return { error: tv("enterPin"), needsPin: true };
  if (!ok) return { error: tv("incorrectPin") };

  return mintSession(member);
}

/**
 * Sign in by typed nickname + PIN/passphrase. Looks the member up by their
 * current name, verifies the secret (when one is set), then signs in with the
 * server-held credentials linked to that member's auth user. On success this
 * redirects to /calendar.
 */
export async function signIn(
  nickname: string,
  pin: string,
): Promise<SignInResult | void> {
  const tv = await getTranslations({
    locale: await getLocale(),
    namespace: "validation",
  });

  const name = nickname.trim();
  if (!name) return { error: tv("enterName") };

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select(MEMBER_COLS)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  if (!member) return { error: tv("memberNotFound") };

  const failure = await authenticateMember(member as MemberRow, pin);
  if (failure) return failure;

  redirect({ href: "/calendar", locale: await getLocale() });
}

/**
 * Switch to the other member from inside the app. Keyed on member id (not name,
 * which can be renamed), it applies the same secret gate as login and swaps the
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
    .select(MEMBER_COLS)
    .eq("id", memberId)
    .maybeSingle();

  if (!member) return { error: tv("memberNotFound") };

  const failure = await authenticateMember(member as MemberRow, pin);
  if (failure) return failure;
  // Success: no redirect — the client hard-navigates to reset cached state.
}

export async function signOutAction(): Promise<void> {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect({ href: "/login", locale: await getLocale() });
}

// ---------------------------------------------------------------------------
// Passkey login (WebAuthn) — the primary, phishing-resistant factor.
// ---------------------------------------------------------------------------

async function loadCredentials(
  memberId: string,
): Promise<StoredCredential[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("webauthn_credentials")
    .select("credential_id, public_key, counter, transports")
    .eq("member_id", memberId);
  return (data ?? []) as StoredCredential[];
}

/**
 * Step 1 of passkey login: resolve the member by nickname, then return a signed
 * WebAuthn challenge scoped to their registered credentials. The challenge and
 * the resolved member id are stashed in short-lived httpOnly cookies for step 2.
 */
export async function beginPasskeyLogin(
  nickname: string,
): Promise<{ options: PublicKeyCredentialRequestOptionsJSON } | { error: string }> {
  const tv = await getTranslations({
    locale: await getLocale(),
    namespace: "validation",
  });

  const name = nickname.trim();
  if (!name) return { error: tv("enterName") };

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select("id")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (!member) return { error: tv("memberNotFound") };

  const creds = await loadCredentials(member.id);
  if (creds.length === 0) return { error: tv("noPasskey") };

  const options = await buildAuthenticationOptions({
    allow: creds.map((c) => ({ credential_id: c.credential_id, transports: c.transports })),
  });

  await setEphemeral(CHAL_LOGIN, options.challenge);
  await setEphemeral(CHAL_LOGIN_MEMBER, member.id);
  return { options };
}

/**
 * Step 2 of passkey login: verify the signed assertion against the stored
 * credential and the challenge from step 1, bump the signature counter, then
 * mint the session via the same bridge the passphrase path uses. Returns
 * `{ ok: true }` so the client can hard-navigate to /calendar.
 */
export async function finishPasskeyLogin(
  response: AuthenticationResponseJSON,
): Promise<{ ok: true } | { error: string }> {
  const tv = await getTranslations({
    locale: await getLocale(),
    namespace: "validation",
  });

  const store = await cookies();
  const challenge = store.get(CHAL_LOGIN)?.value;
  const memberId = store.get(CHAL_LOGIN_MEMBER)?.value;
  await clearEphemeral(CHAL_LOGIN, CHAL_LOGIN_MEMBER);
  if (!challenge || !memberId) return { error: tv("passkeyFailed") };

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select(MEMBER_COLS)
    .eq("id", memberId)
    .maybeSingle();
  if (!member) return { error: tv("memberNotFound") };

  const credential = (await loadCredentials(memberId)).find(
    (c) => c.credential_id === response.id,
  );
  if (!credential) return { error: tv("passkeyFailed") };

  let verified;
  try {
    verified = await verifyAuthentication({
      response,
      expectedChallenge: challenge,
      credential,
    });
  } catch {
    return { error: tv("passkeyFailed") };
  }
  if (!verified.verified) return { error: tv("passkeyFailed") };

  await admin
    .from("webauthn_credentials")
    .update({
      counter: verified.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
    })
    .eq("credential_id", response.id);

  const failure = await mintSession(member as MemberRow);
  if (failure) return { error: failure.error };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Enrollment (signed-in member): passkeys + passphrase management.
// ---------------------------------------------------------------------------

async function requireSessionMember(): Promise<{ id: string; name: string } | null> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("members")
    .select("id, name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return data ?? null;
}

export async function beginPasskeyEnrollment(): Promise<
  { options: PublicKeyCredentialCreationOptionsJSON } | { error: string }
> {
  const tv = await getTranslations({ locale: await getLocale(), namespace: "validation" });
  const member = await requireSessionMember();
  if (!member) return { error: tv("notSignedIn") };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("webauthn_credentials")
    .select("credential_id, transports")
    .eq("member_id", member.id);

  const options = await buildRegistrationOptions({
    memberId: member.id,
    memberName: member.name,
    existing: (existing ?? []).map((c) => ({
      credential_id: c.credential_id,
      transports: c.transports,
    })),
  });

  await setEphemeral(CHAL_ENROLL, options.challenge);
  return { options };
}

export async function finishPasskeyEnrollment(
  response: RegistrationResponseJSON,
  label?: string,
): Promise<{ ok: true } | { error: string }> {
  const tv = await getTranslations({ locale: await getLocale(), namespace: "validation" });
  const member = await requireSessionMember();
  if (!member) return { error: tv("notSignedIn") };

  const store = await cookies();
  const challenge = store.get(CHAL_ENROLL)?.value;
  await clearEphemeral(CHAL_ENROLL);
  if (!challenge) return { error: tv("passkeyFailed") };

  let verified;
  try {
    verified = await verifyRegistration({ response, expectedChallenge: challenge });
  } catch {
    return { error: tv("passkeyFailed") };
  }
  if (!verified.verified || !verified.registrationInfo) {
    return { error: tv("passkeyFailed") };
  }

  const { credential } = verified.registrationInfo;
  const admin = createAdminClient();
  const { error } = await admin.from("webauthn_credentials").insert({
    member_id: member.id,
    credential_id: credential.id,
    public_key: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: credential.transports ?? null,
    label: label?.trim() || null,
  });
  if (error) return { error: error.message };

  await admin.from("members").update({ has_passkey: true }).eq("id", member.id);
  return { ok: true };
}

export type PasskeySummary = {
  id: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
};

export async function listPasskeys(): Promise<PasskeySummary[]> {
  const member = await requireSessionMember();
  if (!member) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("webauthn_credentials")
    .select("id, label, created_at, last_used_at")
    .eq("member_id", member.id)
    .order("created_at", { ascending: true });
  return (data ?? []) as PasskeySummary[];
}

export async function removePasskey(
  id: string,
): Promise<{ ok: true } | { error: string }> {
  const tv = await getTranslations({ locale: await getLocale(), namespace: "validation" });
  const member = await requireSessionMember();
  if (!member) return { error: tv("notSignedIn") };

  const admin = createAdminClient();
  await admin.from("webauthn_credentials").delete().eq("id", id).eq("member_id", member.id);
  const { count } = await admin
    .from("webauthn_credentials")
    .select("id", { count: "exact", head: true })
    .eq("member_id", member.id);
  await admin
    .from("members")
    .update({ has_passkey: (count ?? 0) > 0 })
    .eq("id", member.id);
  return { ok: true };
}

/** Set or change the signed-in member's passphrase (scrypt-hashed server-side). */
export async function setPassphrase(
  secret: string,
): Promise<{ ok: true } | { error: string }> {
  const tv = await getTranslations({ locale: await getLocale(), namespace: "validation" });
  const member = await requireSessionMember();
  if (!member) return { error: tv("notSignedIn") };
  if (!secret) return { error: tv("enterPin") };

  const { salt, hash } = await hashSecret(secret);
  const admin = createAdminClient();
  const { error } = await admin
    .from("member_secrets")
    .upsert({ member_id: member.id, secret_hash: hash, secret_salt: salt, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };
  await admin
    .from("members")
    .update({ has_secret: true, pin_hash: null })
    .eq("id", member.id);
  return { ok: true };
}

/** Remove the signed-in member's passphrase. */
export async function removePassphrase(): Promise<{ ok: true } | { error: string }> {
  const tv = await getTranslations({ locale: await getLocale(), namespace: "validation" });
  const member = await requireSessionMember();
  if (!member) return { error: tv("notSignedIn") };

  const admin = createAdminClient();
  await admin.from("member_secrets").delete().eq("member_id", member.id);
  await admin
    .from("members")
    .update({ has_secret: false, pin_hash: null })
    .eq("id", member.id);
  return { ok: true };
}

/** Verify a candidate passphrase for the signed-in member (gate before change/remove). */
export async function verifyCurrentSecret(secret: string): Promise<boolean> {
  const member = await requireSessionMember();
  if (!member) return false;
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("member_secrets")
    .select("secret_hash, secret_salt")
    .eq("member_id", member.id)
    .maybeSingle();
  if (row) return verifySecret(secret, row.secret_salt, row.secret_hash);
  // Legacy pin_hash (not yet upgraded).
  const { data: m } = await admin
    .from("members")
    .select("pin_hash")
    .eq("id", member.id)
    .maybeSingle();
  if (m?.pin_hash) return (await sha256Hex(secret)) === m.pin_hash;
  return false;
}
