import { Separator } from "planner";

export function Horizontal() {
  return (
    <div className="w-64">
      <div className="text-sm font-medium">Saturday, June 20</div>
      <Separator className="my-3" />
      <div className="text-sm text-muted-foreground">Brunch with Mara</div>
    </div>
  );
}

export function Vertical() {
  return (
    <div className="flex h-6 items-center gap-3 text-sm text-muted-foreground">
      <span>9:00 AM</span>
      <Separator orientation="vertical" />
      <span>Yoga</span>
      <Separator orientation="vertical" />
      <span>Shared</span>
    </div>
  );
}

export function InCard() {
  return (
    <div className="w-64 rounded-2xl border border-border p-4">
      <div className="text-sm font-medium">This week</div>
      <Separator className="my-3" />
      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        <span>4 events with Sam</span>
        <span>2 tasks due</span>
      </div>
    </div>
  );
}
