// Shared motion config for the `motion` library. Mirrors the CSS motion tokens
// in app/globals.css (--ease-* / --dur-*) so JS-driven and CSS-driven motion
// stay coherent. The `motion` library takes duration in SECONDS and easing as
// cubic-bezier arrays.
//
// Reduced motion is handled GLOBALLY by <MotionConfig reducedMotion="user"> in
// app/providers.tsx — it makes the library drop transform/layout animations for
// users who ask for it, the same way the global @media (prefers-reduced-motion)
// rule disables CSS transitions. So variants here can safely include y/scale
// without each call site re-checking; reach for useReducedMotion() only when a
// component needs a bespoke reduced path (e.g. crossfade instead of slide).

import type { Transition, Variants } from "motion/react";

/** Durations in seconds (CSS tokens are ms). */
export const DUR = {
  fast: 0.15, // press, toggle, color, focus ring (== --dur-fast / duration-150)
  base: 0.2, // menus, hover, selection, most state changes (== --dur-base)
  slow: 0.3, // drawer, sheet, accordion, layout settle (== --dur-slow)
} as const;

/** Easing curves as cubic-bezier control points. Ease-out family only. */
export const EASE = {
  outQuart: [0.25, 1, 0.5, 1],
  outQuint: [0.22, 1, 0.36, 1], // default
  outExpo: [0.16, 1, 0.3, 1],
} as const;

/** Default state-change transition: snappy ease-out, ~200ms. */
export const tween: Transition = { duration: DUR.base, ease: EASE.outQuint };
export const tweenFast: Transition = { duration: DUR.fast, ease: EASE.outQuint };
export const tweenSlow: Transition = { duration: DUR.slow, ease: EASE.outQuint };

/**
 * Gentle settle spring for drop/commit moments (drag release, card landing).
 * Critically damped (damping ≈ 2·√(stiffness·mass)) so it settles firmly with
 * NO overshoot — bounce/elastic is banned in this register.
 */
export const springSettle: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 40,
  mass: 1,
};

/** Layout-animation transition for neighbors reflowing (board reorder, etc.). */
export const layoutTransition: Transition = { duration: DUR.base, ease: EASE.outQuint };

/** Fade + small rise. For AnimatePresence menu/popover/list-item enter+exit. */
export const fadeRise: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: tween },
  exit: { opacity: 0, y: 4, transition: tweenFast },
};

/** Plain crossfade. For reduced-motion paths and content swaps. */
export const fade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: tween },
  exit: { opacity: 0, transition: tweenFast },
};

/**
 * Sibling stagger for a list appearing (agenda rows, backlog cards). Legitimate
 * list choreography — cap the total so a long list never crawls in: 40ms/item,
 * and only the first ~10 are staggered (later items snap in together).
 */
export function listStagger(count: number): Transition {
  const per = 0.04;
  const capped = Math.min(count, 10);
  return { staggerChildren: per, delayChildren: 0, when: "beforeChildren", duration: per * capped };
}

export const listItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: tween },
};
