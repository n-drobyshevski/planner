"use client";

import { useEffect } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { FullPageMessage } from "@/components/shared/full-page-message";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * Runtime error boundary for the localized app (anything below the locale layout
 * that isn't caught by a closer boundary, e.g. the surfaces one). Client Component
 * by Next's contract; it sits inside the intl provider so its copy is translated.
 * The raw error is logged for debugging, never shown to the two users.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <FullPageMessage
      icon={TriangleAlert}
      title={t("appError.title")}
      description={t("appError.body")}
      alert
    >
      <Button onClick={reset}>
        <RotateCw data-icon="inline-start" />
        {t("appError.retry")}
      </Button>
      <Button variant="outline" asChild>
        <Link href="/calendar">{t("appError.home")}</Link>
      </Button>
    </FullPageMessage>
  );
}
