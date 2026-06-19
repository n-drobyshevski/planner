"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import { formatTime } from "@/lib/datetime/format";
import { dateFnsLocale } from "@/lib/datetime/date-locale";
import { allDayDateKey, dateKeyInZone } from "@/lib/datetime/local";
import {
  useViewerTimeZone,
  useSecondaryTimeZone,
} from "@/lib/datetime/timezone-context";
import { Pencil, Trash2, Eye, Repeat, Plus } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { eventStatusClass, toPaletteColor, toPaletteInk } from "@/lib/theme/appearance";
import { ItemContextMenu, type ItemAction } from "@/components/shared/item-context-menu";
import {
  SLOT_MIN,
  minutesToY,
  yToMinutes,
  snapMinutes,
} from "@/lib/datetime/grid-math";
import { DayColumn } from "./day-column";
import { resizeOccurrence, resizePreviewSegment } from "@/lib/calendar/resize";
import { movedStartTotal, previewSegments, shiftedMemberStart } from "@/lib/calendar/move";
import { useUiStore } from "@/stores/ui-store";
import { useTimelineZoom } from "@/hooks/use-timeline-zoom";
import type { ContextLabel, Occurrence } from "@/lib/types";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_MS = 86_400_000;
const MIN_NEW = 30; // minimum minutes for a drag-created event
// How long a just-dropped block keeps its one-shot position transition (the
// "settle" easing) before it goes back to a plain, transition-free block.
const SETTLE_MS = 340;
const EMPTY_KEYS: ReadonlySet<string> = new Set();
const LONG_PRESS_MS = 350; // touch hold before a move-drag arms
const TAP_TOL = 10; // px a finger may drift before a press becomes a scroll

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const clampMin = (m: number) => clamp(m, 0, 1440);

/** Compact zone label for the hour-gutter headers, e.g. "GMT+2", "PDT". */
function zoneAbbrev(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "short",
    }).formatToParts(Date.now());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? zone;
  } catch {
    return zone;
  }
}

interface Props {
  days: number[];
  occurrences: Occurrence[];
  today: number;
  colorOf: (o: Occurrence) => string;
  /** Multi-selection set (Shift+click); drives the ring highlight + bulk ops. */
  selectedKeys: Set<string>;
  onSelect: (o: Occurrence) => void;
  /** Shift+click: toggle an occurrence in/out of the multi-selection. */
  onToggleSelect: (o: Occurrence) => void;
  /** Click empty space / cleared: drop the whole multi-selection. */
  onClearSelection: () => void;
  onCreateRange: (startMs: number, endMs: number) => void;
  onReschedule: (occ: Occurrence, startMs: number, endMs: number) => void;
  /** Move/resize several selected blocks at once (same delta). `family` (Alt)
   *  applies recurring members to their whole series instead of this occurrence. */
  onRescheduleMany: (
    moves: { occ: Occurrence; start: number; end: number }[],
    family: boolean,
  ) => void;
  /** Ctrl/Cmd-drag: copy `occ` at the new time. `family` (Alt) copies a recurring
   *  item's whole series; otherwise a one-off of the occurrence. */
  onDuplicate: (occ: Occurrence, startMs: number, endMs: number, family: boolean) => void;
  /** Ctrl/Cmd-drag a multi-selection: duplicate every selected item. */
  onDuplicateMany: (
    moves: { occ: Occurrence; start: number; end: number }[],
    family: boolean,
  ) => void;
  onChangeColor: (occ: Occurrence, color: string | null) => void;
  /** Recolor the whole multi-selection (context menu on a grouped item). */
  onColorSelected: (color: string | null) => void;
  onDeleteEvent: (occ: Occurrence) => void;
  onAssignCategory?: (occ: Occurrence, categoryId: string | null) => void;
  categoryChoices?: { id: string; name: string }[];
  /** Builds the "Share / Make personal" menu action for an event (null = N/A). */
  eventShareAction?: (o: Occurrence) => ItemAction | null;
  /** Builds the "Copy to my calendar" menu action for another member's event (null = N/A). */
  eventCopyAction?: (o: Occurrence) => ItemAction | null;
  /** Owner-only editability; non-editable blocks are select-only (read-only overlay). */
  canEdit: (o: Occurrence) => boolean;
  taskDoneById?: Map<string, boolean>;
  onToggleTaskDone?: (taskId: string) => void;
  /** Drop a backlog task onto a slot to schedule a default 1h block. */
  onScheduleTask?: (taskId: string, startMs: number, endMs: number) => void;
  /** How context backdrops are labelled (top bar vs vertical side label). */
  labelStyle?: ContextLabel;
  /** True when the partner's calendar is overlaid (drives the 4/5 context split). */
  twoCalendars?: boolean;
  /** Shaded "Unavailable" bands drawn behind events (public share inactive time). */
  unavailableBands?: { start: number; end: number }[];
}

const SCHED_MIN = 60; // default minutes for a task dropped onto the grid

/** A member of a group (multi-selection) move: its start geometry, captured once. */
interface GroupMember {
  occ: Occurrence;
  sMin: number;
  dayIndex: number;
  durationMin: number;
}

interface Drag {
  kind: "create" | "move" | "resize";
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  dayIndex: number;
  // create
  anchorMin?: number;
  curMin?: number;
  // move — grid-minutes from days[0] so a block crossing midnight moves rigidly.
  occKey?: string;
  durationMin?: number;
  /** Event start, grid-minutes from the first visible column's midnight. */
  startTotal?: number;
  /** Pointer-minus-start at grab, grid-minutes. */
  grabOffsetMin?: number;
  /** Current start while dragging, grid-minutes. */
  curStartTotal?: number;
  /** another member's block: select-only, never moves/resizes */
  readonly?: boolean;
  /** when set, drag moves every selected member by the same delta (group move) */
  group?: GroupMember[];
  // resize — absolute epoch-ms so events crossing midnight resize correctly.
  edge?: "start" | "end";
  occStartMs?: number;
  occEndMs?: number;
  curStartMs?: number;
  curEndMs?: number;
}

interface Preview {
  dayIndex: number;
  topMin: number;
  heightMin: number;
  label: string;
  /** Ctrl/Cmd held during a move: the drop will duplicate, not move. */
  copy?: boolean;
  /** Alt held over a group with recurring members: the drop hits whole series. */
  series?: boolean;
  /** Continuation segments when the grabbed block crosses midnight (a moved
   *  sleep block) — drawn in the same style as the head; the label sits on the
   *  head only. Kept on `preview` so every `setPreview(null)` clears them too. */
  extra?: { dayIndex: number; topMin: number; heightMin: number }[];
}

export function TimeGrid({
  days,
  occurrences,
  today,
  colorOf,
  selectedKeys,
  onSelect,
  onToggleSelect,
  onClearSelection,
  onCreateRange,
  onReschedule,
  onRescheduleMany,
  onDuplicate,
  onDuplicateMany,
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
  onScheduleTask,
  labelStyle = "bar",
  twoCalendars,
  unavailableBands,
}: Props) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const dfLocale = dateFnsLocale(locale);
  const colsRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const hourPx = useUiStore((s) => s.hourPx);
  const dragRef = useRef<Drag | null>(null);
  const longPressRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    occKey?: string;
    moved: boolean;
    timer: number;
  } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  /** Dashed previews for the OTHER members of a group move (the grabbed block
   *  uses `preview`). */
  const [groupPreview, setGroupPreview] = useState<Preview[]>([]);
  const [armed, setArmed] = useState(false);
  const timeZone = useViewerTimeZone();
  const secondaryTimeZone = useSecondaryTimeZone();

  // Keys of blocks that just landed from a drag/resize commit. They get a brief
  // one-shot position transition in DayColumn (a calm settle into place instead
  // of a teleport), scoped to only the committed blocks and cleared after the
  // settle — so a repack or zoom never animates and there's no cost at rest.
  // Reduced motion neutralizes it via the global transition-duration rule.
  const [settleKeys, setSettleKeys] = useState<ReadonlySet<string>>(EMPTY_KEYS);
  const settleTimer = useRef<number | null>(null);
  const settle = (keys: string[]) => {
    if (keys.length === 0) return;
    if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
    setSettleKeys(new Set(keys));
    settleTimer.current = window.setTimeout(() => {
      setSettleKeys(EMPTY_KEYS);
      settleTimer.current = null;
    }, SETTLE_MS);
  };
  useEffect(
    () => () => {
      if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
    },
    [],
  );

  // --- Roving keyboard navigation -----------------------------------------
  // The columns container is the grid's one Tab stop; from it the arrow keys
  // move focus block-to-block. We read the live DOM (not a recomputed list) so
  // the order always matches what's rendered. `[role="button"]` selects only
  // EventBlocks — ContextBackdrops carry data-occ-key but no role, so the
  // backdrops are skipped. The last-focused block is remembered so re-entering
  // the grid returns to it. `pointerActive` suppresses the entry-delegation on a
  // mouse click (clicking empty space must not yank focus onto an event).
  const lastFocusedKey = useRef<string | null>(null);
  const pointerActive = useRef(false);

  const focusableBlocks = (): HTMLElement[] =>
    Array.from(
      colsRef.current?.querySelectorAll<HTMLElement>(
        '[data-occ-key][role="button"]',
      ) ?? [],
    );

  const focusBlock = (el: HTMLElement | null | undefined) => {
    if (!el) return;
    lastFocusedKey.current = el.dataset.occKey ?? null;
    el.focus(); // scrolls into view via the ScrollArea viewport
  };

  /** The block to land on when Tab/arrow first enters the grid. */
  const entryBlock = (blocks: HTMLElement[]): HTMLElement | undefined => {
    const remembered = lastFocusedKey.current
      ? blocks.find((b) => b.dataset.occKey === lastFocusedKey.current)
      : undefined;
    return remembered ?? blocks[0];
  };

  /** Nearest block (by vertical position) in the next/prev day column that has
   *  one. Day columns are the first `days.length` children of colsRef (the move
   *  previews render after), so we never step into a ghost. */
  const adjacentColumnBlock = (
    block: HTMLElement,
    dir: -1 | 1,
  ): HTMLElement | null => {
    const root = colsRef.current;
    if (!root) return null;
    let col: HTMLElement | null = block;
    while (col && col.parentElement !== root) col = col.parentElement;
    if (!col) return null;
    const cols = Array.from(root.children);
    const start = cols.indexOf(col);
    const top = block.getBoundingClientRect().top;
    for (let j = start + dir; j >= 0 && j < days.length; j += dir) {
      const candidates = Array.from(
        (cols[j] as HTMLElement).querySelectorAll<HTMLElement>(
          '[data-occ-key][role="button"]',
        ),
      );
      if (candidates.length === 0) continue;
      let best = candidates[0];
      let bestD = Infinity;
      for (const c of candidates) {
        const d = Math.abs(c.getBoundingClientRect().top - top);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      return best;
    }
    return null;
  };

  // Focus entering the columns container: delegate to a block on keyboard entry
  // (Tab), but stay put on a mouse click (pointerActive) so an empty-space click
  // keeps its create/clear behaviour. A child block bubbling its own focus here
  // just updates the remembered key. `relatedTarget` inside the grid means
  // Shift+Tab is leaving the first block backward — don't re-grab it (that would
  // trap the back-tab); a second Shift+Tab then exits cleanly.
  const onGridFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) {
      const k = (e.target as HTMLElement).dataset?.occKey;
      if (k) lastFocusedKey.current = k;
      return;
    }
    if (pointerActive.current) return;
    if (e.relatedTarget && colsRef.current?.contains(e.relatedTarget as Node)) return;
    focusBlock(entryBlock(focusableBlocks()));
  };

  const onGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      e.key !== "ArrowDown" &&
      e.key !== "ArrowUp" &&
      e.key !== "ArrowLeft" &&
      e.key !== "ArrowRight"
    )
      return;
    const root = colsRef.current;
    if (!root) return;
    const blocks = focusableBlocks();
    if (blocks.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const onBlock =
      !!active &&
      active.dataset.occKey != null &&
      active.getAttribute("role") === "button" &&
      root.contains(active);
    e.preventDefault(); // stop the arrow from also scrolling the viewport
    if (!onBlock) {
      // Container focused (a click landed here, or an empty grid) — the first
      // arrow press steps into the blocks.
      focusBlock(entryBlock(blocks));
      return;
    }
    const i = blocks.indexOf(active!);
    if (e.key === "ArrowDown") focusBlock(blocks[Math.min(i + 1, blocks.length - 1)]);
    else if (e.key === "ArrowUp") focusBlock(blocks[Math.max(i - 1, 0)]);
    else focusBlock(adjacentColumnBlock(active!, e.key === "ArrowRight" ? 1 : -1) ?? active!);
  };

  // Cancel any in-progress single-touch grid gesture so a two-finger pinch
  // (zoom) never also creates or moves an event.
  const cancelGesture = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current.timer);
      longPressRef.current = null;
    }
    dragRef.current = null;
    setArmed(false);
    setPreview(null);
    setGroupPreview([]);
  };
  // Ctrl+wheel / trackpad + touch pinch stretch the grid vertically (via hourPx).
  useTimelineZoom({ viewportRef, onGestureStart: cancelGesture });

  // Open the timed grid at a useful hour instead of 00:00: the current time when
  // today is in the window (so the now-line is visible on load), else the start
  // of the work day. Once per window — the ref guard means zooming (hourPx) keeps
  // the user's scroll position instead of yanking back to now.
  const scrolledFor = useRef<number | null>(null);
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const windowKey = days[0] ?? 0;
    if (scrolledFor.current === windowKey) return;
    scrolledFor.current = windowKey;
    const minutes = days.includes(today) ? (Date.now() - today) / 60000 : 7 * 60;
    const y = minutesToY(clampMin(minutes), hourPx);
    vp.scrollTop = Math.max(0, y - vp.clientHeight * 0.3);
  }, [days, today, hourPx]);

  // Contexts are timed backdrops in the grid body; never show them all-day
  // (all-day contexts are deferred — they'd otherwise render as a flat chip).
  const allDay = occurrences.filter((o) => o.allDay && o.kind !== "context");
  const byKey = useMemo(
    () => new Map(occurrences.map((o) => [o.key, o])),
    [occurrences],
  );

  function geom(clientX: number, clientY: number) {
    const rect = colsRef.current!.getBoundingClientRect();
    const colW = rect.width / days.length;
    const dayIndex = clamp(Math.floor((clientX - rect.left) / colW), 0, days.length - 1);
    const minutes = yToMinutes(clientY - rect.top, hourPx);
    return { dayIndex, minutes };
  }

  const minutesIn = (ms: number, dayIndex: number) => (ms - days[dayIndex]) / 60_000;
  const dayIndexOfMs = (ms: number) => {
    for (let i = 0; i < days.length; i++) {
      if (ms >= days[i] && ms < days[i] + DAY_MS) return i;
    }
    return ms < days[0] ? 0 : days.length - 1;
  };
  const timeLabel = (dayIndex: number, min: number) =>
    formatTime(days[dayIndex] + min * 60_000, timeZone);

  // Secondary-zone clock at primary hour `h` on the first visible day. Compact:
  // "14" on the hour, "14:30" for half-hour-offset zones (e.g. Asia/Kolkata).
  const secondaryHourLabel = (h: number): string => {
    const inst = days[0] + h * 3_600_000;
    const ctx = tz(secondaryTimeZone!);
    return format(inst, "mm", { in: ctx }) === "00"
      ? format(inst, "HH", { in: ctx })
      : format(inst, "HH:mm", { in: ctx });
  };

  // Touch: arm a move-drag once the long-press timer (set in onPointerDown)
  // fires on an event. Until then the grid scrolls normally.
  function armTouchMove(
    occKey: string | undefined,
    clientX: number,
    clientY: number,
    pointerId: number,
  ) {
    longPressRef.current = null;
    if (!occKey) return; // long-press on empty space is a no-op on touch
    const occ = byKey.get(occKey);
    if (!occ) return;
    if (!canEdit(occ)) return; // another member's block: read-only, no move
    const g = geom(clientX, clientY);
    const startTotal = (occ.start - days[0]) / 60_000;
    const durationMin = (occ.end - occ.start) / 60_000;
    dragRef.current = {
      kind: "move",
      pointerId,
      startX: clientX,
      startY: clientY,
      moved: true,
      dayIndex: dayIndexOfMs(occ.start),
      occKey,
      durationMin,
      startTotal,
      grabOffsetMin: g.dayIndex * 1440 + g.minutes - startTotal,
      curStartTotal: startTotal,
    };
    setArmed(true);
    try {
      colsRef.current?.setPointerCapture(pointerId);
    } catch {
      /* ignore */
    }
    navigator.vibrate?.(10);
    const segs = previewSegments(startTotal, durationMin, days.length);
    if (segs[0]) setPreview({ ...segs[0], label: occ.title, extra: segs.slice(1) });
  }

  // Grabbing a member of a multi-selection acts on the whole group (move or
  // resize) by one shared delta. Capture each editable member's start geometry
  // now. Recurring members are included: by default the change applies to the
  // selected occurrence (this), or to the whole series when Alt is held at drop.
  // A single recurring item (size 1) is never a group, so it keeps its scope
  // prompt via the single-item path.
  function groupFor(occ: Occurrence): GroupMember[] | undefined {
    if (!selectedKeys.has(occ.key) || selectedKeys.size <= 1) return undefined;
    const members: GroupMember[] = [];
    for (const key of selectedKeys) {
      const m = byKey.get(key);
      if (!m || !canEdit(m)) continue;
      const mDay = dayIndexOfMs(m.start);
      members.push({
        occ: m,
        sMin: minutesIn(m.start, mDay),
        dayIndex: mDay,
        durationMin: (m.end - m.start) / 60_000,
      });
    }
    return members.length > 1 ? members : undefined;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    // A right-click menu / dialog opened from a DayColumn renders into a <body>
    // portal, but React still bubbles ITS pointer events up to this handler
    // (synthetic events follow the component tree, not the DOM tree). Ignore any
    // pointerdown that didn't physically land inside the grid columns: otherwise
    // clicking a menu item would run setPointerCapture below, which retargets the
    // following pointerup/click to the grid and steals it from the item — leaving
    // Edit/Delete (and every other menu action) inert.
    const cols = colsRef.current;
    if (cols && !cols.contains(e.target as Node)) return;
    // A pointer interaction owns focus now; suppress the keyboard entry-delegation
    // so clicking empty space (create / clear) never jumps focus onto an event.
    pointerActive.current = true;
    const el = e.target as HTMLElement;
    const handle = el.closest<HTMLElement>("[data-resize]");
    const blockEl = el.closest<HTMLElement>("[data-occ-key]");

    // Touch path: defer to a long-press (move) or a tap (select / create).
    // Never start a create-drag or resize on touch, so vertical scrolling
    // stays free until the press arms.
    if (e.pointerType === "touch") {
      const occKey = blockEl?.dataset.occKey;
      const timer = window.setTimeout(
        () => armTouchMove(occKey, e.clientX, e.clientY, e.pointerId),
        LONG_PRESS_MS,
      );
      longPressRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        occKey,
        moved: false,
        timer,
      };
      return;
    }

    // Shift+click toggles an event in/out of the multi-selection — no drag, no
    // capture, no details panel. (Mouse only; the touch path returned above.)
    if (e.shiftKey && blockEl) {
      const occ = byKey.get(blockEl.dataset.occKey!);
      if (occ) onToggleSelect(occ);
      return;
    }

    const g = geom(e.clientX, e.clientY);
    colsRef.current?.setPointerCapture(e.pointerId);

    // Another member's block (read-only overlay): a plain click selects it; no
    // move or resize is ever started.
    const blockOcc = blockEl ? byKey.get(blockEl.dataset.occKey!) : undefined;
    if (blockEl && blockOcc && !canEdit(blockOcc)) {
      const dayIndex = dayIndexOfMs(blockOcc.start);
      dragRef.current = {
        kind: "move",
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        dayIndex,
        occKey: blockOcc.key,
        durationMin: (blockOcc.end - blockOcc.start) / 60_000,
        readonly: true,
      };
      return;
    }

    if (handle && blockEl) {
      const occ = byKey.get(blockEl.dataset.occKey!);
      if (!occ) return;
      // Resize works in absolute time (occ.start/occ.end), not minutes-of-day
      // relative to a single day, so a sleep block that runs past midnight
      // resizes from whichever column its handle lives in. `dayIndex` is kept
      // only for the shared Drag shape; the resize path ignores it.
      dragRef.current = {
        kind: "resize",
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        dayIndex: dayIndexOfMs(occ.start),
        occKey: occ.key,
        edge: (handle.dataset.resize as "start" | "end") ?? "end",
        occStartMs: occ.start,
        occEndMs: occ.end,
        group: groupFor(occ),
      };
    } else if (blockEl) {
      const occ = byKey.get(blockEl.dataset.occKey!);
      if (!occ) return;
      // Grid-minutes from the first visible column's midnight, so a block that
      // crosses midnight (sleep) moves as one rigid piece. Grabbing a member of
      // a multi-selection moves the whole group by one shared delta.
      const startTotal = (occ.start - days[0]) / 60_000;
      const group = groupFor(occ);
      dragRef.current = {
        kind: "move",
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        dayIndex: dayIndexOfMs(occ.start),
        occKey: occ.key,
        durationMin: (occ.end - occ.start) / 60_000,
        startTotal,
        grabOffsetMin: g.dayIndex * 1440 + g.minutes - startTotal,
        curStartTotal: startTotal,
        group,
      };
    } else {
      const anchorMin = snapMinutes(clampMin(g.minutes));
      dragRef.current = {
        kind: "create",
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        dayIndex: g.dayIndex,
        anchorMin,
        curMin: anchorMin,
      };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const lp = longPressRef.current;
    if (lp && lp.pointerId === e.pointerId && !dragRef.current) {
      // Finger drifted before the long-press fired → treat as a scroll, cancel.
      if (
        Math.abs(e.clientX - lp.startX) > TAP_TOL ||
        Math.abs(e.clientY - lp.startY) > TAP_TOL
      ) {
        clearTimeout(lp.timer);
        longPressRef.current = null;
      }
      return;
    }
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (d.readonly) return; // read-only block: never preview a move
    if (!d.moved && (Math.abs(e.clientX - d.startX) > 4 || Math.abs(e.clientY - d.startY) > 4)) {
      d.moved = true;
    }
    const g = geom(e.clientX, e.clientY);

    if (d.kind === "create") {
      d.curMin = snapMinutes(clampMin(g.minutes));
      const top = Math.min(d.anchorMin!, d.curMin);
      const bot = Math.max(d.anchorMin!, d.curMin);
      setPreview({
        dayIndex: d.dayIndex,
        topMin: top,
        heightMin: Math.max(bot - top, SLOT_MIN),
        label: `${timeLabel(d.dayIndex, top)} – ${timeLabel(d.dayIndex, Math.max(bot, top + SLOT_MIN))}`,
      });
    } else if (d.kind === "move") {
      const dur = d.durationMin!;
      const pointerTotal = g.dayIndex * 1440 + g.minutes;
      const startTotal = movedStartTotal(pointerTotal, d.grabOffsetMin!, days.length);
      d.curStartTotal = startTotal;
      // Ctrl/Cmd held → the drop will duplicate (single or whole selection).
      const copy = e.ctrlKey || e.metaKey;
      // Alt hits the whole recurring family — for a group move, or any duplicate.
      // (A single move with no Ctrl keeps its scope prompt, so Alt doesn't apply.)
      const hasRecurring =
        !!byKey.get(d.occKey!)?.isRecurring || !!d.group?.some((m) => m.occ.isRecurring);
      const series = e.altKey && (!!d.group || copy) && hasRecurring;
      const title = byKey.get(d.occKey!)?.title ?? "";
      // The grabbed block's leading segment carries the label; a cross-midnight
      // tail is shown in the same style so the full drop target is visible.
      const segs = previewSegments(startTotal, dur, days.length);
      if (segs[0]) {
        setPreview({
          ...segs[0],
          label: copy ? t("preview.copyOf", { title }) : title,
          copy,
          series,
          extra: segs.slice(1),
        });
      }
      // Group move: shift every other member by the same total delta, splitting
      // any cross-midnight member into its per-column ghost segments.
      if (d.group) {
        const deltaTotal = startTotal - d.startTotal!;
        setGroupPreview(
          d.group
            .filter((m) => m.occ.key !== d.occKey)
            .flatMap((m) => {
              const mStart = shiftedMemberStart(m.dayIndex * 1440 + m.sMin, deltaTotal, days.length);
              return previewSegments(mStart, m.durationMin, days.length).map((s) => ({
                ...s,
                label: m.occ.title,
              }));
            }),
        );
      }
    } else {
      const series = !!d.group && e.altKey && d.group.some((mem) => mem.occ.isRecurring);
      // Absolute time under the cursor: the cursor's own column's midnight plus
      // its snapped minutes-of-day. Using the live column (g.dayIndex) is what
      // lets a cross-midnight block's morning handle resolve to the right day.
      const ptMs = days[g.dayIndex] + snapMinutes(clampMin(g.minutes)) * 60_000;
      const next = resizeOccurrence(d.occStartMs!, d.occEndMs!, d.edge!, ptMs, SLOT_MIN);
      d.curStartMs = next.start;
      d.curEndMs = next.end;
      const deltaMin =
        d.edge === "start"
          ? (next.start - d.occStartMs!) / 60_000
          : (next.end - d.occEndMs!) / 60_000;
      const seg = resizePreviewSegment(next.start, next.end, d.edge!, days, DAY_MS);
      if (seg) setPreview({ ...seg, label: "", series });
      // Group resize: apply the same edge delta to every other member.
      if (d.group) {
        const edge = d.edge;
        setGroupPreview(
          d.group
            .filter((mem) => mem.occ.key !== d.occKey)
            .map((mem) => {
              const endMin = mem.sMin + mem.durationMin;
              if (edge === "start") {
                const top = clamp(mem.sMin + deltaMin, 0, endMin - SLOT_MIN);
                return { dayIndex: mem.dayIndex, topMin: top, heightMin: endMin - top, label: "" };
              }
              const newEnd = clamp(endMin + deltaMin, mem.sMin + SLOT_MIN, 1440);
              return { dayIndex: mem.dayIndex, topMin: mem.sMin, heightMin: newEnd - mem.sMin, label: "" };
            }),
        );
      }
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointerActive.current = false;
    const lp = longPressRef.current;
    if (lp && lp.pointerId === e.pointerId) {
      clearTimeout(lp.timer);
      longPressRef.current = null;
      // Quick tap (long-press never armed): select an event, or create a
      // default block on an empty slot.
      if (!lp.moved) {
        if (lp.occKey) {
          const occ = byKey.get(lp.occKey);
          if (occ) onSelect(occ);
        } else {
          const g = geom(lp.startX, lp.startY);
          const startMin = snapMinutes(clampMin(g.minutes));
          const start = days[g.dayIndex] + startMin * 60_000;
          onCreateRange(start, start + SCHED_MIN * 60_000);
        }
      }
      return;
    }

    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    dragRef.current = null;
    setArmed(false);
    setPreview(null);
    setGroupPreview([]);
    try {
      colsRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (d.kind === "create") {
      // An empty-space click (no drag) clears the multi-selection.
      if (!d.moved) {
        if (selectedKeys.size > 0) onClearSelection();
        return;
      }
      const top = Math.min(d.anchorMin!, d.curMin!);
      const bot = Math.max(d.anchorMin!, d.curMin!);
      const end = Math.max(bot, top + MIN_NEW);
      onCreateRange(days[d.dayIndex] + top * 60_000, days[d.dayIndex] + end * 60_000);
    } else if (d.kind === "move") {
      const occ = byKey.get(d.occKey!);
      if (!occ) return;
      if (!d.moved || d.readonly || d.durationMin! > 1440) {
        onSelect(occ);
        return;
      }
      const start = days[0] + d.curStartTotal! * 60_000;
      const end = start + d.durationMin! * 60_000;
      // Group: shift every captured member by the same total delta. Ctrl/Cmd
      // duplicates the whole selection instead of moving it; Alt = family.
      if (d.group) {
        const deltaTotal = d.curStartTotal! - d.startTotal!;
        const moves = d.group.map((m) => {
          const mStart =
            days[0] + shiftedMemberStart(m.dayIndex * 1440 + m.sMin, deltaTotal, days.length) * 60_000;
          return { occ: m.occ, start: mStart, end: mStart + m.durationMin * 60_000 };
        });
        if (e.ctrlKey || e.metaKey) onDuplicateMany(moves, e.altKey);
        else {
          settle(moves.map((mv) => mv.occ.key));
          onRescheduleMany(moves, e.altKey);
        }
      } else if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd-drag → copy, leaving the original in place. Alt = whole series.
        onDuplicate(occ, start, end, e.altKey);
      } else {
        settle([occ.key]);
        onReschedule(occ, start, end);
      }
    } else {
      const occ = byKey.get(d.occKey!);
      if (!occ) return;
      if (!d.moved) {
        onSelect(occ);
        return;
      }
      // Group resize: apply the same edge delta to every captured member.
      if (d.group) {
        const edge = d.edge;
        const deltaMin =
          edge === "start"
            ? (d.curStartMs! - d.occStartMs!) / 60_000
            : (d.curEndMs! - d.occEndMs!) / 60_000;
        settle(d.group.map((mem) => mem.occ.key));
        onRescheduleMany(
          d.group.map((mem) => {
            const base = days[mem.dayIndex];
            const endMin = mem.sMin + mem.durationMin;
            if (edge === "start") {
              const top = clamp(mem.sMin + deltaMin, 0, endMin - SLOT_MIN);
              return { occ: mem.occ, start: base + top * 60_000, end: base + endMin * 60_000 };
            }
            const newEnd = clamp(endMin + deltaMin, mem.sMin + SLOT_MIN, 1440);
            return { occ: mem.occ, start: base + mem.sMin * 60_000, end: base + newEnd * 60_000 };
          }),
          e.altKey,
        );
      } else if (d.edge === "start") {
        settle([occ.key]);
        onReschedule(occ, d.curStartMs ?? occ.start, occ.end);
      } else {
        settle([occ.key]);
        onReschedule(occ, occ.start, d.curEndMs ?? occ.end);
      }
    }
  }

  // --- Drop a backlog task onto the grid (HTML5 DnD, separate from the
  // pointer-based move/resize above) ---
  function dropSlot(clientX: number, clientY: number) {
    const g = geom(clientX, clientY);
    const start = clamp(snapMinutes(clampMin(g.minutes)), 0, 1440 - SCHED_MIN);
    return { dayIndex: g.dayIndex, startMin: start };
  }
  function onDragOver(e: React.DragEvent) {
    if (!onScheduleTask) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const { dayIndex, startMin } = dropSlot(e.clientX, e.clientY);
    setPreview({
      dayIndex,
      topMin: startMin,
      heightMin: SCHED_MIN,
      label: `${timeLabel(dayIndex, startMin)} – ${timeLabel(dayIndex, startMin + SCHED_MIN)}`,
    });
  }
  function onDrop(e: React.DragEvent) {
    if (!onScheduleTask) return;
    e.preventDefault();
    const taskId =
      e.dataTransfer.getData("text/task-id") || e.dataTransfer.getData("text/plain");
    setPreview(null);
    if (!taskId) return;
    const { dayIndex, startMin } = dropSlot(e.clientX, e.clientY);
    const startMs = days[dayIndex] + startMin * 60_000;
    onScheduleTask(taskId, startMs, startMs + SCHED_MIN * 60_000);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Day headers */}
      <div className="flex border-b pr-3">
        {secondaryTimeZone && (
          <div className="flex w-12 shrink-0 items-end justify-center pb-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
            {zoneAbbrev(secondaryTimeZone)}
          </div>
        )}
        {secondaryTimeZone ? (
          <div className="flex w-14 shrink-0 items-end justify-center pb-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
            {zoneAbbrev(timeZone)}
          </div>
        ) : (
          <div className="w-14 shrink-0" />
        )}
        {days.map((d) => (
          <div key={d} className="flex-1 border-l py-2 text-center">
            <div
              className={cn(
                "text-xs uppercase tracking-wide",
                // Today's weekday label takes the brand colour (matches the
                // agenda + the date pill below), tying the today column to the
                // brand on the otherwise-neutral grid.
                d === today ? "text-primary" : "text-muted-foreground",
              )}
            >
              {format(d, "EEE", { in: tz(timeZone), locale: dfLocale })}
            </div>
            <div
              className={cn(
                "mx-auto mt-0.5 flex size-8 items-center justify-center rounded-full text-base font-semibold tabular-nums",
                d === today && "bg-primary text-primary-foreground",
              )}
            >
              {format(d, "d", { in: tz(timeZone) })}
            </div>
          </div>
        ))}
      </div>

      {/* All-day strip */}
      {allDay.length > 0 && (
        <div className="flex border-b bg-muted/30 pr-3">
          {secondaryTimeZone && <div className="w-12 shrink-0" />}
          <div className="flex w-14 shrink-0 items-start justify-end p-1 text-[10px] uppercase text-muted-foreground">
            {t("labels.allDayHeader")}
          </div>
          {days.map((d) => {
            // All-day events are floating dates: match by calendar date (UTC
            // date-key vs the column's date in the viewer zone), never instant.
            const dayKey = dateKeyInZone(d, timeZone);
            const items = allDay.filter(
              (o) =>
                allDayDateKey(o.start) <= dayKey && allDayDateKey(o.end - 1) >= dayKey,
            );
            return (
              <div key={d} className="flex min-w-0 flex-1 flex-col gap-1 border-l p-1">
                {items.map((o) => (
                  <ItemContextMenu
                    key={o.key}
                    mobileSheet={false}
                    title={o.title}
                    color={canEdit(o) ? o.color : undefined}
                    onColorChange={
                      canEdit(o)
                        ? (c) =>
                            selectedKeys.has(o.key) && selectedKeys.size > 1
                              ? onColorSelected(c)
                              : onChangeColor(o, c)
                        : undefined
                    }
                    actions={
                      canEdit(o)
                        ? [
                            { label: t("menu.edit"), icon: Pencil, onSelect: () => onSelect(o) },
                            ...(eventShareAction && eventShareAction(o)
                              ? [eventShareAction(o)!]
                              : []),
                            {
                              label: t("menu.delete"),
                              icon: Trash2,
                              destructive: true,
                              onSelect: () => onDeleteEvent(o),
                            },
                          ]
                        : [
                            { label: t("menu.open"), icon: Eye, onSelect: () => onSelect(o) },
                            ...(eventCopyAction && eventCopyAction(o)
                              ? [eventCopyAction(o)!]
                              : []),
                          ]
                    }
                  >
                    <button
                      type="button"
                      onClick={(e) => (e.shiftKey ? onToggleSelect(o) : onSelect(o))}
                      style={{ backgroundColor: toPaletteColor(colorOf(o)), color: toPaletteInk(colorOf(o)) }}
                      className={cn(
                        "truncate rounded px-1.5 py-0.5 text-left text-xs font-medium",
                        selectedKeys.has(o.key) && "ring-2 ring-foreground",
                        o.inactive && "evt-inactive",
                        eventStatusClass(o.status),
                        o.status === "cancelled" && "line-through",
                      )}
                    >
                      {o.title}
                    </button>
                  </ItemContextMenu>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Scrollable time grid */}
      <ScrollArea className="min-h-0 flex-1" viewportRef={viewportRef}>
        <div className="flex" style={{ height: hourPx * 24 }}>
          {secondaryTimeZone && (
            <div className="w-12 shrink-0 border-r border-border/40">
              {HOURS.map((h) => (
                <div key={h} style={{ height: hourPx }} className="relative">
                  <span className="absolute -top-2 right-2 text-xs text-muted-foreground tabular-nums">
                    {h === 0 ? "" : secondaryHourLabel(h)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="w-14 shrink-0">
            {HOURS.map((h) => (
              <div key={h} style={{ height: hourPx }} className="relative">
                <span className="absolute -top-2 right-2 text-xs text-muted-foreground tabular-nums">
                  {h === 0 ? "" : format(new Date(2000, 0, 1, h), "HH")}
                </span>
              </div>
            ))}
          </div>

          <div
            ref={colsRef}
            // The grid's one Tab stop: focus delegates to an event block, then
            // the arrow keys rove between blocks (see onGridFocus/onGridKeyDown).
            // outline-none because focus visibly lands on a block, not here.
            tabIndex={0}
            aria-label={t("grid.ariaLabel")}
            className={cn(
              "relative flex flex-1 outline-none",
              armed ? "touch-none" : "touch-pan-y",
            )}
            onFocus={onGridFocus}
            onKeyDown={onGridKeyDown}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              pointerActive.current = false;
              if (longPressRef.current) {
                clearTimeout(longPressRef.current.timer);
                longPressRef.current = null;
              }
              dragRef.current = null;
              setArmed(false);
              setPreview(null);
              setGroupPreview([]);
            }}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragLeave={() => setPreview(null)}
          >
            {days.map((d) => (
              <DayColumn
                key={d}
                dayStart={d}
                hourPx={hourPx}
                isToday={d === today}
                singleColumn={days.length === 1}
                labelStyle={labelStyle}
                twoCalendars={twoCalendars}
                unavailableBands={unavailableBands}
                occurrences={occurrences}
                colorOf={colorOf}
                selectedKeys={selectedKeys}
                onSelect={onSelect}
                onChangeColor={onChangeColor}
                onColorSelected={onColorSelected}
                onDeleteEvent={onDeleteEvent}
                onAssignCategory={onAssignCategory}
                categoryChoices={categoryChoices}
                eventShareAction={eventShareAction}
                eventCopyAction={eventCopyAction}
                canEdit={canEdit}
                taskDoneById={taskDoneById}
                onToggleTaskDone={onToggleTaskDone}
                settleKeys={settleKeys}
              />
            ))}

            {/* Other group-move members: dashed ghosts tracking the same delta. */}
            {groupPreview.map((gp, i) => (
              <div
                key={i}
                className="pointer-events-none absolute z-30 overflow-hidden rounded-md border-2 border-dashed border-primary bg-primary/10 px-1"
                style={{
                  left: `calc(${(gp.dayIndex / days.length) * 100}% + 2px)`,
                  width: `calc(${100 / days.length}% - 4px)`,
                  top: minutesToY(gp.topMin, hourPx),
                  height: Math.max(minutesToY(gp.heightMin, hourPx), 6),
                }}
              >
                <span className="truncate text-xs font-medium text-primary">{gp.label}</span>
              </div>
            ))}

            {/* Continuation segments of a grabbed cross-midnight block: same
                bright style as the head, drawn in the next column(s). */}
            {preview?.extra?.map((seg, i) => (
              <div
                key={`extra-${i}`}
                className="pointer-events-none absolute z-30 overflow-hidden rounded-md border-2 border-dashed border-primary bg-primary/20"
                style={{
                  left: `calc(${(seg.dayIndex / days.length) * 100}% + 2px)`,
                  width: `calc(${100 / days.length}% - 4px)`,
                  top: minutesToY(seg.topMin, hourPx),
                  height: Math.max(minutesToY(seg.heightMin, hourPx), 6),
                }}
              />
            ))}

            {preview && (
              <div
                className="pointer-events-none absolute z-30 flex items-start gap-1 overflow-hidden rounded-md border-2 border-dashed border-primary bg-primary/20 px-1"
                style={{
                  left: `calc(${(preview.dayIndex / days.length) * 100}% + 2px)`,
                  width: `calc(${100 / days.length}% - 4px)`,
                  top: minutesToY(preview.topMin, hourPx),
                  height: Math.max(minutesToY(preview.heightMin, hourPx), 6),
                }}
              >
                {preview.copy && (
                  <span
                    aria-hidden
                    className="mt-px flex shrink-0 items-center rounded bg-primary p-0.5 text-primary-foreground"
                  >
                    <Plus className="size-2.5" />
                  </span>
                )}
                {preview.series && (
                  <span
                    aria-hidden
                    className="mt-px flex shrink-0 items-center gap-0.5 rounded bg-primary px-1 py-0.5 text-[10px] font-medium leading-tight text-primary-foreground"
                  >
                    <Repeat className="size-2.5" />
                    {t("labels.series")}
                  </span>
                )}
                <span className="truncate text-xs font-medium text-primary">
                  {preview.label}
                </span>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
