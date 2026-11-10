"use client";

// A small token field for task tags: type to add, Enter or comma commits,
// Backspace on an empty input removes the last tag, and tags already in use are
// offered as suggestions (a listbox the arrow keys walk, ARIA combobox
// pattern). Every tag goes through normalizeTag, so what the field shows is
// what gets stored. Adds and removals are announced through a polite live
// region, since the chip list changes out of the focused element.

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_TAGS, normalizeTag } from "@/lib/tasks/tags";

const MAX_SUGGESTIONS = 6;

export interface TagFieldProps {
  id: string;
  value: string[];
  onChange: (tags: string[]) => void;
  /** tags already in use (most used first), offered while typing */
  suggestions: readonly string[];
  /** id of the visible label, for the input's accessible name */
  labelId: string;
  /** id of the hint text */
  describedById?: string;
}

export function TagField({
  id,
  value,
  onChange,
  suggestions,
  labelId,
  describedById,
}: TagFieldProps) {
  const t = useTranslations("tasks");
  const listId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [announcement, setAnnouncement] = useState("");
  const full = value.length >= MAX_TAGS;

  const pending = normalizeTag(draft);
  const options = useMemo(() => {
    const q = pending ?? "";
    const matches = suggestions.filter(
      (s) => !value.includes(s) && (q === "" || s.includes(q)) && s !== q,
    );
    // Tags already in use first (prefix matches before inner ones), then the
    // typed tag as a new one. Enter with nothing highlighted adds what was typed.
    matches.sort((a, b) => Number(!a.startsWith(q)) - Number(!b.startsWith(q)));
    const top = matches.slice(0, MAX_SUGGESTIONS - 1);
    const isNew = pending !== null && !value.includes(pending) && !suggestions.includes(pending);
    return isNew ? [...top, pending] : top;
  }, [suggestions, value, pending]);
  const showList = open && !full && options.length > 0;

  function add(raw: string) {
    const parts = raw.split(",");
    const next = [...value];
    const added: string[] = [];
    for (const part of parts) {
      const tag = normalizeTag(part);
      if (tag && !next.includes(tag) && next.length < MAX_TAGS) {
        next.push(tag);
        added.push(tag);
      }
    }
    setDraft("");
    setActive(-1);
    if (added.length === 0) return;
    onChange(next);
    setAnnouncement(added.map((tag) => t("taskDialog.tagAdded", { tag })).join(" "));
  }

  function remove(tag: string) {
    onChange(value.filter((x) => x !== tag));
    setAnnouncement(t("taskDialog.tagRemoved", { tag }));
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" || e.key === ",") {
      // Enter must not submit the dialog while a tag is being typed; with an
      // empty draft and no highlighted suggestion it falls through untouched.
      const pick = showList && active >= 0 ? options[active] : null;
      if (pick || draft.trim() !== "") {
        e.preventDefault();
        e.stopPropagation();
        add(pick ?? draft);
      } else if (e.key === ",") {
        e.preventDefault();
      }
      return;
    }
    if (e.key === "Backspace" && draft === "" && value.length > 0) {
      e.preventDefault();
      remove(value[value.length - 1]);
      return;
    }
    if (e.key === "ArrowDown" && options.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % options.length);
      return;
    }
    if (e.key === "ArrowUp" && options.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
      return;
    }
    if (e.key === "Escape" && showList) {
      // Close the suggestions, not the dialog.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div className="relative">
      <div
        className={cn(
          "flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-1.5 py-1 text-base transition-colors md:text-sm",
          "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        <ul className="contents" aria-label={t("taskDialog.tagsLabel")}>
          {value.map((tag) => (
            <li
              key={tag}
              className="inline-flex h-6 items-center gap-0.5 rounded-md bg-muted pr-0.5 pl-1.5 text-xs font-medium text-foreground"
            >
              <span>
                <span aria-hidden className="text-muted-foreground">
                  #
                </span>
                {tag}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(tag);
                }}
                aria-label={t("taskDialog.tagRemove", { tag })}
                className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          aria-labelledby={labelId}
          aria-describedby={describedById}
          autoComplete="off"
          enterKeyHint="enter"
          disabled={full}
          value={draft}
          placeholder={full ? t("taskDialog.tagsMax", { max: MAX_TAGS }) : t("taskDialog.tagsPlaceholder")}
          onChange={(e) => {
            const v = e.target.value;
            // A pasted "a, b, c" commits everything before the last comma.
            if (v.includes(",")) {
              const cut = v.lastIndexOf(",");
              add(v.slice(0, cut));
              setDraft(v.slice(cut + 1));
            } else {
              setDraft(v);
            }
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Commit what was typed (so Save never drops it), then close.
            if (draft.trim() !== "") add(draft);
            setOpen(false);
            setActive(-1);
          }}
          className="h-6 min-w-24 flex-1 bg-transparent px-1 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("taskDialog.tagSuggestions")}
          className="absolute top-full right-0 left-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-soft-lg ring-1 ring-foreground/10"
        >
          {options.map((opt, i) => (
            <li
              key={opt}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: keep focus in the input so blur doesn't
              // commit the half-typed draft first.
              onMouseDown={(e) => {
                e.preventDefault();
                add(opt);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5",
                i === active && "bg-muted",
              )}
            >
              {opt === pending && !suggestions.includes(opt) ? (
                t("taskDialog.tagNew", { tag: opt })
              ) : (
                <span>
                  <span aria-hidden className="text-muted-foreground">
                    #
                  </span>
                  {opt}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
