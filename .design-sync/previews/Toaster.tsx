import { Button, Toaster } from "planner";
import { CircleCheckIcon, OctagonXIcon } from "lucide-react";

/**
 * The real <Toaster/> renders toasts imperatively, so a static screenshot of it
 * alone is empty. These cells reproduce the sonner toast surface (popover bg,
 * subtle border, leading status icon, message + action) so the styling is
 * visible. The actual <Toaster/> is mounted at the bottom for completeness.
 */

function ToastSurface({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-80 items-center gap-3 rounded-xl border border-border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/5">
      {icon}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function SuccessToast() {
  return (
    <>
      <ToastSurface
        icon={<CircleCheckIcon className="size-4 shrink-0 text-primary" />}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="truncate">Event saved and shared with Mara</span>
          <Button variant="ghost" size="sm" className="-mr-2 shrink-0">
            Undo
          </Button>
        </div>
      </ToastSurface>
      <Toaster />
    </>
  );
}

export function ErrorToast() {
  return (
    <ToastSurface
      icon={<OctagonXIcon className="size-4 shrink-0 text-destructive" />}
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">Couldn’t reach the calendar</span>
        <span className="text-muted-foreground">We’ll retry when you’re back online.</span>
      </div>
    </ToastSurface>
  );
}
