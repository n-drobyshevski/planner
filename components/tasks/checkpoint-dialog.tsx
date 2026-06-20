"use client";

import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useTranslations } from "next-intl";
import { Flag, Diamond, Star, Circle, Triangle, Trash2 } from "lucide-react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
  FieldContent,
  FieldDescription,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ColorField } from "@/components/shared/color-field";
import { useCheckpointMutations } from "@/lib/hooks/use-checkpoint-mutations";
import { checkpointFormSchema, type CheckpointFormValues } from "@/lib/tasks/schemas";
import { msToDateInput } from "@/lib/datetime/local";
import type { CheckpointInput } from "@/lib/supabase/mappers";
import type { CheckpointShape, TaskCheckpoint } from "@/lib/types";

export interface CheckpointDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  workspaceId: string;
  currentMemberId: string;
  /** the flow (top-level task) the checkpoint attaches to */
  taskId: string;
  /** the flow's title, shown as the dialog subtitle */
  taskTitle: string;
  /** create mode: the date to prefill ("yyyy-MM-dd"), from right-click or canvas click */
  defaultAtDate?: string;
  /** edit mode: the checkpoint being edited */
  checkpoint?: TaskCheckpoint | null;
}

const SHAPES: CheckpointShape[] = ["flag", "diamond", "star", "dot", "triangle"];
const SHAPE_ICON = {
  flag: Flag,
  diamond: Diamond,
  star: Star,
  dot: Circle,
  triangle: Triangle,
} as const;

function buildInitial(props: CheckpointDialogProps): CheckpointFormValues {
  if (props.mode === "edit" && props.checkpoint) {
    const c = props.checkpoint;
    return { title: c.title, atDate: c.atDate, reached: c.reached, color: c.color, shape: c.shape };
  }
  return {
    title: "",
    atDate: props.defaultAtDate || msToDateInput(Date.now()),
    reached: false,
    color: null,
    shape: "flag",
  };
}

export function CheckpointDialog(props: CheckpointDialogProps) {
  const { open, onOpenChange, mode, workspaceId, currentMemberId, taskId, taskTitle, checkpoint } =
    props;
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const mutations = useCheckpointMutations(workspaceId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Conditionally mounted by the shell (remounts per open), so defaults are
  // computed exactly once — no re-seed effect.
  const [defaults] = useState(() => buildInitial(props));
  const form = useForm({
    defaultValues: defaults,
    validators: { onSubmit: checkpointFormSchema },
    onSubmit: ({ value }) => onValid(value),
  });

  function close() {
    onOpenChange(false);
  }

  async function onValid(values: CheckpointFormValues) {
    if (mode === "create") {
      const input: CheckpointInput = {
        workspaceId,
        taskId,
        title: values.title.trim(),
        atDate: values.atDate,
        reached: values.reached,
        reachedAt: values.reached ? Date.now() : null,
        color: values.color,
        shape: values.shape,
        createdBy: currentMemberId,
        position: Date.now(),
      };
      const ok = await mutations.create(input);
      if (ok) onOpenChange(false);
      return;
    }
    if (!checkpoint) return;
    // Keep the existing reached stamp if still reached; set now if newly reached.
    const reachedAt = values.reached
      ? checkpoint.reached
        ? checkpoint.reachedAt ?? Date.now()
        : Date.now()
      : null;
    const patch: Partial<CheckpointInput> = {
      title: values.title.trim(),
      atDate: values.atDate,
      reached: values.reached,
      reachedAt,
      color: values.color,
      shape: values.shape,
    };
    const prev: Partial<CheckpointInput> = {
      title: checkpoint.title,
      atDate: checkpoint.atDate,
      reached: checkpoint.reached,
      reachedAt: checkpoint.reachedAt,
      color: checkpoint.color,
      shape: checkpoint.shape,
    };
    close();
    void mutations.update(checkpoint, patch, prev, { ...patch });
  }

  function onDelete() {
    if (!checkpoint) return;
    setConfirmDelete(false);
    close();
    void mutations.remove(checkpoint);
  }

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {mode === "create"
                ? t("checkpointDialog.createTitle")
                : t("checkpointDialog.editTitle")}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t("checkpointDialog.onFlow", { title: taskTitle })}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <ResponsiveDialogBody>
            <FieldGroup>
              <form.Field name="title">
                {(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid || undefined}>
                      <FieldLabel htmlFor="cp-title">
                        {t("checkpointDialog.titleLabel")}
                      </FieldLabel>
                      <Input
                        id="cp-title"
                        name={field.name}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        placeholder={t("checkpointDialog.titlePlaceholder")}
                        autoFocus
                        aria-invalid={isInvalid || undefined}
                        aria-describedby={isInvalid ? "cp-title-error" : undefined}
                      />
                      {isInvalid && (
                        <FieldError id="cp-title-error" errors={field.state.meta.errors} />
                      )}
                    </Field>
                  );
                }}
              </form.Field>

              <form.Field name="atDate">
                {(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid || undefined}>
                      <FieldLabel htmlFor="cp-date">{t("checkpointDialog.dateLabel")}</FieldLabel>
                      <DatePicker
                        id="cp-date"
                        value={field.state.value}
                        onChange={field.handleChange}
                        aria-label={t("checkpointDialog.dateLabel")}
                      />
                      {isInvalid && (
                        <FieldError id="cp-date-error" errors={field.state.meta.errors} />
                      )}
                    </Field>
                  );
                }}
              </form.Field>

              <form.Field name="shape">
                {(field) => (
                  <Field>
                    <FieldLabel>{t("checkpointDialog.shapeLabel")}</FieldLabel>
                    <ToggleGroup
                      type="single"
                      variant="segmented"
                      value={field.state.value}
                      onValueChange={(v) => v && field.handleChange(v as CheckpointShape)}
                      className="justify-start"
                    >
                      {SHAPES.map((shape) => {
                        const Icon = SHAPE_ICON[shape];
                        return (
                          <ToggleGroupItem
                            key={shape}
                            value={shape}
                            aria-label={t(`checkpointDialog.shapes.${shape}`)}
                            title={t(`checkpointDialog.shapes.${shape}`)}
                          >
                            <Icon className="size-4" />
                          </ToggleGroupItem>
                        );
                      })}
                    </ToggleGroup>
                  </Field>
                )}
              </form.Field>

              <form.Field name="color">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor="cp-color">{t("checkpointDialog.colorLabel")}</FieldLabel>
                    <ColorField id="cp-color" value={field.state.value} onChange={field.handleChange} />
                  </Field>
                )}
              </form.Field>

              <form.Field name="reached">
                {(field) => (
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabel htmlFor="cp-reached">
                        {t("checkpointDialog.reachedLabel")}
                      </FieldLabel>
                      <FieldDescription>{t("checkpointDialog.reachedHint")}</FieldDescription>
                    </FieldContent>
                    <Switch
                      id="cp-reached"
                      checked={field.state.value}
                      onCheckedChange={field.handleChange}
                    />
                  </Field>
                )}
              </form.Field>
            </FieldGroup>
          </ResponsiveDialogBody>

          <ResponsiveDialogFooter className="sm:justify-between">
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <>
                  {mode === "edit" && checkpoint ? (
                    <Button
                      variant="ghost"
                      onClick={() => setConfirmDelete(true)}
                      disabled={isSubmitting}
                      className="text-destructive"
                    >
                      <Trash2 data-icon="inline-start" />
                      {tc("delete")}
                    </Button>
                  ) : (
                    <span />
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => onOpenChange(false)}
                      disabled={isSubmitting}
                    >
                      {tc("cancel")}
                    </Button>
                    <Button onClick={() => void form.handleSubmit()} disabled={isSubmitting}>
                      {isSubmitting && <Spinner data-icon="inline-start" />}
                      {mode === "create" ? tc("create") : tc("save")}
                    </Button>
                  </div>
                </>
              )}
            </form.Subscribe>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("checkpointDialog.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("checkpointDialog.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
