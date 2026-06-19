"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import type {
  CreateShareInput,
  UpdateSharePatch,
} from "@/lib/hooks/use-public-shares";
import type { PublicShareRow } from "@/lib/types";

/** Local epoch-ms <-> ISO "yyyy-MM-dd" for the DatePicker (date-only expiry). */
function msToIsoDate(ms: number | null): string {
  if (ms == null) return "";
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoDateToMs(iso: string): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  // End of the chosen day, local time — the link stays usable through that date.
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

/**
 * Create-or-edit a public share link. The whole point of the form is the
 * "privacy is legible" principle: mode and category scope are spelled out in
 * plain language so the owner always knows exactly what the link will expose
 * before they mint it.
 */
export function ShareFormDialog({
  open,
  onOpenChange,
  /** present = edit that link; absent = create a new one */
  share,
  onCreate,
  onUpdate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  share?: PublicShareRow;
  onCreate: (input: CreateShareInput) => Promise<unknown>;
  onUpdate: (id: string, patch: UpdateSharePatch) => Promise<unknown>;
}) {
  const t = useTranslations("settings");
  const workspace = useWorkspace();
  const categories = workspace.data?.categories ?? [];

  const [label, setLabel] = useState("");
  // Each disclosure axis is independent; descriptions/locations only take effect
  // when titles are shown (enforced in the UI and the RPC).
  const [showEventTitles, setShowEventTitles] = useState(true);
  const [showEventDetails, setShowEventDetails] = useState(true);
  const [showContextNames, setShowContextNames] = useState(true);
  // null = all categories; a Set = the explicit allow-list.
  const [scoped, setScoped] = useState<Set<string> | null>(null);
  const [showInactive, setShowInactive] = useState(true);
  const [expiry, setExpiry] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Seed the form whenever it opens, from the edited link or from defaults
  // (new links show everything).
  useEffect(() => {
    if (!open) return;
    setLabel(share?.label ?? "");
    setShowEventTitles(share?.showEventTitles ?? true);
    setShowEventDetails(share?.showEventDetails ?? true);
    setShowContextNames(share?.showContextNames ?? true);
    setScoped(share?.categoryIds == null ? null : new Set(share.categoryIds));
    setShowInactive(share?.showInactive ?? true);
    setExpiry(msToIsoDate(share?.expiresAt ?? null));
    setSubmitting(false);
  }, [open, share]);

  const allCategories = scoped == null;

  const toggleAll = (checked: boolean) => {
    // "All categories" on => null (no allow-list). Off => start an empty set the
    // owner then fills in.
    setScoped(checked ? null : new Set());
  };

  const toggleCategory = (id: string, checked: boolean) => {
    setScoped((prev) => {
      const next = new Set(prev ?? []);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const categoryIds = allCategories ? null : [...(scoped ?? [])];
  // With an explicit allow-list, an empty selection would expose nothing —
  // block submit until at least one category is picked.
  const invalidScope = !allCategories && categoryIds!.length === 0;

  const handleSubmit = async () => {
    if (invalidScope || submitting) return;
    const trimmed = label.trim();
    const payload: CreateShareInput = {
      label: trimmed === "" ? null : trimmed,
      showEventTitles,
      // Descriptions/locations can't be exposed while titles are hidden.
      showEventDetails: showEventTitles && showEventDetails,
      showContextNames,
      categoryIds,
      showInactive,
      expiresAt: isoDateToMs(expiry),
    };
    setSubmitting(true);
    try {
      if (share) await onUpdate(share.id, payload);
      else await onCreate(payload);
      onOpenChange(false);
    } catch {
      // The hook already toasted; keep the dialog open so nothing is lost.
      setSubmitting(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {t(share ? "sharing.dialog.editTitle" : "sharing.dialog.createTitle")}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t("sharing.dialog.description")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <ResponsiveDialogBody className="space-y-6 py-4">
          {/* Label */}
          <Field>
            <FieldLabel htmlFor="share-label">
              {t("sharing.dialog.label.label")}
            </FieldLabel>
            <Input
              id="share-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("sharing.dialog.label.placeholder")}
              maxLength={120}
              autoComplete="off"
            />
            <FieldDescription>
              {t("sharing.dialog.label.description")}
            </FieldDescription>
          </Field>

          {/* Visibility — what the link reveals, one independent switch per axis.
              "Privacy is legible": each row spells out exactly what turning it on
              exposes, so the owner reads the link's disclosure top to bottom. */}
          <FieldSet>
            <FieldLegend variant="label">
              {t("sharing.dialog.visibility.legend")}
            </FieldLegend>
            <div className="grid gap-1">
              {/* Event titles */}
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="share-titles">
                    {t("sharing.dialog.visibility.titles.label")}
                  </FieldLabel>
                  <FieldDescription>
                    {t("sharing.dialog.visibility.titles.description")}
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="share-titles"
                  checked={showEventTitles}
                  onCheckedChange={setShowEventTitles}
                />
              </Field>

              {/* Descriptions & locations — only meaningful with titles, so it
                  nests under (and disables with) the titles switch. */}
              <Field orientation="horizontal" className="pl-4">
                <FieldContent>
                  <FieldLabel htmlFor="share-details">
                    {t("sharing.dialog.visibility.details.label")}
                  </FieldLabel>
                  <FieldDescription>
                    {t("sharing.dialog.visibility.details.description")}
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="share-details"
                  checked={showEventTitles && showEventDetails}
                  disabled={!showEventTitles}
                  onCheckedChange={setShowEventDetails}
                />
              </Field>

              {/* Context-window names — the labelled day-structure bands. Works
                  independently of titles: reveal the shape of the day while events
                  stay "Busy". */}
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="share-context-names">
                    {t("sharing.dialog.visibility.contextNames.label")}
                  </FieldLabel>
                  <FieldDescription>
                    {t("sharing.dialog.visibility.contextNames.description")}
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="share-context-names"
                  checked={showContextNames}
                  onCheckedChange={setShowContextNames}
                />
              </Field>

              {/* Unavailable time — blocked/sleep hours as a shaded band. */}
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="share-unavailable">
                    {t("sharing.dialog.unavailable.label")}
                  </FieldLabel>
                  <FieldDescription>
                    {t("sharing.dialog.unavailable.description")}
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="share-unavailable"
                  checked={showInactive}
                  onCheckedChange={setShowInactive}
                />
              </Field>
            </div>
          </FieldSet>

          {/* Category scope — which categories the link can show */}
          <FieldSet>
            <FieldLegend variant="label">
              {t("sharing.dialog.scope.legend")}
            </FieldLegend>
            <FieldDescription>
              {t("sharing.dialog.scope.description")}
            </FieldDescription>
            <div className="grid gap-2">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-border p-3">
                <Checkbox
                  checked={allCategories}
                  onCheckedChange={(c) => toggleAll(c === true)}
                  aria-label={t("sharing.dialog.scope.all")}
                />
                <span className="text-sm font-medium text-foreground">
                  {t("sharing.dialog.scope.all")}
                </span>
              </label>

              {!allCategories && (
                <div className="grid gap-1.5 rounded-2xl border border-border p-2">
                  {categories.length === 0 ? (
                    <p className="px-1 py-2 text-sm text-muted-foreground">
                      {t("sharing.dialog.scope.empty")}
                    </p>
                  ) : (
                    categories.map((c) => {
                      const checked = scoped?.has(c.id) ?? false;
                      return (
                        <label
                          key={c.id}
                          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 py-1 hover:bg-muted/60"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) =>
                              toggleCategory(c.id, v === true)
                            }
                            aria-label={c.name}
                          />
                          <span
                            aria-hidden
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: c.color }}
                          />
                          <span className="text-sm text-foreground">
                            {c.name}
                          </span>
                        </label>
                      );
                    })
                  )}
                  {invalidScope && categories.length > 0 && (
                    <p className="px-1 pt-1 text-sm text-destructive">
                      {t("sharing.dialog.scope.required")}
                    </p>
                  )}
                </div>
              )}
            </div>
          </FieldSet>

          {/* Expiry */}
          <Field>
            <FieldLabel htmlFor="share-expiry">
              {t("sharing.dialog.expiry.label")}
            </FieldLabel>
            <DatePicker
              id="share-expiry"
              value={expiry}
              onChange={setExpiry}
              clearable
              placeholder={t("sharing.dialog.expiry.placeholder")}
              aria-label={t("sharing.dialog.expiry.label")}
            />
            <FieldDescription>
              {t("sharing.dialog.expiry.description")}
            </FieldDescription>
          </Field>
        </ResponsiveDialogBody>

        <ResponsiveDialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("sharing.dialog.cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={invalidScope || submitting}
          >
            {t(
              share
                ? "sharing.dialog.saveSubmit"
                : "sharing.dialog.createSubmit",
            )}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
