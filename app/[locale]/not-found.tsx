import { MapPinOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { FullPageMessage } from "@/components/shared/full-page-message";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * 404 for any unmatched path inside a locale (including the `[...rest]` catch-all
 * and any `notFound()` thrown by a localized page). Renders inside the locale
 * layout, so it has the intl provider and a locale-aware "back to the app" link.
 */
export default function LocaleNotFound() {
  const t = useTranslations("errors");
  return (
    <FullPageMessage
      icon={MapPinOff}
      title={t("notFound.title")}
      description={t("notFound.body")}
    >
      <Button asChild>
        <Link href="/calendar">{t("notFound.action")}</Link>
      </Button>
    </FullPageMessage>
  );
}
