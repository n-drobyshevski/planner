import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "planner";

export function SharingSelect() {
  return (
    <Select defaultValue="shared">
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Who can see this?" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Visibility</SelectLabel>
          <SelectItem value="shared">Shared with Mara</SelectItem>
          <SelectItem value="private">Just me</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function RepeatSelectOpen() {
  return (
    <Select defaultValue="WEEKLY" open>
      <SelectTrigger className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Repeat</SelectLabel>
          <SelectItem value="none">Does not repeat</SelectItem>
          <SelectItem value="DAILY">Every day</SelectItem>
          <SelectItem value="WEEKLY">Every week</SelectItem>
          <SelectSeparator />
          <SelectItem value="MONTHLY">Every month</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
