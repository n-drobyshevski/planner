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
import { Field, FieldError } from "@/components/ui/field";
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
import { useBoardMutations } from "@/lib/hooks/use-board-mutations";
import { boardFormSchema, type BoardFormValues } from "@/lib/tasks/schemas";
import type { Board } from "@/lib/types";

function initialValues(mode: "create" | "edit", board?: Board | null): BoardFormValues {
  if (mode === "edit" && board) {
    return {
      name: board.name,
      color: board.color,
      lineStyle: board.lineStyle,
      shared: board.ownerId === null,
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
 * Create or edit a task board, presented as a centered dialog on desktop and a
 * bottom sheet on phones. Mirrors CreateContextDialog — same fields (name,
 * color, Shared/Personal) and look — so a board is managed just like a context.
 * In create mode it reports the new id via onCreated so the opener can switch to
 * it immediately.
 */
export function BoardDialog({
  open,
  onOpenChange,
  mode,
  board,
  workspaceId,
  currentMemberId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  /** The board being edited (edit mode only). */
  board?: Board | null;
  workspaceId: string;
  currentMemberId: string;
  /** Called with the new board id once it's created (create mode). */
  onCreated?: (boardId: string) => void;
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const mutations = useBoardMutations();

  const form = useForm({
    defaultValues: initialValues(mode, board),
    validators: { onSubmit: boardFormSchema },
    onSubmit: async ({ value }) => {
      const name = value.name.trim();

      if (mode === "edit") {
        if (!board) return;
        // Edit: apply name/color and, if the share state changed, owner too. Both
        // mutations patch the cache optimistically, so close now and let them
        // reconcile in the background (failures surface via toast + undo).
        const isShared = board.ownerId === null;
        onOpenChange(false);
        if (
          name !== board.name ||
          value.color !== board.color ||
          value.lineStyle !== board.lineStyle
        ) {
          void mutations.update(board.id, {
            name,
            color: value.color,
            lineStyle: value.lineStyle,
          });
        }
        if (value.shared !== isShared) {
          void mutations.setShared(board.id, value.shared ? null : currentMemberId);
        }
        return;
      }

      // create: await the new id so we can switch the board view to it.
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

  // Reset to the board's values (edit) or a clean slate (create) on (re)open —
  // the dialog stays mounted between opens.
  React.useEffect(() => {
    if (!open) return;
    form.reset(initialValues(mode, board));
  }, [open, mode, board, form]);

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {mode === "create" ? t("boardDialog.createTitle") : t("boardDialog.editTitle")}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t("boardDialog.description")}
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
                    placeholder={t("boardDialog.namePlaceholder")}
                    onKeyDown={(e) => e.key === "Enter" && void form.handleSubmit()}
                    aria-label={t("boardDialog.nameLabel")}
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
                    aria-label={t("boardDialog.colorLabel", { color: c })}
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

          <form.Field name="lineStyle">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">
                  {t("boardDialog.lineStyleLabel")}
                </p>
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
                    <span>{field.state.value ? t("boardDialog.shared") : t("boardDialog.personal")}</span>
                  </span>
                  <Switch
                    checked={field.state.value}
                    onCheckedChange={field.handleChange}
                    aria-label={t("boardDialog.sharedToggleLabel")}
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  {field.state.value
                    ? t("boardDialog.sharedHint")
                    : t("boardDialog.personalHint")}
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
                  {tc("cancel")}
                </Button>
                <Button
                  onClick={() => void form.handleSubmit()}
                  disabled={isSubmitting || !name.trim()}
                >
                  {isSubmitting && (
                    <Spinner data-icon="inline-start" />
                  )}
                  {mode === "create" ? t("boardDialog.addBoard") : tc("save")}
                </Button>
              </>
            )}
          </form.Subscribe>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
