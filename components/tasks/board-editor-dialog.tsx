"use client";

import * as React from "react";
import { useForm } from "@tanstack/react-form";
import { useTranslations } from "next-intl";
import { PendingIcon } from "@/components/ui/pending-icon";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
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
import { LineStyleSample } from "./line-style-sample";
import { FLOW_LINE_STYLES } from "@/lib/tasks/flow-line-styles";
import { useBoardMutations } from "@/lib/hooks/use-board-mutations";
import { boardFormSchema, type BoardFormValues } from "@/lib/tasks/schemas";
import type { Board } from "@/lib/types";

function initialValues(board?: Board | null): BoardFormValues {
  if (board) {
    return { name: board.name, lineStyle: board.lineStyle, isDone: board.isDone };
  }
  return { name: "", lineStyle: "solid", isDone: false };
}

/**
 * Create or edit one board (a kanban column / task state): its name, the Flows
 * line style drawn for tasks in this state, and whether it's the completion
 * column. Centered dialog on desktop, bottom sheet on phones.
 */
export function BoardEditorDialog({
  open,
  onOpenChange,
  mode,
  board,
  workspaceId,
  collectionId,
  /** position for a newly created column (appended after the last) */
  newPosition,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  board?: Board | null;
  workspaceId: string;
  collectionId: string;
  newPosition?: number;
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const mutations = useBoardMutations();

  const form = useForm({
    defaultValues: initialValues(board),
    validators: { onSubmit: boardFormSchema },
    onSubmit: async ({ value }) => {
      const name = value.name.trim();
      if (mode === "edit") {
        if (!board) return;
        onOpenChange(false);
        if (
          name !== board.name ||
          value.lineStyle !== board.lineStyle ||
          value.isDone !== board.isDone
        ) {
          void mutations.update(board.id, {
            name,
            lineStyle: value.lineStyle,
            isDone: value.isDone,
          });
        }
        return;
      }
      const created = await mutations.create({
        workspaceId,
        collectionId,
        name,
        lineStyle: value.lineStyle,
        isDone: value.isDone,
        position: newPosition ?? 0,
      });
      if (created) onOpenChange(false);
    },
  });

  React.useEffect(() => {
    if (open) form.reset(initialValues(board));
  }, [open, board, form]);

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {mode === "create" ? t("boardEditor.createTitle") : t("boardEditor.editTitle")}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <ResponsiveDialogBody>
          <FieldGroup>
            <form.Field name="name">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid || undefined}>
                    <FieldLabel htmlFor="board-name">{t("boardEditor.nameLabel")}</FieldLabel>
                    <Input
                      id="board-name"
                      name={field.name}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder={t("boardEditor.namePlaceholder")}
                      onKeyDown={(e) => e.key === "Enter" && void form.handleSubmit()}
                      aria-invalid={isInvalid || undefined}
                      autoFocus
                    />
                    <FieldError errors={field.state.meta.errors} visible={isInvalid} />
                  </Field>
                );
              }}
            </form.Field>

            <form.Field name="lineStyle">
              {(field) => (
                <Field>
                  <FieldLabel>{t("boardEditor.lineStyleLabel")}</FieldLabel>
                  <FieldDescription>{t("boardEditor.lineStyleHint")}</FieldDescription>
                  <div className="flex flex-wrap gap-2">
                    {FLOW_LINE_STYLES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-label={t(`flowLineStyle.${s}`)}
                        aria-pressed={field.state.value === s}
                        onClick={() => field.handleChange(s)}
                        className={cn(
                          "flex h-7 items-center rounded-md border border-border px-2 ring-offset-2 ring-offset-background transition-[background-color,transform] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]",
                          field.state.value === s && "border-foreground/30 ring-2 ring-foreground",
                        )}
                      >
                        <LineStyleSample style={s} color="currentColor" />
                      </button>
                    ))}
                  </div>
                </Field>
              )}
            </form.Field>

            <form.Field name="isDone">
              {(field) => (
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="board-done">{t("boardEditor.isDoneLabel")}</FieldLabel>
                    <FieldDescription>{t("boardEditor.isDoneHint")}</FieldDescription>
                  </FieldContent>
                  <Switch
                    id="board-done"
                    checked={field.state.value}
                    onCheckedChange={field.handleChange}
                  />
                </Field>
              )}
            </form.Field>
          </FieldGroup>
        </ResponsiveDialogBody>

        <ResponsiveDialogFooter>
          <form.Subscribe selector={(s) => [s.isSubmitting, s.values.name] as const}>
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
                  {mode === "create" ? t("boardEditor.add") : tc("save")}
                </Button>
              </>
            )}
          </form.Subscribe>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
