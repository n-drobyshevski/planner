"use client";

import * as React from "react";
import { useForm } from "@tanstack/react-form";
import { Users, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { PendingIcon } from "@/components/ui/pending-icon";
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
import { useCollectionMutations } from "@/lib/hooks/use-collection-mutations";
import { collectionFormSchema, type CollectionFormValues } from "@/lib/tasks/schemas";
import type { Collection } from "@/lib/types";

function initialValues(
  mode: "create" | "edit",
  collection?: Collection | null,
): CollectionFormValues {
  if (mode === "edit" && collection) {
    return {
      name: collection.name,
      color: collection.color,
      shared: collection.ownerId === null,
    };
  }
  // Default to Shared: the common case for a two-person planner.
  return { name: "", color: PALETTE[0], shared: true };
}

/**
 * Create or edit a collection, presented as a centered dialog on desktop and a
 * bottom sheet on phones. Mirrors CreateContextDialog — same fields (name,
 * color, Shared/Personal) and look — so a collection is managed just like a
 * context. In create mode it reports the new id via onCreated so the opener can
 * switch to it immediately.
 */
export function CollectionDialog({
  open,
  onOpenChange,
  mode,
  collection,
  workspaceId,
  currentMemberId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  /** The collection being edited (edit mode only). */
  collection?: Collection | null;
  workspaceId: string;
  currentMemberId: string;
  /** Called with the new collection id once it's created (create mode). */
  onCreated?: (collectionId: string) => void;
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const mutations = useCollectionMutations();

  const form = useForm({
    defaultValues: initialValues(mode, collection),
    validators: { onSubmit: collectionFormSchema },
    onSubmit: async ({ value }) => {
      const name = value.name.trim();

      if (mode === "edit") {
        if (!collection) return;
        // Edit: apply name/color and, if the share state changed, owner too. Both
        // mutations patch the cache optimistically, so close now and let them
        // reconcile in the background (failures surface via toast + undo).
        const isShared = collection.ownerId === null;
        onOpenChange(false);
        if (name !== collection.name || value.color !== collection.color) {
          void mutations.update(collection.id, {
            name,
            color: value.color,
          });
        }
        if (value.shared !== isShared) {
          void mutations.setShared(collection.id, value.shared ? null : currentMemberId);
        }
        return;
      }

      // create: await the new id so we can switch the collection view to it.
      const id = await mutations.create({
        workspaceId,
        ownerId: value.shared ? null : currentMemberId,
        name,
        color: value.color,
        sortOrder: Date.now(),
        // Seed the three default columns with localized labels.
        boardNames: {
          todo: t("status.todo"),
          inProgress: t("status.inProgress"),
          done: t("status.done"),
        },
      });
      if (id) {
        onCreated?.(id);
        onOpenChange(false);
      }
    },
  });

  // Reset to the collection's values (edit) or a clean slate (create) on (re)open
  // — the dialog stays mounted between opens.
  React.useEffect(() => {
    if (!open) return;
    form.reset(initialValues(mode, collection));
  }, [open, mode, collection, form]);

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {mode === "create"
              ? t("collectionDialog.createTitle")
              : t("collectionDialog.editTitle")}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t("collectionDialog.description")}
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
                    <FieldLabel htmlFor="col-name" className="sr-only">
                      {t("collectionDialog.nameLabel")}
                    </FieldLabel>
                    <Input
                      id="col-name"
                      name={field.name}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder={t("collectionDialog.namePlaceholder")}
                      onKeyDown={(e) => e.key === "Enter" && void form.handleSubmit()}
                      aria-invalid={isInvalid || undefined}
                      autoFocus
                    />
                    <FieldError errors={field.state.meta.errors} visible={isInvalid} />
                  </Field>
                );
              }}
            </form.Field>

            <form.Field name="color">
              {(field) => (
                <Field>
                  <FieldLabel>{t("collectionDialog.colorFieldLabel")}</FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    {PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={t("collectionDialog.colorLabel", { color: c })}
                        aria-pressed={field.state.value === c}
                        onClick={() => field.handleChange(c)}
                        className={cn(
                          "relative size-7 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]",
                          // ~36px tap target (gap is 8px, 4px/side meets the
                          // neighbor without overlapping) — visible size unchanged.
                          "after:absolute after:-inset-1 after:content-['']",
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
                    <FieldLabel htmlFor="col-shared" className="flex items-center gap-2">
                      {field.state.value ? (
                        <Users className="size-4 text-muted-foreground" />
                      ) : (
                        <User className="size-4 text-muted-foreground" />
                      )}
                      {field.state.value
                        ? t("collectionDialog.shared")
                        : t("collectionDialog.personal")}
                    </FieldLabel>
                    <FieldDescription>
                      {field.state.value
                        ? t("collectionDialog.sharedHint")
                        : t("collectionDialog.personalHint")}
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id="col-shared"
                    checked={field.state.value}
                    onCheckedChange={field.handleChange}
                    aria-label={t("collectionDialog.sharedToggleLabel")}
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
                  <PendingIcon pending={isSubmitting} />
                  {mode === "create" ? t("collectionDialog.addCollection") : tc("save")}
                </Button>
              </>
            )}
          </form.Subscribe>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
