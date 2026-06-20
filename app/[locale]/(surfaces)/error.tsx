"use client";

import { useEffect } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { FullPageMessage } from "@/components/shared/full-page-message";
import { Button } from "@/components/ui/button";

/**
 * Error boundary scoped to the Calendar/Tasks/Insights surfaces. It renders as the
 * content of the surfaces layout, so the shared chrome (AppNav, surface switch)
 * stays mounted — a crash in one surface keeps the app navigable instead of
 * blanking the screen. `h-full` centers the message inside the content region
 * rather than the whole viewport.
 */
export default function SurfaceError({
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
      title={t("surfaceError.title")}
      description={t("surfaceError.body")}
      className="h-full min-h-0"
      alert
    >
      <Button onClick={reset}>
        <RotateCw data-icon="inline-start" />
        {t("surfaceError.retry")}
      </Button>
    </FullPageMessage>
  );
}
