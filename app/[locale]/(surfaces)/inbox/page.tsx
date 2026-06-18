import { Suspense } from "react";
import { cacheLife } from "next/cache";
import { InboxShell } from "@/components/inbox/inbox-shell";
import { InboxSkeleton } from "@/components/shared/surface-skeletons";

// The Inbox has no request-time inputs (no period selector, no searchParams):
// every row is derived client-side from the workspace cache. So the whole shell
// is a static, cached RSC payload, prerendered into the route's Cache Components
// shell with the skeleton as its Suspense fallback (the other surfaces' pattern).
export default function InboxPage() {
  return (
    <Suspense fallback={<InboxSkeleton />}>
      <CachedInbox />
    </Suspense>
  );
}

async function CachedInbox() {
  "use cache";
  cacheLife("hours");
  return <InboxShell />;
}
