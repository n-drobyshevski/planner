// Field shape for the "create context" dialog (components/shared/
// create-context-dialog.tsx). The write itself is re-checked server-side via
// the mutation layer; this schema carries the user-facing messages.
import { z } from "zod";

export const contextFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please name the context.")
    .max(100, "Keep the name under 100 characters."),
  color: z.string().min(1),
  shared: z.boolean(),
});
export type ContextFormValues = z.infer<typeof contextFormSchema>;
