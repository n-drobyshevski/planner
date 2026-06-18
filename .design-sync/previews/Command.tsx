import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "planner";
import { CalendarPlus, Search, Users, Moon } from "lucide-react";

export function EventSearch() {
  return (
    <Command className="w-80 ring-1 ring-foreground/5 shadow-lg">
      <CommandInput placeholder="Search events and people…" />
      <CommandList>
        <CommandEmpty>No matches found.</CommandEmpty>
        <CommandGroup heading="This week">
          <CommandItem>
            <Search />
            Dinner with Mara
            <CommandShortcut>Thu</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <Users />
            Parents over for lunch
            <CommandShortcut>Sun</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <Moon />
            Early night before the flight
            <CommandShortcut>Fri</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem>
            <CalendarPlus />
            New event
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
