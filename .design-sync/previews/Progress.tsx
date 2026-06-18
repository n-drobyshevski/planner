import { Progress } from "planner";

export function Steps() {
  return (
    <div className="flex w-72 flex-col gap-4">
      <Progress value={25} />
      <Progress value={60} />
      <Progress value={100} />
    </div>
  );
}

export function WithLabel() {
  return (
    <div className="w-72">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">Trip packing</span>
        <span className="text-muted-foreground">7 of 10</span>
      </div>
      <Progress value={70} />
    </div>
  );
}

export function Thick() {
  return (
    <div className="flex w-72 flex-col gap-4">
      <Progress value={45} className="h-3" />
      <Progress value={80} className="h-1" />
    </div>
  );
}
