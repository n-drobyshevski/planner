import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
  Button,
  Field,
  FieldLabel,
  Input,
  Textarea,
} from "planner";

export function EditEvent() {
  return (
    <ResponsiveDialog open>
      <ResponsiveDialogContent className="w-[440px]">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Dinner with Mara</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Changes are shared with Mara as soon as you save.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogBody className="flex flex-col gap-3 py-2">
          <Field>
            <FieldLabel htmlFor="rd-title">Title</FieldLabel>
            <Input id="rd-title" defaultValue="Dinner with Mara" />
          </Field>
          <Field>
            <FieldLabel htmlFor="rd-loc">Location</FieldLabel>
            <Input id="rd-loc" defaultValue="Osteria, downtown" />
          </Field>
          <Field>
            <FieldLabel htmlFor="rd-notes">Notes</FieldLabel>
            <Textarea id="rd-notes" placeholder="Anything to remember?" />
          </Field>
        </ResponsiveDialogBody>
        <ResponsiveDialogFooter>
          <Button variant="ghost">Cancel</Button>
          <Button>Save changes</Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
