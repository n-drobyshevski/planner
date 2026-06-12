"use client";

import * as React from "react";
import { useForm } from "@tanstack/react-form";
import { Users, User, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toPaletteColor } from "@/lib/theme/appearance";
import { CONTEXT_PALETTE as PALETTE } from "@/lib/contexts/palette";
import { contextFormSchema, type ContextFormValues } from "@/lib/contexts/schemas";
import { createClient } from "@/lib/supabase/client";
import { createCategory } from "@/lib/supabase/mutations";
import { qk } from "@/lib/supabase/query-keys";

// Default to Shared: the common case for a two-person planner and what every
// context was before Personal contexts existed.
function initialValues(defaultName?: string): ContextFormValues {
  return { name: defaultName ?? "", color: PALETTE[0], shared: true };
}

/**
 * Inline "create a new Context" surface, presented as a centered dialog on
 * desktop and a bottom sheet on phones (via ResponsiveDialog). Mirrors the
 * sidebar's AddCategoryPopover — same fields (name, color, Shared/Personal) and
 * same createCategory + workspace-invalidation flow — so a context created here
 * is identical to one created from the sidebar. On success it reports the new
 * id via onCreated so the opener can select it immediately.
 */
export function CreateContextDialog({
  open,
  onOpenChange,
  workspaceId,
  currentMemberId,
  defaultName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  currentMemberId: string;
  /** Seed the name field (e.g. text typed before opening). */
  defaultName?: string;
  /** Called with the new category id once it's created. */
  onCreated: (categoryId: string) => void;
}) {
  const qc = useQueryClient();

  const form = useForm({
    defaultValues: initialValues(defaultName),
    validators: { onSubmit: contextFormSchema },
    onSubmit: async ({ value }) => {
      const id = await createCategory(createClient(), {
        workspaceId,
        ownerId: value.shared ? null : currentMemberId,
        name: value.name.trim(),
        color: value.color,
      });
      await qc.invalidateQueries({ queryKey: qk.workspace });
      onCreated(id);
      onOpenChange(false);
    },
  });

  // Reset to a clean slate whenever the dialog (re)opens — it stays mounted.
  React.useEffect(() => {
    if (open) form.reset(initialValues(defaultName));
  }, [open, defaultName, form]);

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>New context</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Group related events under a shared or personal context.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <ResponsiveDialogBody className="flex flex-col gap-4 py-3">
          <form.Field name="name">
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field data-invalid={isInvalid || undefined}>
                  <Input
                    name={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="Context name"
                    onKeyDown={(e) => e.key === "Enter" && void form.handleSubmit()}
                    aria-label="Context name"
                    aria-invalid={isInvalid || undefined}
                    autoFocus
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              );
            }}
          </form.Field>

          <form.Field name="color">
            {(field) => (
              <div className="flex flex-wrap gap-2">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    aria-pressed={field.state.value === c}
                    onClick={() => field.handleChange(c)}
                    className={cn(
                      "size-7 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      field.state.value === c && "ring-2 ring-foreground",
                    )}
                    style={{ backgroundColor: toPaletteColor(c) }}
                  />
                ))}
              </div>
            )}
          </form.Field>

          <form.Field name="shared">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    {field.state.value ? (
                      <Users className="size-4 text-muted-foreground" />
                    ) : (
                      <User className="size-4 text-muted-foreground" />
                    )}
                    <span>{field.state.value ? "Shared" : "Personal"}</span>
                  </span>
                  <Switch
                    checked={field.state.value}
                    onCheckedChange={field.handleChange}
                    aria-label="Shared context — you both attend and can edit"
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  {field.state.value
                    ? "You both attend and can edit every event in it."
                    : "Only on your calendar; only you can edit its events."}
                </p>
              </div>
            )}
          </form.Field>
        </ResponsiveDialogBody>

        <ResponsiveDialogFooter>
          <form.Subscribe
            selector={(s) => [s.isSubmitting, s.values.name] as const}
          >
            {([isSubmitting, name]) => (
              <>
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => void form.handleSubmit()}
                  disabled={isSubmitting || !name.trim()}
                >
                  {isSubmitting && (
                    <Loader2 data-icon="inline-start" className="animate-spin" />
                  )}
                  Add context
                </Button>
              </>
            )}
          </form.Subscribe>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
