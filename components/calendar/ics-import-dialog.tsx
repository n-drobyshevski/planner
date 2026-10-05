"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import { ChevronDown, Users } from "lucide-react";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { TimeField } from "@/components/ui/time-field";
import { VisibilityToggle } from "@/components/event/visibility-toggle";
import { parseIcs, type IcsEvent, type IcsWarning } from "@/lib/ical/parse";
import {
  compileNameFilter,
  inRange,
  isDuplicate,
  selectedByDefault,
} from "@/lib/ical/review";
import {
  applyDraftTimes,
  draftExdates,
  draftTimes,
  icsEventToInput,
  isEdited,
  summarizableRecurrence,
  type DraftTimes,
} from "@/lib/ical/to-event-input";
import { deriveSharing, usableCategories, type EventVisibility } from "@/lib/events/sharing";
import { useEventMutations, type ImportItem } from "@/lib/hooks/use-event-mutations";
import { createClient } from "@/lib/supabase/client";
import { fetchImportDuplicates } from "@/lib/supabase/queries";
import { useViewerTimeZone } from "@/lib/datetime/timezone-context";
import { dateKeyInZone } from "@/lib/datetime/local";
import { formatOccurrenceWhen } from "@/lib/datetime/format";
import { dateFnsLocale } from "@/lib/datetime/date-locale";
import { summarizeRecurrence } from "@/lib/recurrence/rrule-build";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";

export interface IcsImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The chosen .ics file. The owner keys the dialog by it, so a new file starts fresh. */
  file: File;
  workspaceId: string;
  currentMemberId: string;
  categories: Category[];
}

type Loaded = {
  events: IcsEvent[];
  skipped: number;
  /** Keys of events already in Planr. */
  duplicates: Set<string>;
  lookupFailed: boolean;
};

type Phase = { kind: "loading" } | { kind: "error"; message: "readError" | "noEvents" } | ({ kind: "review" } & Loaded);

/**
 * The .ics import: reads the file, parses it in the viewer's zone, looks up
 * which events are already in Planr, then hands off to the review.
 */
export function IcsImportDialog({
  open,
  onOpenChange,
  file,
  workspaceId,
  currentMemberId,
  categories,
}: IcsImportDialogProps) {
  const t = useTranslations("calendar.import");
  const zone = useViewerTimeZone();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let text: string;
      try {
        text = await file.text();
      } catch {
        if (!cancelled) setPhase({ kind: "error", message: "readError" });
        return;
      }
      const { events, skipped } = parseIcs(text, { viewerZone: zone });
      if (events.length === 0) {
        if (!cancelled) setPhase({ kind: "error", message: "noEvents" });
        return;
      }
      let duplicates = new Set<string>();
      let lookupFailed = false;
      try {
        const existing = await fetchImportDuplicates(createClient(), {
          workspaceId,
          ownerId: currentMemberId,
          uids: events.flatMap((e) => (e.uid !== null ? [e.uid] : [])),
          minStart: Math.min(...events.map((e) => e.start)),
          maxEnd: Math.max(...events.map((e) => e.end)),
        });
        duplicates = new Set(events.filter((e) => isDuplicate(e, existing)).map((e) => e.key));
      } catch {
        lookupFailed = true;
      }
      // Earliest first, so the list reads like the calendar.
      const sorted = [...events].sort((a, b) => a.start - b.start);
      if (!cancelled) setPhase({ kind: "review", events: sorted, skipped, duplicates, lookupFailed });
    })();
    return () => {
      cancelled = true;
    };
    // The zone is read once: re-parsing mid-review would drop the member's edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, workspaceId, currentMemberId]);

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent size="wide" aria-describedby={undefined}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t("title")}</ResponsiveDialogTitle>
          <p className="truncate text-sm text-muted-foreground">{file.name}</p>
        </ResponsiveDialogHeader>
        {phase.kind === "review" ? (
          <ImportReview
            {...phase}
            zone={zone}
            workspaceId={workspaceId}
            currentMemberId={currentMemberId}
            categories={categories}
            onDone={() => onOpenChange(false)}
          />
        ) : (
          <ResponsiveDialogBody className="pb-6">
            {phase.kind === "loading" ? (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Spinner />
                {t("reading", { name: file.name })}
              </p>
            ) : (
              <p role="alert" className="py-6 text-sm text-muted-foreground">
                {t(phase.message)}
              </p>
            )}
          </ResponsiveDialogBody>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

/** The member's changes to one row: only the parts they touched. */
interface RowEdit {
  title?: string;
  times?: DraftTimes;
}

interface ResolvedRow {
  original: IcsEvent;
  /** The row with the member's edits applied (times only when they're valid). */
  event: IcsEvent;
  error: "end-before-start" | "invalid" | null;
  duplicate: boolean;
}

const WARNING_BADGE: Record<IcsWarning, "rruleUnsupported" | "zoneUnknown" | "rdateIgnored"> = {
  "rrule-unsupported": "rruleUnsupported",
  "zone-unknown": "zoneUnknown",
  "rdate-ignored": "rdateIgnored",
};

function ImportReview({
  events,
  skipped,
  duplicates,
  lookupFailed,
  zone,
  workspaceId,
  currentMemberId,
  categories,
  onDone,
}: Loaded & {
  zone: string;
  workspaceId: string;
  currentMemberId: string;
  categories: Category[];
  onDone: () => void;
}) {
  const t = useTranslations("calendar.import");
  const tl = useTranslations("calendar.labels");
  const te = useTranslations("events");
  const tr = useTranslations("recurrence");
  const locale = useLocale();
  const { importEvents } = useEventMutations(workspaceId);

  const [name, setName] = useState("");
  const [from, setFrom] = useState(() => dateKeyInZone(Date.now(), zone));
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => {
    const now = Date.now();
    return new Set(
      events.filter((e) => selectedByDefault(e, duplicates.has(e.key), now)).map((e) => e.key),
    );
  });
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState("none");
  const [visibility, setVisibility] = useState<EventVisibility>("visible");
  const [submitting, setSubmitting] = useState(false);

  const contexts = usableCategories(categories, currentMemberId);
  const sharing = deriveSharing(categoryId, visibility, categories);
  const nameFilter = compileNameFilter(name);

  const rows = useMemo<ResolvedRow[]>(
    () =>
      events.map((original) => {
        const edit = edits[original.key];
        const duplicate = duplicates.has(original.key);
        if (!edit) return { original, event: original, error: null, duplicate };
        const titled = { ...original, title: edit.title ?? original.title };
        if (!edit.times) return { original, event: titled, error: null, duplicate };
        const applied = applyDraftTimes(titled, edit.times, zone);
        return applied.ok
          ? { original, event: applied.event, error: null, duplicate }
          : { original, event: titled, error: applied.error, duplicate };
      }),
    [events, edits, duplicates, zone],
  );

  const range = { from: from || null, to: to || null };
  const visible = rows.filter(
    (r) => (nameFilter.ok ? nameFilter.test(r.event.title) : true) && inRange(r.event, range, zone),
  );
  const toImport = visible.filter((r) => selected.has(r.original.key));
  const blocked = !nameFilter.ok || toImport.some((r) => r.error !== null);

  function setChecked(keys: string[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (checked) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }

  function updateEdit(key: string, patch: RowEdit) {
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  async function submit() {
    if (toImport.length === 0 || blocked) return;
    const filing = {
      workspaceId,
      ownerId: currentMemberId,
      categoryId: categoryId === "none" ? null : categoryId,
      isPrivate: sharing.isPrivate,
      isShared: sharing.isShared,
    };
    const items: ImportItem[] = toImport.map((r) => ({
      input: icsEventToInput(r.event, filing),
      exdates: draftExdates(r.original, r.event),
    }));
    setSubmitting(true);
    const ok = await importEvents(items);
    setSubmitting(false);
    if (ok) onDone();
  }

  // Month headings carry the year, which the per-row "when" leaves out.
  const groups: { label: string; rows: ResolvedRow[] }[] = [];
  for (const r of visible) {
    const label = format(r.event.start, "LLLL yyyy", {
      in: tz(r.event.allDay ? "UTC" : zone),
      locale: dateFnsLocale(locale),
    });
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(r);
    else groups.push({ label, rows: [r] });
  }

  return (
    <>
      <ResponsiveDialogBody className="flex flex-col gap-4 pb-3">
        {/* Which rows: name + dates narrow the list; select all / none acts on what's shown. */}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Field>
            <FieldLabel htmlFor="ics-name">{t("nameFilter")}</FieldLabel>
            <Input
              id="ics-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              aria-invalid={!nameFilter.ok}
              aria-describedby={!nameFilter.ok ? "ics-name-error" : undefined}
              autoComplete="off"
              spellCheck={false}
            />
            {!nameFilter.ok && <FieldError id="ics-name-error">{t("invalidRegex")}</FieldError>}
          </Field>
          <Field>
            <FieldLabel>{t("dateRange")}</FieldLabel>
            <div className="flex items-center gap-2">
              <DatePicker
                value={from}
                onChange={setFrom}
                clearable
                placeholder={t("anyDate")}
                aria-label={t("from")}
                className="sm:w-36"
              />
              <span aria-hidden className="text-muted-foreground">
                –
              </span>
              <DatePicker
                value={to}
                onChange={setTo}
                clearable
                placeholder={t("anyDate")}
                aria-label={t("to")}
                className="sm:w-36"
              />
            </div>
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
            {t("shown", { shown: visible.length, total: rows.length })}
          </p>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={visible.length === 0}
              onClick={() => setChecked(visible.map((r) => r.original.key), true)}
            >
              {t("selectAll")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={visible.length === 0}
              onClick={() => setChecked(visible.map((r) => r.original.key), false)}
            >
              {t("selectNone")}
            </Button>
          </div>
        </div>

        {lookupFailed && <p className="text-sm text-muted-foreground">{t("lookupError")}</p>}

        <ScrollArea className="-mx-1 rounded-lg ring-1 ring-foreground/10 sm:h-[min(24rem,42dvh)]">
          {visible.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("noMatches")}</p>
          ) : (
            <div className="py-1">
              {groups.map((g) => (
                <section key={g.label} aria-label={g.label}>
                  <h3 className="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground first-letter:uppercase">
                    {g.label}
                  </h3>
                  <ul>
                    {g.rows.map((r) => (
                      <ImportRow
                        key={r.original.key}
                        row={r}
                        zone={zone}
                        locale={locale}
                        checked={selected.has(r.original.key)}
                        onCheckedChange={(c) => setChecked([r.original.key], c)}
                        expanded={expanded === r.original.key}
                        onToggleExpanded={() =>
                          setExpanded((k) => (k === r.original.key ? null : r.original.key))
                        }
                        edit={edits[r.original.key]}
                        onEdit={(patch) => updateEdit(r.original.key, patch)}
                        untitled={tl("untitledEvent")}
                        repeatSummary={(rrule) => {
                          const form = summarizableRecurrence(rrule);
                          return form ? summarizeRecurrence(form, tr, locale) : t("repeats");
                        }}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* How they're filed: one context + visibility for the whole import. */}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <Field>
            <FieldLabel htmlFor="ics-context">{te("dialog.context")}</FieldLabel>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="ics-context">
                <SelectValue placeholder={te("dialog.noContext")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">{te("dialog.noContext")}</SelectItem>
                  {contexts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {sharing.sharedContext ? (
            <div className="flex items-center gap-2 self-end rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              <Users className="size-4 shrink-0" />
              <span>{te("dialog.sharedContextBanner")}</span>
            </div>
          ) : (
            <Field>
              <FieldLabel>{te("dialog.sharing")}</FieldLabel>
              <VisibilityToggle
                value={visibility}
                onChange={setVisibility}
                aria-label={te("dialog.sharing")}
              />
            </Field>
          )}
        </div>
      </ResponsiveDialogBody>

      <ResponsiveDialogFooter className="sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {skipped > 0 ? t("skipped", { count: skipped }) : null}
        </p>
        <Button
          type="button"
          onClick={() => void submit()}
          disabled={toImport.length === 0 || blocked || submitting}
        >
          {submitting && <Spinner data-icon="inline-start" />}
          {t("submit", { count: toImport.length })}
        </Button>
      </ResponsiveDialogFooter>
    </>
  );
}

function ImportRow({
  row,
  zone,
  locale,
  checked,
  onCheckedChange,
  expanded,
  onToggleExpanded,
  edit,
  onEdit,
  untitled,
  repeatSummary,
}: {
  row: ResolvedRow;
  zone: string;
  locale: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  edit: RowEdit | undefined;
  onEdit: (patch: RowEdit) => void;
  untitled: string;
  repeatSummary: (rrule: string) => string;
}) {
  const t = useTranslations("calendar.import");
  const { original, event, error, duplicate } = row;
  const title = event.title.trim() || untitled;
  const edited = isEdited(original, event) || error !== null;
  const editorId = `ics-edit-${original.key}`;
  const badges: { key: string; label: string; tone: "secondary" | "outline" }[] = [
    ...(duplicate ? [{ key: "duplicate", label: t("badge.duplicate"), tone: "secondary" as const }] : []),
    ...(original.cancelled ? [{ key: "cancelled", label: t("badge.cancelled"), tone: "outline" as const }] : []),
    ...original.warnings.map((w) => ({ key: w, label: t(`badge.${WARNING_BADGE[w]}`), tone: "outline" as const })),
    ...(edited ? [{ key: "edited", label: t("badge.edited"), tone: "secondary" as const }] : []),
  ];

  return (
    <li className={cn("mx-1 rounded-lg", expanded && "bg-muted/50")}>
      <div className="flex items-start gap-3 px-2 py-2">
        <Checkbox
          checked={checked}
          onCheckedChange={(c) => onCheckedChange(c === true)}
          aria-label={t("include", { title })}
          className="mt-0.5"
        />
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-controls={expanded ? editorId : undefined}
          aria-label={t("editRow", { title })}
          className="group -my-1 flex min-w-0 flex-1 items-start gap-2 rounded-md py-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span
              className={cn(
                "truncate text-sm font-medium",
                !event.title.trim() && "text-muted-foreground",
                original.cancelled && "line-through decoration-muted-foreground",
              )}
            >
              {title}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatOccurrenceWhen(event.start, event.end, event.allDay, zone, locale)}
              {event.rrule ? ` · ${repeatSummary(event.rrule)}` : null}
            </span>
            {badges.length > 0 && (
              <span className="mt-1 flex flex-wrap gap-1">
                {badges.map((b) => (
                  <Badge key={b.key} variant={b.tone}>
                    {b.label}
                  </Badge>
                ))}
              </span>
            )}
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-150",
              expanded && "rotate-180",
            )}
          />
        </button>
      </div>
      {expanded && (
        <RowEditor
          id={editorId}
          original={original}
          event={event}
          edit={edit}
          error={error}
          zone={zone}
          onEdit={onEdit}
        />
      )}
    </li>
  );
}

function RowEditor({
  id,
  original,
  event,
  edit,
  error,
  zone,
  onEdit,
}: {
  id: string;
  original: IcsEvent;
  event: IcsEvent;
  edit: RowEdit | undefined;
  error: ResolvedRow["error"];
  zone: string;
  onEdit: (patch: RowEdit) => void;
}) {
  const t = useTranslations("calendar.import");
  const te = useTranslations("events");
  // Unedited times show the event as parsed; the first change takes over.
  const times = edit?.times ?? draftTimes(original, zone);
  const setTimes = (patch: Partial<DraftTimes>) => onEdit({ times: { ...times, ...patch } });
  const titleId = `${id}-title`;
  const allDayId = `${id}-allday`;

  return (
    <div id={id} className="flex flex-col gap-3 px-2 pt-1 pb-3 sm:pl-9">
      <Field>
        <FieldLabel htmlFor={titleId}>{t("titleLabel")}</FieldLabel>
        <Input id={titleId} value={event.title} onChange={(e) => onEdit({ title: e.target.value })} />
      </Field>
      <div className="flex flex-col gap-2">
        <label htmlFor={allDayId} className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <span>{te("dialog.allDay")}</span>
          <Switch id={allDayId} checked={times.allDay} onCheckedChange={(v) => setTimes({ allDay: v })} />
        </label>
        <div className="flex items-center gap-2">
          <span className="min-w-14 shrink-0 text-sm text-muted-foreground">{te("dialog.start")}</span>
          <DatePicker
            value={times.startDate}
            onChange={(v) => setTimes({ startDate: v })}
            aria-label={te("dialog.startDate")}
            className="flex-1"
          />
          {!times.allDay && (
            <TimeField
              value={times.startTime}
              onChange={(v) => setTimes({ startTime: v })}
              aria-label={te("dialog.startTime")}
              className="w-28 shrink-0"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="min-w-14 shrink-0 text-sm text-muted-foreground">{te("dialog.end")}</span>
          <DatePicker
            value={times.endDate}
            onChange={(v) => setTimes({ endDate: v })}
            aria-label={te("dialog.endDate")}
            className="flex-1"
          />
          {!times.allDay && (
            <TimeField
              value={times.endTime}
              onChange={(v) => setTimes({ endTime: v })}
              aria-label={te("dialog.endTime")}
              className="w-28 shrink-0"
            />
          )}
        </div>
        {error && (
          <FieldError>{error === "end-before-start" ? t("endBeforeStart") : t("invalidTimes")}</FieldError>
        )}
      </div>
    </div>
  );
}
