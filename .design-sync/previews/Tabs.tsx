import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "planner";
import { CalendarDays, ListTodo, Moon } from "lucide-react";

export function PlannerTabs() {
  return (
    <Tabs defaultValue="agenda" className="w-80">
      <TabsList>
        <TabsTrigger value="agenda">
          <CalendarDays /> Agenda
        </TabsTrigger>
        <TabsTrigger value="tasks">
          <ListTodo /> Tasks
        </TabsTrigger>
        <TabsTrigger value="sleep">
          <Moon /> Sleep
        </TabsTrigger>
      </TabsList>
      <TabsContent value="agenda" className="pt-3 text-muted-foreground">
        <p className="font-medium text-foreground">Thursday, Jun 18</p>
        <p>Dinner with Eli at 7:30 PM, plus a free morning window.</p>
      </TabsContent>
      <TabsContent value="tasks" className="pt-3 text-muted-foreground">
        Two tasks due this week — flights and passport.
      </TabsContent>
      <TabsContent value="sleep" className="pt-3 text-muted-foreground">
        You averaged 7h 20m over the last week.
      </TabsContent>
    </Tabs>
  );
}

export function RangeTabs() {
  return (
    <Tabs defaultValue="week" className="w-64">
      <TabsList variant="line">
        <TabsTrigger value="day">Day</TabsTrigger>
        <TabsTrigger value="week">Week</TabsTrigger>
        <TabsTrigger value="month">Month</TabsTrigger>
      </TabsList>
      <TabsContent value="week" className="pt-3 text-muted-foreground">
        Jun 15 – Jun 21 · 4 events, 2 shared.
      </TabsContent>
    </Tabs>
  );
}
