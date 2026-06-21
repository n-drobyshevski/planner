import { Suspense } from "react";
import { notFound } from "next/navigation";

import { DialogPreview } from "./preview-client";

/**
 * Dev-only sandbox for eyeballing the two-column create/edit dialogs (Event,
 * Task, Context) with the real components + tokens, without app data or auth.
 * `NODE_ENV === "production"` is statically known, so a prod build renders this
 * as `notFound()` and the route ships effectively unreachable.
 */
export default function PreviewDialogsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  // The dialogs read the clock (Date.now) in their initial form state; under
  // Cache Components that must sit below a Suspense boundary on a client page.
  return (
    <Suspense>
      <DialogPreview />
    </Suspense>
  );
}
