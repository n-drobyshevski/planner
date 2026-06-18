import { Skeleton } from "@/components/ui/skeleton";

/**
 * Suspense fallbacks for the surface pages. They prerender into each route's
 * Cache Components static shell, so a cold load paints the real header (from
 * the (surfaces) layout) plus one of these placeholders instead of a blank
 * page. Static-positioned, no entrance animation — the product bans page-load
 * sequences; Skeleton's pulse is a loading indicator, like the existing
 * spinners, not a transition.
 */

/** Left rail (desktop) + a faint column of row lines standing in for the grid. */
export function CalendarSkeleton() {
  return (
    <div className="flex h-full">
      <div className="hidden w-64 shrink-0 space-y-3 border-r p-4 md:block">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-5 w-2/3" />
      </div>
      <div className="min-w-0 flex-1 space-y-px p-px">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="h-14 border-b border-border/40" />
        ))}
      </div>
    </div>
  );
}

/** Three board columns on desktop, stacked rows on a phone. */
export function TasksSkeleton() {
  return (
    <div className="h-full p-3 sm:p-4">
      <div className="hidden h-full grid-cols-3 gap-4 md:grid">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ))}
      </div>
      <div className="space-y-3 md:hidden">
        <Skeleton className="h-6 w-1/3" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}

/** A narrow column of list rows — the inbox's quiet list, pre-fill. */
export function InboxSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-3 sm:p-4">
      <Skeleton className="h-7 w-32" />
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}

/** A row of stat cards over a chart block. */
export function InsightsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-3 sm:p-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
