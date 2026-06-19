"use server";

import { cookies } from "next/headers";

import { SHARE_LOCALE_COOKIE, type ShareLocale } from "@/lib/i18n/share-locale";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Persist the share viewer's explicit language choice. Setting the cookie in a
 * Server Action (rather than `document.cookie` in the client) keeps the write off
 * the client and out of component scope; the toggle pairs it with `router.refresh()`
 * so the dynamic share page re-renders with the new cookie and swaps locale.
 */
export async function setShareLocale(locale: ShareLocale): Promise<void> {
  (await cookies()).set(SHARE_LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
  });
}
