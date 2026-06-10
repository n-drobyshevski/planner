import { Suspense } from "react";
import { InsightsShell } from "@/components/insights/insights-shell";
import { parsePeriodSearch, parseTabParam } from "@/lib/insights/period";

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
    <Suspense fallback={null}>
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
  return (
    <InsightsShell initialState={parsePeriodSearch(sp)} initialTab={parseTabParam(sp.tab)} />
  );
}
