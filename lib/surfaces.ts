/**
 * Canonical left-to-right order of the top-level app surfaces. Drives both the
 * AppNav dropdown and the header swipe gesture so they can never disagree.
 */
export const SURFACE_PATHS = ["/calendar", "/tasks", "/inbox", "/insights"] as const;

export type SurfacePath = (typeof SURFACE_PATHS)[number];
