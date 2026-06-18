import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  Button,
  Badge,
} from "planner";
import { Clock, MapPin, Users } from "lucide-react";

export function EventDetailsSheet() {
  return (
    <Sheet open>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Dinner with Mara</SheetTitle>
          <SheetDescription>Thursday, June 19 · shared</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <Clock className="size-4" /> 7:30 PM – 9:30 PM
          </span>
          <span className="flex items-center gap-2">
            <MapPin className="size-4" /> Osteria, downtown
          </span>
          <span className="flex items-center gap-2">
            <Users className="size-4" /> You and Mara
          </span>
          <Badge variant="secondary" className="w-fit">
            Planned
          </Badge>
        </div>
        <SheetFooter>
          <Button>Edit event</Button>
          <Button variant="ghost">Reschedule</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
