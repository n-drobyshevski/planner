import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
  Avatar,
  AvatarFallback,
  Button,
} from "planner";
import { CalendarClock } from "lucide-react";

export function MemberHoverCard() {
  return (
    <HoverCard open>
      <HoverCardTrigger asChild>
        <Button variant="link" className="px-0">
          @mara
        </Button>
      </HoverCardTrigger>
      <HoverCardContent align="start">
        <div className="flex gap-3">
          <Avatar>
            <AvatarFallback>MR</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1">
            <p className="font-medium text-foreground">Mara Reyes</p>
            <p className="text-sm text-muted-foreground">
              Sharing this calendar with you since March.
            </p>
            <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5" /> Next free evening: Friday
            </span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
