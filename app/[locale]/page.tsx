import { redirect } from "@/i18n/navigation";

/**
 * The home route just lands on the calendar surface (locale-preserving). In
 * practice the proxy already redirects "/" — authed → /calendar, unauthed →
 * /login — so this only runs when auth gating is skipped (e.g. Supabase env
 * vars missing). Kept so "/" never 404s.
 */
export default async function LocaleHome({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/calendar", locale });
}
