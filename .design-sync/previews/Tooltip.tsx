import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  Button,
} from "planner";
import { Lock } from "lucide-react";

export function PrivateEventTooltip() {
  return (
    <TooltipProvider>
      <Tooltip open>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm">
            <Lock className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Only you can see this event</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
