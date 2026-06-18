import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "planner";

export function CalendarSplit() {
  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="h-64 w-full rounded-2xl border"
    >
      <ResizablePanel defaultSize={38}>
        <div className="flex h-full flex-col gap-2 p-4">
          <p className="text-sm font-medium">June 2026</p>
          <p className="text-xs text-muted-foreground">Thursday, Jun 18</p>
          <p className="mt-auto text-xs text-muted-foreground">
            4 events this week
          </p>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={62}>
        <div className="flex h-full flex-col gap-2 p-4">
          <p className="text-sm font-medium">Agenda</p>
          <p className="text-sm text-muted-foreground">9:00 AM — Dentist, Mara</p>
          <p className="text-sm text-muted-foreground">7:30 PM — Dinner with Eli</p>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

export function ListDetail() {
  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="h-56 w-full rounded-2xl border"
    >
      <ResizablePanel defaultSize={45}>
        <div className="flex h-full flex-col gap-1 p-4 text-sm">
          <span className="font-medium">Tasks</span>
          <span className="text-muted-foreground">Book summer flights</span>
          <span className="text-muted-foreground">Renew passport</span>
          <span className="text-muted-foreground">Water the plants</span>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={55}>
        <div className="flex h-full flex-col gap-1 p-4 text-sm">
          <span className="font-medium">Book summer flights</span>
          <span className="text-muted-foreground">Owner · Mara</span>
          <span className="text-muted-foreground">Due Jun 20</span>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
