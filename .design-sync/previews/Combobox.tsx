import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
  Button,
} from "planner";

const CATEGORIES = ["Date night", "Family", "Errands", "Work", "Health"];

// base-ui Combobox's open popup portals and only mounts on real interaction, so
// it doesn't render in static capture. The resting (closed) trigger is the
// honest, complete view of the control — a searchable single-select showing its
// current value. The list is still wired so the component is fully functional.
function Picker({ value }: { value: string }) {
  return (
    <div className="w-64">
      <Combobox items={CATEGORIES} defaultValue={value}>
        <ComboboxTrigger
          render={<Button variant="outline" className="w-full justify-between font-normal" />}
        >
          <ComboboxValue />
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxInput placeholder="Filter categories…" showTrigger={false} className="w-full" />
          <ComboboxEmpty>No category found.</ComboboxEmpty>
          <ComboboxList>
            <ComboboxLabel>Category</ComboboxLabel>
            {(item: string) => (
              <ComboboxItem key={item} value={item}>
                <span className="min-w-0 flex-1 truncate">{item}</span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

export function CategoryPicker() {
  return <Picker value="Date night" />;
}

export function FamilyPicker() {
  return <Picker value="Family" />;
}
