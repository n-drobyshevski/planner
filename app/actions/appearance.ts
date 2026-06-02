"use server";

import { revalidateTag } from "next/cache";
import { appearanceTag } from "@/lib/theme/appearance";

/**
 * Bust the server-cached appearance read for one member after they change an
 * appearance preference (accent / surface tone / palette). The layout caches
 * the members row per auth user (see `app/layout.tsx`), so this is the only way
 * a client-side preference write makes the next server-rendered navigation pick
 * up the new colors immediately instead of waiting for the time-based revalidate.
 */
export async function revalidateAppearance(authUserId: string): Promise<void> {
  if (!authUserId) return;
  revalidateTag(appearanceTag(authUserId), "max");
}
