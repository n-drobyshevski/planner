import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  Badge,
} from "planner";

export function EventSchedule() {
  return (
    <Table>
      <TableCaption>This week · shared calendar</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Event</TableHead>
          <TableHead>Day</TableHead>
          <TableHead>Time</TableHead>
          <TableHead className="text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">Dentist — Mara</TableCell>
          <TableCell>Tue, Jun 16</TableCell>
          <TableCell>9:00 AM</TableCell>
          <TableCell className="text-right">
            <Badge variant="secondary">Confirmed</Badge>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Grocery run</TableCell>
          <TableCell>Wed, Jun 17</TableCell>
          <TableCell>6:30 PM</TableCell>
          <TableCell className="text-right">
            <Badge variant="outline">Planned</Badge>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Dinner with Eli</TableCell>
          <TableCell>Thu, Jun 18</TableCell>
          <TableCell>7:30 PM</TableCell>
          <TableCell className="text-right">
            <Badge>Shared</Badge>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Pay rent</TableCell>
          <TableCell>Fri, Jun 19</TableCell>
          <TableCell>All day</TableCell>
          <TableCell className="text-right">
            <Badge variant="destructive">Due</Badge>
          </TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>4 events</TableCell>
          <TableCell className="text-right">2 shared</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

export function TaskBreakdown() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Task</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead className="text-right">Due</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow data-state="selected">
          <TableCell className="font-medium">Book summer flights</TableCell>
          <TableCell>Mara</TableCell>
          <TableCell className="text-right">Jun 20</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Renew passport</TableCell>
          <TableCell>Eli</TableCell>
          <TableCell className="text-right">Jul 02</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Water the plants</TableCell>
          <TableCell>Shared</TableCell>
          <TableCell className="text-right">—</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
