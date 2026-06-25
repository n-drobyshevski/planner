"use client";

import { AnimatePresence, m } from "motion/react";
import { Spinner } from "@/components/ui/spinner";

const bloom = {
  initial: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  transition: { type: "spring", duration: 0.3, bounce: 0 },
} as const;

/**
 * A submit button's leading glyph that animates the pending spinner in and out
 * with the same bloom (scale + blur) as ThemeToggle's icon crossfade, instead of
 * hard-swapping. `initial={false}` keeps the resting state from animating on
 * mount; reduced motion is honored by the global MotionConfig in providers.
 *
 * Two shapes:
 * - With a resting `icon`: crossfade icon ↔ spinner in place (popLayout so the
 *   spinner blooms in immediately, no wait-for-exit latency on submit). A stable
 *   `relative` wrapper carries `data-icon` so the Button's optical padding and
 *   positioning context are constant.
 * - Without an `icon`: the spinner blooms in only while pending and nothing sits
 *   in the button's flex flow when idle (matches the prior text-only layout, now
 *   animated). `data-icon` rides the spinner so padding applies only when shown.
 *
 * Pass a plain icon element (no `data-icon` of its own).
 */
export function PendingIcon({
  pending,
  icon,
}: {
  pending: boolean;
  icon?: React.ReactNode;
}) {
  if (icon == null) {
    return (
      <AnimatePresence initial={false}>
        {pending && (
          <m.span
            key="spinner"
            data-icon="inline-start"
            className="inline-flex"
            initial={bloom.initial}
            animate={bloom.animate}
            exit={bloom.exit}
            transition={bloom.transition}
          >
            <Spinner />
          </m.span>
        )}
      </AnimatePresence>
    );
  }

  return (
    <span data-icon="inline-start" className="relative inline-flex">
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={pending ? "pending" : "idle"}
          className="inline-flex"
          initial={bloom.initial}
          animate={bloom.animate}
          exit={bloom.exit}
          transition={bloom.transition}
        >
          {pending ? <Spinner /> : icon}
        </m.span>
      </AnimatePresence>
    </span>
  );
}
