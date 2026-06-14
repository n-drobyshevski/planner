"use client";

import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type RecurrenceScope = "this" | "future" | "all";

export function RecurrenceScopePrompt({
  open,
  onOpenChange,
  mode,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "edit" | "delete" | "copy";
  onChoose: (scope: RecurrenceScope) => void;
}) {
  const t = useTranslations("events");
  const tc = useTranslations("common");
  const title =
    mode === "delete"
      ? t("scope.titleDelete")
      : mode === "copy"
        ? t("scope.titleCopy")
        : t("scope.titleEdit");
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {mode === "copy" ? t("scope.copyWhich") : t("scope.applyWhich")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* Copy offers just this-occurrence vs the whole series; "this and
            following" only makes sense for edit/delete. */}
        {mode === "copy" ? (
          <div className="flex flex-col gap-2">
            <Button variant="outline" onClick={() => onChoose("this")}>
              {t("scope.thisEvent")}
            </Button>
            <Button onClick={() => onChoose("all")}>{t("scope.wholeSeries")}</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button variant="outline" onClick={() => onChoose("this")}>
              {t("scope.thisEvent")}
            </Button>
            <Button variant="outline" onClick={() => onChoose("future")}>
              {t("scope.thisAndFollowing")}
            </Button>
            <Button
              variant={mode === "delete" ? "destructive" : "default"}
              onClick={() => onChoose("all")}
            >
              {t("scope.allEvents")}
            </Button>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
