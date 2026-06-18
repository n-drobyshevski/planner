import { Kbd, KbdGroup } from "planner";

export function Single() {
  return (
    <div className="flex items-center gap-2">
      <Kbd>N</Kbd>
      <Kbd>T</Kbd>
      <Kbd>Esc</Kbd>
    </div>
  );
}

export function Combo() {
  return (
    <KbdGroup>
      <Kbd>⌘</Kbd>
      <Kbd>K</Kbd>
    </KbdGroup>
  );
}

export function InHint() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>New event</span>
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>N</Kbd>
      </KbdGroup>
    </div>
  );
}
