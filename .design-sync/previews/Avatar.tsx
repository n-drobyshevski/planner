import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
} from "planner";
import { Check } from "lucide-react";

export function Sizes() {
  return (
    <div className="flex items-end gap-3">
      <Avatar size="sm">
        <AvatarImage src="https://i.pravatar.cc/80?img=5" alt="Mara" />
        <AvatarFallback>MR</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage src="https://i.pravatar.cc/80?img=12" alt="Sam" />
        <AvatarFallback>SM</AvatarFallback>
      </Avatar>
      <Avatar size="lg">
        <AvatarImage src="https://i.pravatar.cc/80?img=5" alt="Mara" />
        <AvatarFallback>MR</AvatarFallback>
      </Avatar>
    </div>
  );
}

export function Fallbacks() {
  return (
    <div className="flex items-center gap-3">
      <Avatar>
        <AvatarFallback>MR</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>SM</AvatarFallback>
      </Avatar>
    </div>
  );
}

export function WithStatus() {
  return (
    <Avatar size="lg">
      <AvatarImage src="https://i.pravatar.cc/80?img=12" alt="Sam" />
      <AvatarFallback>SM</AvatarFallback>
      <AvatarBadge>
        <Check />
      </AvatarBadge>
    </Avatar>
  );
}

export function Shared() {
  return (
    <AvatarGroup>
      <Avatar>
        <AvatarImage src="https://i.pravatar.cc/80?img=5" alt="Mara" />
        <AvatarFallback>MR</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage src="https://i.pravatar.cc/80?img=12" alt="Sam" />
        <AvatarFallback>SM</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>+2</AvatarGroupCount>
    </AvatarGroup>
  );
}
