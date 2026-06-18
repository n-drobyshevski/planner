import { Spinner } from "planner";

export function Sizes() {
  return (
    <div className="flex items-center gap-4">
      <Spinner className="size-3" />
      <Spinner className="size-4" />
      <Spinner className="size-6" />
    </div>
  );
}

export function WithLabel() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner />
      <span>Syncing your shared calendar…</span>
    </div>
  );
}

export function Accent() {
  return (
    <div className="flex items-center gap-4">
      <Spinner className="text-primary" />
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  );
}
