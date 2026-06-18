import { Button } from "planner";
import { Plus, Check, Trash2, ChevronRight } from "lucide-react";

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button>Add event</Button>
      <Button variant="outline">Reschedule</Button>
      <Button variant="secondary">Today</Button>
      <Button variant="ghost">Cancel</Button>
      <Button variant="destructive">Delete</Button>
      <Button variant="link">View all</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="xs">Extra small</Button>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
    </div>
  );
}

export function WithIcons() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button>
        <Plus data-icon="inline-start" /> New task
      </Button>
      <Button variant="outline">
        Continue <ChevronRight data-icon="inline-end" />
      </Button>
      <Button variant="secondary">
        <Check data-icon="inline-start" /> Mark done
      </Button>
    </div>
  );
}

export function IconButtons() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="icon" aria-label="Add">
        <Plus />
      </Button>
      <Button size="icon" variant="outline" aria-label="Confirm">
        <Check />
      </Button>
      <Button size="icon" variant="ghost" aria-label="Delete">
        <Trash2 />
      </Button>
    </div>
  );
}

export function Disabled() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled>Saving…</Button>
      <Button variant="outline" disabled>
        Unavailable
      </Button>
    </div>
  );
}
