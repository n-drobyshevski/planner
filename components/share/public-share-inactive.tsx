import { CalendarOff } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { ShareLocale } from "@/lib/i18n/share-locale";

/**
 * The calm terminal state for a share link that doesn't exist, has expired, or has
 * been revoked. Deliberately quiet and reassuring — it gives nothing away about the
 * calendar (a missing and a revoked link look identical) and offers no next step.
 *
 * Server-rendered with an explicit `locale` (the share tree lives outside `[locale]`,
 * so the locale is resolved by the page and threaded down), keeping its copy out of
 * the client bundle.
 */
export async function PublicShareInactive({ locale }: { locale: ShareLocale }) {
  const t = await getTranslations({ locale, namespace: "share" });
  return (
    <main lang={locale} className="flex min-h-dvh items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
          <CalendarOff aria-hidden className="size-6 text-muted-foreground" />
        </span>
        <h1 className="text-base font-semibold text-foreground">
          {t("inactive.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("inactive.body")}</p>
      </div>
    </main>
  );
}
