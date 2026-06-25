import {
  DisclosureSection,
  Field,
  FieldLabel,
  Input,
  Textarea,
} from "planner";

// Controlled collapsible section header used in the event/task dialogs for
// "More options" / "Optimization details". open/onOpenChange are required —
// these static cells pass a literal open state with a no-op handler.
const noop = () => {};

export function MoreOptions() {
  return (
    <div className="w-96">
      <DisclosureSection
        title="More options"
        open
        onOpenChange={noop}
        contentClassName="flex flex-col gap-4"
      >
        <Field>
          <FieldLabel htmlFor="ds-location">Location</FieldLabel>
          <Input id="ds-location" defaultValue="Osteria, downtown" />
        </Field>
        <Field>
          <FieldLabel htmlFor="ds-notes">Notes</FieldLabel>
          <Textarea
            id="ds-notes"
            rows={2}
            defaultValue="Table for two reserved under Mara. Pick up the gift on the way."
          />
        </Field>
      </DisclosureSection>
    </div>
  );
}

export function Collapsed() {
  return (
    <div className="w-96">
      <DisclosureSection
        title="More options"
        open={false}
        onOpenChange={noop}
        summary="Osteria · 2 guests"
      >
        <Field>
          <FieldLabel htmlFor="ds-location-2">Location</FieldLabel>
          <Input id="ds-location-2" defaultValue="Osteria, downtown" />
        </Field>
      </DisclosureSection>
    </div>
  );
}

export function ReadOnly() {
  return (
    <div className="w-96">
      <DisclosureSection
        title="Optimization details"
        open
        onOpenChange={noop}
        forceOpen
        contentClassName="flex flex-col gap-4"
      >
        <Field>
          <FieldLabel htmlFor="ds-effort">Effort</FieldLabel>
          <Input id="ds-effort" defaultValue="Focused — 90 min" readOnly />
        </Field>
      </DisclosureSection>
    </div>
  );
}
