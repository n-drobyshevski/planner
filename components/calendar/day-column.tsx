"use client";

import { useMemo, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { FolderPlus, FolderMinus, Pencil, Trash2, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { packDay } from "@/lib/layout/pack-day";
import { clashRanges } from "@/lib/layout/clash-seams";
import { enclosingContext } from "@/lib/calendar/contexts";
import { msToY, minutesToY, durationToHeight, HOUR_PX } from "@/lib/datetime/grid-math";
import { EventBlock } from "./event-block";
import { ContextBackdrop } from "./context-backdrop";
import { NowLine } from "./now-line";
import { ItemContextMenu, type ItemAction } from "@/components/shared/item-context-menu";
import type { ContextLabel, Occurrence } from "@/lib/types";

const DAY_MS = 86_400_000;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
// Children that nest inside a context are indented so the context's tinted
// frame / side label stays visible around them — that's what reads as "inside
// the zone". 15px clears the side-label strip (w-3.5 = 14px) with 1px to spare.
const NEST_L = 15; // left inset (px) for a nested event
const NEST_R = 6; // right margin (px) for a nested event (no right label)
// One-shot transition for a block that just landed from a drag/resize: ease its
// top/height/left/width into place (a calm settle, not a teleport) on the slow
// token, keeping the shadow on the fast token. Applied inline only to the
// just-committed block (see `settleKeys`); reduced motion zeroes the duration
// via the global rule. Inline overrides the block's default `transition-shadow`.
const SETTLE_TRANSITION =
  "top var(--dur-slow) var(--ease-out-quint), height var(--dur-slow) var(--ease-out-quint), left var(--dur-slow) var(--ease-out-quint), width var(--dur-slow) var(--ease-out-quint), box-shadow var(--dur-fast) var(--ease-out-quint)";

export function DayColumn({
  dayStart,
  hourPx = HOUR_PX,
  occurrences,
  isToday,
  singleColumn,
  labelStyle = "bar",
  twoCalendars,
  colorOf,
  selectedKeys,
  onSelect,
  onChangeColor,
  onColorSelected,
  onDeleteEvent,
  onAssignCategory,
  categoryChoices,
  eventShareAction,
  eventCopyAction,
  canEdit,
  taskDoneById,
  onToggleTaskDone,
  settleKeys,
}: {
  dayStart: number;
  /** Vertical scale (px per hour); defaults to the un-zoomed HOUR_PX. */
  hourPx?: number;
  occurrences: Occurrence[];
  isToday: boolean;
  /** True in day view — its one wide column keeps the context time range on phones. */
  singleColumn?: boolean;
  /** How context backdrops are labelled (top bar vs vertical side label). */
  labelStyle?: ContextLabel;
  /** True when the partner's calendar is overlaid: contexts shrink to 4/5 width
      and anchor by owner (mine left, partner right), like the event lanes. */
  twoCalendars?: boolean;
  colorOf: (o: Occurrence) => string;
  /** Multi-selection set; an occurrence is highlighted when its key is in it. */
  selectedKeys: Set<string>;
  onSelect: (o: Occurrence) => void;
  onChangeColor: (o: Occurrence, color: string | null) => void;
  /** Recolor the whole multi-selection (used when the item is part of it). */
  onColorSelected: (color: string | null) => void;
  onDeleteEvent: (o: Occurrence) => void;
  onAssignCategory?: (o: Occurrence, categoryId: string | null) => void;
  /** Contexts the viewer may assign, for the right-click menu. */
  categoryChoices?: { id: string; name: string }[];
  /** Builds the "Share / Make personal" menu action for an event (null = N/A). */
  eventShareAction?: (o: Occurrence) => ItemAction | null;
  /** Builds the "Copy to my calendar" menu action for another member's event (null = N/A). */
  eventCopyAction?: (o: Occurrence) => ItemAction | null;
  /** Owner-only editability; non-editable occurrences are read-only overlays. */
  canEdit: (o: Occurrence) => boolean;
  taskDoneById?: Map<string, boolean>;
  onToggleTaskDone?: (taskId: string) => void;
  /** Occurrence keys that just landed from a drag/resize — they ease into place
   *  once (see SETTLE_TRANSITION). Empty/undefined at rest. */
  settleKeys?: ReadonlySet<string>;
}) {
  const t = useTranslations("calendar");
  const dayEnd = dayStart + DAY_MS;

  // Timed context backdrops — drawn behind the children, NOT packed.
  const contextSegs = useMemo(
    () =>
      occurrences
        .filter((o) => !o.allDay && o.kind === "context" && o.start < dayEnd && o.end > dayStart)
        .map((o) => ({
          occ: o,
          start: Math.max(o.start, dayStart),
          end: Math.min(o.end, dayEnd),
        })),
    [occurrences, dayStart, dayEnd],
  );

  // Timed children (normal events / task-blocks). ALL children are packed
  // together in one pass so overlapping events always share columns and never
  // collide — packing per-group would let a free and a nested event both claim
  // full width and overlap. `nestedFlags` (start inside a context) only drives a
  // small indent so the context's frame stays visible around its events.
  const { segments, packed, nestedFlags } = useMemo(() => {
    const ctxOccs = contextSegs.map((s) => s.occ);
    const segs = occurrences
      .filter((o) => !o.allDay && o.kind !== "context" && o.start < dayEnd && o.end > dayStart)
      .map((o) => ({
        occ: o,
        start: Math.max(o.start, dayStart),
        end: Math.min(o.end, dayEnd),
        // Owner side drives the overlap lane: mine (editable) anchors left,
        // the other person's (read-only) anchors right. See packDay.
        mine: canEdit(o),
      }));
    const nested = segs.map((s) => enclosingContext(ctxOccs, s.occ.start) !== null);
    return { segments: segs, packed: packDay(segs), nestedFlags: nested };
  }, [occurrences, dayStart, dayEnd, contextSegs, canEdit]);

  // Direct time-overlaps within the day → a whisper hairline "seam" on the front
  // (right-staggered) block of each clashing pair, so a double-booking reads as
  // a clash instead of two innocent neighbours. Derived from the same packing.
  const clashes = useMemo(() => clashRanges(segments, packed), [segments, packed]);

  // Recolor routes to the whole selection when the item is part of a multi-pick,
  // otherwise just the one item.
  function colorChange(occ: Occurrence, color: string | null) {
    if (selectedKeys.has(occ.key) && selectedKeys.size > 1) onColorSelected(color);
    else onChangeColor(occ, color);
  }

  function contextActions(occ: Occurrence): ItemAction[] {
    // A context block paints its own category; its membership isn't reassignable.
    if (!onAssignCategory || occ.kind === "context") return [];
    const actions: ItemAction[] = [];
    const targets = (categoryChoices ?? []).filter((c) => c.id !== occ.categoryId);
    if (targets.length > 0) {
      actions.push({
        label: t("menu.assignToContext"),
        icon: FolderPlus,
        submenu: targets.map((c) => ({
          label: c.name || t("menu.untitled"),
          onSelect: () => onAssignCategory(occ, c.id),
        })),
      });
    }
    if (occ.categoryId) {
      actions.push({
        label: t("menu.clearContext"),
        icon: FolderMinus,
        onSelect: () => onAssignCategory(occ, null),
      });
    }
    return actions;
  }

  return (
    // Today's column carries a faint brand wash (4-8% of --primary) so the
    // current day reads as "today" the full height of the grid, not just via the
    // header pill — a calm, functional way to let the brand undertone reach the
    // dominant Week surface. Theme-aware: warm in the default palette, the
    // theme's accent (e.g. blue under Frappé) otherwise.
    <div className={cn("relative flex-1 border-l", isToday && "bg-primary/5 dark:bg-primary/10")}>
      {HOURS.map((h) => (
        <div
          key={h}
          style={{ height: hourPx }}
          className="border-b border-border/40"
        />
      ))}

      {/* Context backdrops (z-0), behind the event blocks. */}
      {contextSegs.map((seg) => {
        const editable = canEdit(seg.occ);
        return (
          <ItemContextMenu
            key={seg.occ.key}
            title={seg.occ.title}
            color={editable ? seg.occ.color : undefined}
            onColorChange={editable ? (c) => colorChange(seg.occ, c) : undefined}
            actions={
              editable
                ? [
                    { label: t("menu.edit"), icon: Pencil, onSelect: () => onSelect(seg.occ) },
                    {
                      label: t("menu.delete"),
                      icon: Trash2,
                      destructive: true,
                      onSelect: () => onDeleteEvent(seg.occ),
                    },
                  ]
                : [
                    { label: t("menu.open"), icon: Eye, onSelect: () => onSelect(seg.occ) },
                    ...(eventCopyAction && eventCopyAction(seg.occ)
                      ? [eventCopyAction(seg.occ)!]
                      : []),
                  ]
            }
          >
            <ContextBackdrop
              occ={seg.occ}
              color={colorOf(seg.occ)}
              selected={selectedKeys.has(seg.occ.key)}
              singleColumn={singleColumn}
              labelStyle={labelStyle}
              editable={editable}
              style={{
                top: msToY(seg.start, dayStart, hourPx),
                height: durationToHeight(seg.start, seg.end, hourPx),
                // With both calendars overlaid, shrink to 4/5 and anchor by
                // owner (mine left, partner right) so the two separate; alone,
                // span the full column.
                left: twoCalendars && !editable ? "20%" : 1,
                right: twoCalendars && editable ? "20%" : 1,
              }}
            />
          </ItemContextMenu>
        );
      })}

      {segments.map((seg, i) => {
        const p = packed[i];
        const taskId = seg.occ.taskId;
        // A nested event is inset so the context label stays visible: NEST_L on
        // the left always (also exposes the tinted frame edge), plus a matching
        // right inset in the side variant when both calendars are shown — there
        // the partner's label sits on the right edge and a full-width event
        // (pack-day gives non-overlapping items 0→100%) would otherwise cover
        // it. Free (non-nested) events keep the full width.
        const nested = nestedFlags[i];
        const gutterL = NEST_L;
        const gutterR = twoCalendars && labelStyle === "side" ? NEST_L : NEST_R;
        const left = nested
          ? `calc(${p.leftPct}% + ${gutterL}px)`
          : `calc(${p.leftPct}% + 1px)`;
        const width = nested
          ? `calc(${p.widthPct}% - ${gutterL + gutterR}px)`
          : `calc(${p.widthPct}% - 3px)`;
        const editable = canEdit(seg.occ);
        const settling = settleKeys?.has(seg.occ.key) ?? false;
        // Pixel range (relative to this block's top) for the clash seam, if any.
        const cr = clashes[i];
        const clash = cr
          ? {
              topPx: minutesToY((cr.start - seg.start) / 60000, hourPx),
              heightPx: minutesToY((cr.end - cr.start) / 60000, hourPx),
            }
          : null;
        return (
          <ItemContextMenu
            key={seg.occ.key}
            title={seg.occ.title}
            color={editable ? seg.occ.color : undefined}
            onColorChange={editable ? (c) => colorChange(seg.occ, c) : undefined}
            actions={
              editable
                ? [
                    { label: t("menu.edit"), icon: Pencil, onSelect: () => onSelect(seg.occ) },
                    ...contextActions(seg.occ),
                    ...(eventShareAction && eventShareAction(seg.occ)
                      ? [eventShareAction(seg.occ)!]
                      : []),
                    {
                      label: t("menu.delete"),
                      icon: Trash2,
                      destructive: true,
                      onSelect: () => onDeleteEvent(seg.occ),
                    },
                  ]
                : [
                    { label: t("menu.open"), icon: Eye, onSelect: () => onSelect(seg.occ) },
                    ...(eventCopyAction && eventCopyAction(seg.occ)
                      ? [eventCopyAction(seg.occ)!]
                      : []),
                  ]
            }
          >
            <EventBlock
              occ={seg.occ}
              color={colorOf(seg.occ)}
              selected={selectedKeys.has(seg.occ.key)}
              editable={editable}
              // A segment clamped to the day boundary (a cross-midnight sleep
              // block) only owns the real edge it actually contains; the other
              // edge is a midnight continuation and exposes no resize handle.
              resizableStart={seg.start === seg.occ.start}
              resizableEnd={seg.end === seg.occ.end}
              onActivate={() => onSelect(seg.occ)}
              taskDone={taskId ? taskDoneById?.get(taskId) ?? false : undefined}
              onToggleTaskDone={
                taskId && onToggleTaskDone
                  ? () => onToggleTaskDone(taskId)
                  : undefined
              }
              clash={clash}
              style={
                {
                  top: msToY(seg.start, dayStart, hourPx),
                  height: durationToHeight(seg.start, seg.end, hourPx),
                  left,
                  width,
                  // Cascade stacking order (later-starting events sit in front);
                  // EventBlock reads it as z-[var(--evt-z,10)].
                  "--evt-z": p.zIndex,
                  // Just-landed blocks ease into their new position once.
                  ...(settling ? { transition: SETTLE_TRANSITION } : null),
                } as CSSProperties
              }
            />
          </ItemContextMenu>
        );
      })}
      {isToday && <NowLine dayStart={dayStart} hourPx={hourPx} />}
    </div>
  );
}
