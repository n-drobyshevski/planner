import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware wrappers around Next's navigation APIs. Import `Link`,
 * `useRouter`, `redirect`, `usePathname`, `getPathname` from here (not from
 * `next/link` / `next/navigation`) so every navigation stays within the active
 * locale and `useRouter().replace(pathname, { locale })` can switch languages.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
