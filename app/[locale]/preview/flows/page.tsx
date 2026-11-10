import { Suspense } from "react";
import { notFound } from "next/navigation";

import { FlowsPreview } from "./preview-client";

/**
 * Dev-only sandbox for the Flows view (tasks / streams modes, attention, tags,
 * saved streams) with the real components and tokens over hand-made fixture
 * data, without app data or auth. Like /preview/dialogs, a production build
 * renders `notFound()`, so the route ships effectively unreachable.
 *
 * Query params preset the display: `mode` (tasks|streams), `group`, `sort`,
 * `dir`, `attention`, `scope`, `expand` (a stream key), `dialog=task` (opens
 * the create-task dialog, with tag suggestions).
 */
export default function PreviewFlowsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  // The client reads the clock and the query string; both sit below Suspense.
  return (
    <Suspense>
      <FlowsPreview />
    </Suspense>
  );
}
