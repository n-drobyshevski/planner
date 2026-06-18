import { Skeleton } from "planner";

export function EventCard() {
  return (
    <div className="flex w-72 items-center gap-3 rounded-2xl border border-border p-4">
      <Skeleton className="size-10 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

export function AgendaList() {
  return (
    <div className="flex w-72 flex-col gap-3">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-3/4" />
    </div>
  );
}

export function Shapes() {
  return (
    <div className="flex items-center gap-4">
      <Skeleton className="h-12 w-12 rounded-full" />
      <Skeleton className="h-16 w-16 rounded-2xl" />
      <Skeleton className="h-16 w-40 rounded-2xl" />
    </div>
  );
}
