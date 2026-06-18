import { ScrollArea } from "planner";

const agenda = [
  { time: "7:00 AM", title: "Morning run", who: "Eli" },
  { time: "9:00 AM", title: "Dentist — Mara", who: "Mara" },
  { time: "11:30 AM", title: "Team standup", who: "Eli" },
  { time: "12:30 PM", title: "Lunch with Sam", who: "Shared" },
  { time: "2:00 PM", title: "Pick up dry cleaning", who: "Mara" },
  { time: "3:30 PM", title: "Call the plumber", who: "Eli" },
  { time: "5:00 PM", title: "Grocery run", who: "Shared" },
  { time: "6:30 PM", title: "Yoga class", who: "Mara" },
  { time: "7:30 PM", title: "Dinner with Eli", who: "Shared" },
  { time: "9:00 PM", title: "Plan the weekend", who: "Shared" },
];

export function AgendaScroll() {
  return (
    <ScrollArea className="h-64 w-72 rounded-2xl border">
      <div className="p-3">
        <p className="px-1 pb-2 text-sm font-medium">Thursday, Jun 18</p>
        <ul className="flex flex-col">
          {agenda.map((e) => (
            <li
              key={e.time}
              className="flex items-baseline gap-3 border-b py-2 last:border-0"
            >
              <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">
                {e.time}
              </span>
              <span className="flex-1 text-sm">{e.title}</span>
              <span className="text-xs text-muted-foreground">{e.who}</span>
            </li>
          ))}
        </ul>
      </div>
    </ScrollArea>
  );
}

export function NoteScroll() {
  return (
    <ScrollArea className="h-48 w-72 rounded-2xl border p-4 text-sm text-muted-foreground">
      <p className="mb-2 font-medium text-foreground">Trip notes</p>
      <p className="mb-2">
        Booking window opens Friday — Mara to confirm dates before we lock the
        flights. Passport renewal needs to land before July.
      </p>
      <p className="mb-2">
        Ask Sam whether the lake cabin is free the last week of August. If not,
        the coast is the backup.
      </p>
      <p className="mb-2">
        Remember to pause mail delivery and arrange for the plants while we are
        away. Eli has the spare key for the neighbour.
      </p>
      <p>Budget roughly 1,200 for the long weekend, flights included.</p>
    </ScrollArea>
  );
}
