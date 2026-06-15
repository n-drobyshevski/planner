import { Suspense } from "react";
import { cacheLife } from "next/cache";
import { InsightsShell } from "@/components/insights/insights-shell";
import { InsightsSkeleton } from "@/components/shared/surface-skeletons";
import {
  parsePeriodSearch,
  parseTabParam,
  type InsightsTab,
  type PeriodState,
} from "@/lib/insights/period";

interface InsightsSearch {
  range?: string;
  from?: string;
  to?: string;
  granularity?: string;
  tab?: string;
}

// Reading searchParams is request-time data. Under Cache Components it must sit
// behind a Suspense boundary so the rest of the route (the static shell) can be
// prerendered while the params-dependent shell streams in (calendar pattern).
export default function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<InsightsSearch>;
}) {
  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <InsightsRoute searchParams={searchParams} />
    </Suspense>
  );
}

async function InsightsRoute({
  searchParams,
}: {
  searchParams: Promise<InsightsSearch>;
}) {
  const sp = await searchParams;
  // Params are parsed OUT here, in the dynamic scope; the plain PeriodState +
  // tab become the cache key below. Presets like "this-week" stay symbolic in
  // PeriodState (resolved client-side by resolvePeriod), so the parse is
  // deterministic and the cached payload never embeds a server-side "now".
  const tab = parseTabParam(sp.tab);
  const state = parsePeriodSearch(sp);
  // Sleep defaults to a rolling "Last 7 days" window (vs. the calendar week,
  // which shows empty future days) — but only when no range was explicitly
  // requested, so deep links like ?tab=sleep&range=this-month are respected.
  // Derived purely from searchParams, so it stays cache-key-safe below.
  if (tab === "sleep" && !sp.range) state.preset = "last-7d";
  return <CachedInsights state={state} tab={tab} />;
}

/**
 * The RSC payload for a given (period, tab) is pure code-derived UI — all data
 * is client-fetched — so it's cached: repeat visits skip the server render,
 * and within the profile's client `stale` window the router serves surface
 * back-navigation from browser memory with no roundtrip at all.
 */
async function CachedInsights({
  state,
  tab,
}: {
  state: PeriodState;
  tab: InsightsTab;
}) {
  "use cache";
  cacheLife("hours");
  return <InsightsShell initialState={state} initialTab={tab} />;
}
