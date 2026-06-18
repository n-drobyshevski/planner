import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Label,
  Input,
} from "planner";

export function EditEventDialog() {
  return (
    <Dialog open>
      <DialogContent className="w-[440px]">
        <DialogHeader>
          <DialogTitle>Edit event</DialogTitle>
          <DialogDescription>
            Changes are shared with Mara as soon as you save.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" defaultValue="Dinner with Mara" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="where">Location</Label>
            <Input id="where" defaultValue="Osteria, downtown" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost">Cancel</Button>
          <Button>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
