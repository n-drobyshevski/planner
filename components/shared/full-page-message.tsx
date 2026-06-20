import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The app's one quiet full-page terminal state: a centered icon tile, a short
 * heading, an optional line of muted copy, and an optional row of actions. It is
 * the generalization of the share surface's `PublicShareInactive` look, kept
 * deliberately calm (no decoration, no motion) so it reads as part of the app
 * rather than an alarm.
 *
 * Provider-free on purpose: no `useTranslations`, no theme/query hooks, no motion
 * library. That lets it render from Server Components (`not-found.tsx`), Client
 * error boundaries (`error.tsx`), and even `global-error.tsx` — which renders
 * outside every provider. Callers pass already-resolved strings.
 *
 * `className` controls the outer wrapper height: the default `min-h-dvh` fills the
 * viewport for true full-page boundaries; pass `h-full` to center within an
 * existing shell (e.g. the surfaces nav frame).
 */
export function FullPageMessage({
  icon: Icon,
  title,
  description,
  className,
  alert = false,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  className?: string;
  /** Set for genuine error states so assistive tech announces it. Omit for 404. */
  alert?: boolean;
  /** Action row (buttons / links). */
  children?: React.ReactNode;
}) {
  return (
    <main
      role={alert ? "alert" : undefined}
      className={cn(
        "flex min-h-dvh w-full flex-col items-center justify-center p-6 text-center",
        className,
      )}
    >
      <div className="flex max-w-sm flex-col items-center gap-3 text-balance">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Icon aria-hidden className="size-6 text-muted-foreground" />
        </span>
        <h1 className="text-base font-semibold text-foreground">{title}</h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
        {children ? (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {children}
          </div>
        ) : null}
      </div>
    </main>
  );
}
