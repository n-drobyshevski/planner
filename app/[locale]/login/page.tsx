import { cacheLife } from "next/cache";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { CalendarDays } from "lucide-react";
import { LoginScreen } from "@/components/auth/login-screen";

// The login screen has no request-time data, so prerender it into the static
// shell. The interactive form (LoginScreen) is a client component, passed
// through unaffected. Auth gating still happens in the proxy/middleware.
export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Passing `locale` as a prop makes the cached unit's key locale-specific,
  // so the en/ru renders never collide in the cache.
  return <CachedLogin locale={locale} />;
}

async function CachedLogin({ locale }: { locale: string }) {
  "use cache";
  cacheLife("max");
  const t = await getTranslations({ locale, namespace: "auth" });
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-background px-6 py-12">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
          <CalendarDays className="size-7" />
        </span>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {t("welcomeTitle")}
        </h1>
        <p className="max-w-sm text-muted-foreground">{t("welcomeSubtitle")}</p>
      </div>
      <LoginScreen />
    </main>
  );
}
