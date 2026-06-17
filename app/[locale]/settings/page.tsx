import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsShell } from "@/components/settings/settings-shell";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "settings" });
  return {
    title: t("metaTitle"),
  };
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // Pin the locale so next-intl resolves it statically (no dynamic `headers()`),
  // keeping this route prerenderable under Cache Components.
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("settings");

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
        <Button asChild variant="ghost" size="icon" aria-label={t("backToCalendar")}>
          <Link href="/calendar">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="font-heading text-lg font-medium">{t("title")}</h1>
      </header>
      <main>
        <SettingsShell />
      </main>
    </div>
  );
}
