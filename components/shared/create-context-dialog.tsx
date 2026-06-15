"use client";

import * as React from "react";
import { useForm } from "@tanstack/react-form";
import { useTranslations } from "next-intl";
import { Users, User } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
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
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldContent,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
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
  const t = useTranslations("nav");
  const tc = useTranslations("common");
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
          <ResponsiveDialogTitle>{t("createContext.title")}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t("createContext.description")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <ResponsiveDialogBody>
          <FieldGroup>
            <form.Field name="name">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid || undefined}>
                    <FieldLabel htmlFor="ctx-name" className="sr-only">
                      {t("createContext.nameLabel")}
                    </FieldLabel>
                    <Input
                      id="ctx-name"
                      name={field.name}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder={t("createContext.namePlaceholder")}
                      onKeyDown={(e) => e.key === "Enter" && void form.handleSubmit()}
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
                <Field>
                  <FieldLabel>{t("createContext.colorLabel")}</FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    {PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={t("createContext.colorAriaLabel", { color: c })}
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
                </Field>
              )}
            </form.Field>

            <form.Field name="shared">
              {(field) => (
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="ctx-shared" className="flex items-center gap-2">
                      {field.state.value ? (
                        <Users className="size-4 text-muted-foreground" />
                      ) : (
                        <User className="size-4 text-muted-foreground" />
                      )}
                      {field.state.value
                        ? t("createContext.shared")
                        : t("createContext.personal")}
                    </FieldLabel>
                    <FieldDescription>
                      {field.state.value
                        ? t("createContext.sharedHint")
                        : t("createContext.personalHint")}
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id="ctx-shared"
                    checked={field.state.value}
                    onCheckedChange={field.handleChange}
                    aria-label={t("createContext.sharedSwitchAriaLabel")}
                  />
                </Field>
              )}
            </form.Field>
          </FieldGroup>
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
                  {tc("cancel")}
                </Button>
                <Button
                  onClick={() => void form.handleSubmit()}
                  disabled={isSubmitting || !name.trim()}
                >
                  {isSubmitting && (
                    <Spinner data-icon="inline-start" />
                  )}
                  {t("createContext.submit")}
                </Button>
              </>
            )}
          </form.Subscribe>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
