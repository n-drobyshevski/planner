import { CalendarOff } from "lucide-react";

import { FullPageMessage } from "@/components/shared/full-page-message";

/**
 * 404 for the public share tree (a `notFound()` under `/share/[token]`). The page
 * itself renders `PublicShareInactive` for invalid/expired tokens, so this only
 * catches genuinely unroutable paths. English and actionless, matching the quiet,
 * give-nothing-away tone of the share surface.
 */
export default function ShareNotFound() {
  return (
    <FullPageMessage
      icon={CalendarOff}
      title="Calendar not found"
      description="This link doesn't point to a calendar. It may have been removed."
    />
  );
}
