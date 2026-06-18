import {
  FieldSet,
  FieldGroup,
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldSection,
  Input,
  Textarea,
} from "planner";

export function FormSection() {
  return (
    <FieldSet className="w-80">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="f-title">Title</FieldLabel>
          <Input id="f-title" defaultValue="Dinner with Mara" />
        </Field>
        <Field>
          <FieldLabel htmlFor="f-notes">Notes</FieldLabel>
          <Textarea id="f-notes" placeholder="Anything to remember?" />
          <FieldDescription>Visible to everyone in this calendar.</FieldDescription>
        </Field>
      </FieldGroup>
    </FieldSet>
  );
}

export function WithError() {
  return (
    <FieldSet className="w-80">
      <Field data-invalid>
        <FieldLabel htmlFor="f-end">End time</FieldLabel>
        <Input id="f-end" aria-invalid defaultValue="6:00 PM" />
        <FieldError errors={[{ message: "End time must be after the start." }]} />
      </Field>
    </FieldSet>
  );
}

export function Section() {
  return (
    <FieldSection
      title="Sharing"
      description="Choose who can see this event."
      className="w-80"
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="f-loc">Location</FieldLabel>
          <Input id="f-loc" defaultValue="Osteria, downtown" />
        </Field>
      </FieldGroup>
    </FieldSection>
  );
}
