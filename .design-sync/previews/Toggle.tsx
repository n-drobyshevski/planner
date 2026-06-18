import { Toggle } from "planner";
import { Star, Bell, Lock } from "lucide-react";

export function Variants() {
  return (
    <div className="flex items-center gap-2">
      <Toggle aria-label="Favorite">
        <Star data-icon="inline-start" /> Favorite
      </Toggle>
      <Toggle variant="outline" aria-label="Remind me">
        <Bell data-icon="inline-start" /> Remind me
      </Toggle>
    </div>
  );
}

export function Pressed() {
  return (
    <div className="flex items-center gap-2">
      <Toggle defaultPressed aria-label="Private">
        <Lock data-icon="inline-start" /> Private
      </Toggle>
      <Toggle variant="outline" defaultPressed aria-label="Favorite">
        <Star data-icon="inline-start" /> Favorite
      </Toggle>
    </div>
  );
}

export function Sizes() {
  return (
    <div className="flex items-center gap-2">
      <Toggle size="sm" variant="outline" aria-label="Notify, small">
        <Bell data-icon="inline-start" /> Notify
      </Toggle>
      <Toggle size="lg" variant="outline" aria-label="Notify, large">
        <Bell data-icon="inline-start" /> Notify
      </Toggle>
    </div>
  );
}
