import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Button,
} from "planner";
import { ChevronsUpDown } from "lucide-react";

export function EventDetails() {
  return (
    <Collapsible defaultOpen className="w-80 rounded-2xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Dinner with Eli</p>
          <p className="text-xs text-muted-foreground">Thu, Jun 18 · 7:30 PM</p>
        </div>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8">
            <ChevronsUpDown />
            <span className="sr-only">Toggle details</span>
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="mt-3 flex flex-col gap-1.5 text-sm text-muted-foreground">
        <p>Osteria, downtown — table for two reserved under Mara.</p>
        <p>Shared event · both notified.</p>
        <p>Note: pick up the gift on the way.</p>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SubtaskGroup() {
  return (
    <Collapsible defaultOpen className="w-72">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between">
          Trip checklist
          <ChevronsUpDown className="size-4" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 flex flex-col gap-1 pl-3 text-sm text-muted-foreground">
        <span>· Book summer flights</span>
        <span>· Renew passport</span>
        <span>· Pause mail delivery</span>
      </CollapsibleContent>
    </Collapsible>
  );
}
