import { Badge } from "planner";
import { Check, Clock, Lock } from "lucide-react";

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>Confirmed</Badge>
      <Badge variant="secondary">Planned</Badge>
      <Badge variant="destructive">Conflict</Badge>
      <Badge variant="outline">Tentative</Badge>
      <Badge variant="ghost">Draft</Badge>
    </div>
  );
}

export function WithIcons() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>
        <Check data-icon="inline-start" /> Done
      </Badge>
      <Badge variant="secondary">
        <Clock data-icon="inline-start" /> 2:00 PM
      </Badge>
      <Badge variant="outline">
        <Lock data-icon="inline-start" /> Private
      </Badge>
    </div>
  );
}

export function Counts() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>3</Badge>
      <Badge variant="secondary">12</Badge>
      <Badge variant="destructive">!</Badge>
    </div>
  );
}
