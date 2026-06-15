"use client";

import * as React from "react";
import { useForm } from "@tanstack/react-form";
import { Users, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";
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
import {
  FLOW_LINE_STYLES,
  lineStyleStroke,
  wavePath,
  type FlowLineStyle,
} from "@/lib/tasks/flow-line-styles";
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
      lineStyle: collection.lineStyle,
      shared: collection.ownerId === null,
    };
  }
  // Default to Shared: the common case for a two-person planner.
  return { name: "", color: PALETTE[0], lineStyle: "solid", shared: true };
}

/** A short stroke drawn in `style`, tinted `color` — the picker's live preview. */
function LineStyleSample({ style, color }: { style: FlowLineStyle; color?: string }) {
  const { dasharray, opacityScale, wavy } = lineStyleStroke(style);
  const W = 40;
  const H = 14;
  const y = H / 2;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="block">
      {wavy ? (
        <path
          d={wavePath(3, W - 3, y)}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeOpacity={opacityScale}
          strokeLinecap="round"
        />
      ) : (
        <line
          x1={3}
          y1={y}
          x2={W - 3}
          y2={y}
          stroke={color}
          strokeWidth={2}
          strokeOpacity={opacityScale}
          strokeDasharray={dasharray}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
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
        if (
          name !== collection.name ||
          value.color !== collection.color ||
          value.lineStyle !== collection.lineStyle
        ) {
          void mutations.update(collection.id, {
            name,
            color: value.color,
            lineStyle: value.lineStyle,
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
        lineStyle: value.lineStyle,
        sortOrder: Date.now(),
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
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
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

            <form.Field name="lineStyle">
              {(field) => (
                <Field>
                  <FieldLabel>{t("collectionDialog.lineStyleLabel")}</FieldLabel>
                  <form.Subscribe selector={(s) => s.values.color}>
                    {(color) => (
                      <div className="flex flex-wrap gap-2">
                        {FLOW_LINE_STYLES.map((s) => (
                          <button
                            key={s}
                            type="button"
                            aria-label={t(`flowLineStyle.${s}`)}
                            aria-pressed={field.state.value === s}
                            onClick={() => field.handleChange(s)}
                            className={cn(
                              "flex h-7 items-center rounded-md border border-border px-2 ring-offset-2 ring-offset-background transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              field.state.value === s && "border-foreground/30 ring-2 ring-foreground",
                            )}
                          >
                            <LineStyleSample style={s} color={toPaletteColor(color ?? PALETTE[0])} />
                          </button>
                        ))}
                      </div>
                    )}
                  </form.Subscribe>
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
                  {isSubmitting && (
                    <Spinner data-icon="inline-start" />
                  )}
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
