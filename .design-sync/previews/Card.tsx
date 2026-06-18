import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
  Button,
  Badge,
} from "planner";
import { Clock, MapPin } from "lucide-react";

export function EventCard() {
  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Dinner with Mara</CardTitle>
        <CardDescription>Thursday · shared</CardDescription>
        <CardAction>
          <Badge variant="secondary">Planned</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <Clock className="size-4" /> 7:30 PM – 9:30 PM
        </span>
        <span className="flex items-center gap-2">
          <MapPin className="size-4" /> Osteria, downtown
        </span>
      </CardContent>
      <CardFooter className="gap-2">
        <Button size="sm">Confirm</Button>
        <Button size="sm" variant="ghost">
          Reschedule
        </Button>
      </CardFooter>
    </Card>
  );
}

export function SummaryCard() {
  return (
    <Card size="sm" className="w-64">
      <CardHeader>
        <CardTitle>This week</CardTitle>
        <CardDescription>4 events · 2 shared</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        You have a free evening on Friday — a good window for the dentist
        appointment you've been putting off.
      </CardContent>
    </Card>
  );
}
