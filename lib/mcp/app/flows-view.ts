// The Flows MCP App: the view Claude shows when it calls `show_flows`.
//
// Browser code. scripts/build-mcp-app.mjs bundles this file (with the MCP
// Apps SDK) into one self-contained HTML document, kept in
// flows-app.generated.ts and served as the `ui://planner/flows.html`
// resource. The host renders it in a sandboxed iframe: no network of its own,
// no cookies, no planner session. Everything it knows arrives as the tool's
// result, and everything it does goes back through the host as a tool call
// the member's own token authorizes (`show_flows` to refetch, `complete_task`
// to tick a task off, `sync_boards` to have Echo sync the Obsidian boards).
//
// Task titles and tag names are the member's text: they are only ever set
// with `textContent`, never parsed as markup.

import {
  App,
  PostMessageTransport,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";

import type { FlowsOut, FlowSubtaskOut, FlowTaskOut, TaskDetailOut, TaskDetailSubtask } from "@/lib/mcp/flows";
import type { SyncBoardsOut } from "@/lib/mcp/echo-sync";
import {
  EMPTY_DRAFT,
  RUNWAY_NARROW_PX,
  RUNWAY_TRACK_PX,
  ALL_STREAMS,
  RUNWAY_NOW_X,
  SUB_RUNWAY_NARROW_PX,
  STATUS_MS,
  STRINGS,
  attentionLevel,
  blockedByPatch,
  calendarDays,
  createArgs,
  dependencyArrows,
  dependencyEdges,
  dimmedRows,
  draftOf,
  flowItems,
  hasChildren,
  laneRows,
  nowItems,
  offscreenBlockers,
  subtaskRunway,
  subtaskWaitTitle,
  subtreeProgress,
  waitCandidates,
  pickLocale,
  runwayLabel,
  runwayLabelSide,
  runwayOf,
  runwayTicks,
  visibleStreams,
  streamSummary,
  taskDetail,
  updateArgs,
  viewMenuFields,
  viewSettingsChanged,
  type CalendarEventIn,
  type LaneRow,
  type Runway,
  type Strings,
  type TaskDraft,
  type ViewLocale,
  syncSummary,
} from "./view-model";

type GroupBy = FlowsOut["groupBy"];
type Attention = FlowsOut["attention"];
type View = "calendar" | "flows" | "now";

interface State {
  view: View;
  data: FlowsOut | null;
  status: "loading" | "ready" | "error";
  groupBy: GroupBy;
  attention: Attention;
  mine: boolean;
  /** a saved stream the model asked for; kept across refreshes */
  stream?: string;
  /** the task whose runway is selected */
  selected: string | null;
  /** task ids with a completion in flight */
  busy: Set<string>;
  /** the editor's own message (a save, a refused loop); shown inside the editor */
  notice: string | null;
  /** the toolbar's status line (a sync result, a change made with no editor open) */
  flash: { text: string; at: number } | null;
  /** the toolbar's View menu is open */
  viewMenu: boolean;
  /** the stream chips' sideways scroll; null = bring the chosen chip into view */
  chipsX: number | null;
  locale: ViewLocale;
  /** the next week's events; null until the Calendar view asks for them */
  events: CalendarEventIn[] | null;
  eventsStatus: "idle" | "loading" | "error";
  editor: Editor | null;
  /** the member's collections, for the editor; null until first asked for */
  collections: { id: string; name: string }[] | null;
  /** streams the user opened past the first COLLAPSED_TASKS rows */
  expanded: Set<string>;
  /** the one stream the Flows view shows; null = the most pressing one */
  focus: string | null;
  /** the Flows track's sideways scroll; null = today in view */
  scrollX: number | null;
  /** tasks and subtasks whose subtasks are shown in the lane */
  unfolded: Set<string>;
  /** a "Sync with Obsidian" call is in flight */
  syncing: boolean;
}

/** Rows a stream shows before "and N more". */
const COLLAPSED_TASKS = 6;

/** The task being edited (or created). Field values live here, not in the DOM, so a repaint keeps them. */
interface Editor {
  mode: "edit" | "create";
  /** edit: the task as the server last gave it; null while it loads */
  detail: TaskDetailOut | null;
  failed: boolean;
  draft: TaskDraft;
  newSubtask: string;
  /** the member picked a collection themselves, so loading must not overwrite it */
  collectionTouched: boolean;
  /** the id whose delete button was pressed once and waits for a second press */
  confirmDelete: string | null;
  busy: boolean;
  /** what it waits for, as chosen here; null until the task loads (edit) */
  waits: { id: string; title: string }[] | null;
  /** the "Waits for" search, as typed */
  waitQuery: string;
}

const state: State = {
  view: "flows",
  data: null,
  status: "loading",
  groupBy: "tag",
  attention: "combined",
  mine: false,
  selected: null,
  busy: new Set(),
  notice: null,
  flash: null,
  viewMenu: false,
  chipsX: null,
  locale: pickLocale(navigator.language),
  events: null,
  eventsStatus: "idle",
  editor: null,
  collections: null,
  expanded: new Set(),
  focus: null,
  scrollX: null,
  unfolded: new Set(),
  syncing: false,
};

const app = new App({ name: "Planner flows", version: "1.1.0" });
const root = document.getElementById("root") as HTMLElement;

const VIEWS: View[] = ["calendar", "flows", "now"];
const GROUPS: GroupBy[] = ["tag", "category", "collection", "assignee", "status", "priority"];
const MODES: Attention[] = ["combined", "deadline", "priority"];
const CALENDAR_DAYS = 7;

const pad = (n: number) => String(n).padStart(2, "0");
const dateOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** The viewer's local calendar date, "yyyy-MM-dd". */
const localToday = () => dateOf(new Date());

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function isFlows(value: unknown): value is FlowsOut {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as FlowsOut).streams) &&
    typeof (value as FlowsOut).date === "string"
  );
}

/** Take a `show_flows` result into the state. False when it is not one. */
function accept(result: { structuredContent?: unknown; isError?: boolean }): boolean {
  if (result.isError || !isFlows(result.structuredContent)) return false;
  const data = result.structuredContent;
  state.data = data;
  state.status = "ready";
  state.groupBy = data.groupBy;
  state.attention = data.attention;
  state.stream = data.stream;
  // A selected task that left the listing stays open in the editor: it may be
  // newly created, or simply ranked below the tasks each stream shows.
  return true;
}

function findTask(id: string): FlowTaskOut | undefined {
  for (const stream of state.data?.streams ?? []) {
    const task = stream.tasks.find((t) => t.id === id);
    if (task) return task;
  }
  return undefined;
}

function findSubtask(id: string): FlowSubtaskOut | undefined {
  for (const stream of state.data?.streams ?? []) {
    for (const task of stream.tasks) {
      const sub = task.subtasks?.find((t) => t.id === id);
      if (sub) return sub;
    }
  }
  return undefined;
}

async function refetch(patch: Partial<Pick<State, "groupBy" | "attention" | "mine">> = {}) {
  Object.assign(state, patch);
  state.status = "loading";
  render();
  try {
    const result = await app.callServerTool({
      name: "show_flows",
      arguments: {
        date: localToday(),
        groupBy: state.groupBy,
        attention: state.attention,
        mine: state.mine,
        ...(state.stream ? { stream: state.stream } : {}),
      },
    });
    if (!accept(result)) state.status = "error";
  } catch {
    state.status = "error";
  }
  render();
}

function isEvent(value: unknown): value is CalendarEventIn {
  const e = value as CalendarEventIn;
  return (
    typeof e === "object" &&
    e !== null &&
    typeof e.title === "string" &&
    typeof e.start === "string" &&
    typeof e.end === "string" &&
    typeof e.allDay === "boolean"
  );
}

/** The next week's events, through the plain `list_events` tool. */
async function loadEvents() {
  state.eventsStatus = "loading";
  render();
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime());
    end.setDate(end.getDate() + CALENDAR_DAYS);
    const result = await app.callServerTool({
      name: "list_events",
      arguments: { start: start.toISOString(), end: end.toISOString() },
    });
    const first = result.content?.[0];
    const parsed: unknown = first && first.type === "text" ? JSON.parse(first.text) : null;
    const events = (parsed as { events?: unknown } | null)?.events;
    if (result.isError || !Array.isArray(events)) throw new Error("bad events");
    state.events = events.filter(isEvent);
    state.eventsStatus = "idle";
  } catch {
    state.eventsStatus = "error";
  }
  render();
}

function setView(view: View) {
  state.view = view;
  if (view === "calendar" && state.events === null && state.eventsStatus !== "loading") void loadEvents();
  render();
}

function complete(task: FlowTaskOut) {
  if (state.selected === task.id) {
    state.selected = null;
    state.editor = null;
  }
  return setDone(task.id, task.title, true);
}

// -- editing -----------------------------------------------------------------------

/** A tool that answered with an error: its message is meant for the member (a refused loop, say). */
class ToolError extends Error {}

/** Call one of this server's tools through the host; its JSON result, or a throw. */
async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await app.callServerTool({ name, arguments: args });
  const first = result.content?.[0];
  if (result.isError) throw new ToolError(first && first.type === "text" ? first.text : "");
  if (!first || first.type !== "text") throw new Error("tool failed");
  return JSON.parse(first.text);
}

function isDetail(value: unknown): value is TaskDetailOut {
  const d = value as TaskDetailOut;
  return typeof d === "object" && d !== null && typeof d.id === "string" && Array.isArray(d.subtasks) && Array.isArray(d.tags);
}

let collectionsAsked = false;

/** The member's collections, once, through `get_workspace`. A failure just leaves the choice out. */
async function loadCollections() {
  if (collectionsAsked) return;
  collectionsAsked = true;
  try {
    const workspace = (await call("get_workspace", {})) as { collections?: unknown };
    const list = Array.isArray(workspace.collections) ? workspace.collections : [];
    state.collections = list.filter(
      (c): c is { id: string; name: string } =>
        typeof c === "object" && c !== null && typeof (c as { id?: unknown }).id === "string" && typeof (c as { name?: unknown }).name === "string",
    );
    // A new task starts in the first collection, as it would in the planner.
    const editor = state.editor;
    if (editor?.mode === "create" && !editor.draft.collection && state.collections[0]) {
      editor.draft.collection = state.collections[0].id;
    }
    render();
  } catch {
    collectionsAsked = false;
  }
}

async function loadDetail(id: string, keepDraft = false) {
  try {
    const detail = await call("get_task", { id });
    const editor = state.editor;
    if (!editor || editor.mode !== "edit" || state.selected !== id) return;
    if (!isDetail(detail)) throw new Error("bad task");
    editor.detail = detail;
    editor.failed = false;
    if (!keepDraft || editor.waits === null) {
      editor.waits = (detail.blockedBy ?? []).map((b) => ({ id: b.id, title: b.title }));
    }
    if (!keepDraft) editor.draft = draftOf(detail);
    // Kept drafts were made before the task loaded: they do not know its collection yet.
    else if (editor.draft.collection === "" && detail.collectionId && !editor.collectionTouched) {
      editor.draft.collection = detail.collectionId;
    }
  } catch {
    if (state.editor && state.selected === id) state.editor.failed = true;
  }
  render();
}

const newEditor = (mode: Editor["mode"], draft: TaskDraft = { ...EMPTY_DRAFT }): Editor => ({
  mode,
  detail: null,
  failed: false,
  draft,
  newSubtask: "",
  collectionTouched: false,
  confirmDelete: null,
  busy: false,
  waits: mode === "create" ? [] : null,
  waitQuery: "",
});

function openEditor(id: string) {
  state.selected = id;
  state.notice = null;
  state.editor = newEditor("edit");
  const known = findTask(id);
  const sub = known ? undefined : findSubtask(id);
  if (known) state.editor.draft = draftOf({ ...known, startDate: known.start, tags: known.tags ?? [] });
  else if (sub) state.editor.draft = draftOf({ title: sub.title, dueDate: sub.due, startDate: sub.start, tags: [] });
  render();
  void loadCollections();
  void loadDetail(id);
}

function openCreate() {
  state.selected = null;
  state.notice = null;
  state.editor = newEditor("create");
  if (state.collections?.[0]) state.editor.draft.collection = state.collections[0].id;
  render();
  void loadCollections();
  document.getElementById("f-title")?.focus();
}

function closeEditor() {
  state.selected = null;
  state.editor = null;
  render();
}

let flashTimer: ReturnType<typeof setTimeout> | undefined;

/** Put a line in the toolbar's status slot; it fades and clears after STATUS_MS. */
function flash(text: string | null) {
  clearTimeout(flashTimer);
  state.flash = text ? { text, at: Date.now() } : null;
  if (!text) return;
  flashTimer = setTimeout(() => {
    state.flash = null;
    // Only the slot changes: a full repaint here would take the focus from whatever is being typed.
    const slot = document.getElementById("tb-status");
    if (slot && !state.syncing) {
      slot.textContent = "";
      slot.removeAttribute("title");
      slot.classList.remove("fading");
    }
  }, STATUS_MS);
}

/** A change's message: inside the open editor, where the press was; else in the toolbar. */
function say(text: string | null) {
  if (state.editor) state.notice = text;
  else flash(text);
}

/** Tell the model what the member just changed, so its next answer is not stale. */
function tellModel(text: string) {
  void app.updateModelContext({ content: [{ type: "text", text }] }).catch(() => undefined);
}

/**
 * Run one change: the tool call, then a fresh copy of the streams and of the
 * open task. A failure changes nothing here and says so.
 */
async function mutate(work: () => Promise<string | null>, said: string) {
  const s = STRINGS[state.locale];
  const editor = state.editor;
  if (editor) editor.busy = true;
  state.notice = null;
  render();
  try {
    const noticed = await work();
    say(noticed);
    tellModel(said);
  } catch (err) {
    // A refusal the tool explains (a loop, say) is shown as it is.
    say(err instanceof ToolError && err.message ? err.message : s.actionFailed);
    if (editor) editor.busy = false;
    render();
    return;
  }
  if (editor) {
    editor.busy = false;
    editor.confirmDelete = null;
  }
  await refetch();
  if (state.editor?.mode === "edit" && state.selected) await loadDetail(state.selected, true);
}

async function saveEditor() {
  const s = STRINGS[state.locale];
  const editor = state.editor;
  if (!editor) return;
  if (editor.mode === "create") {
    const made0 = createArgs(editor.draft);
    const waits = (editor.waits ?? []).map((w) => w.id);
    const args = made0 && waits.length ? { ...made0, blockedBy: waits } : made0;
    if (!args) {
      state.notice = s.titleNeeded;
      render();
      return;
    }
    await mutate(async () => {
      const made = (await call("create_task", args)) as { id?: unknown };
      state.editor = null;
      if (typeof made.id === "string") {
        state.selected = made.id;
        state.editor = newEditor("edit", { ...editor.draft });
      }
      return s.created(String(args.title));
    }, `The user created the task "${String(args.title)}" in the Flows view.`);
    return;
  }
  const detail = editor.detail;
  if (!detail) return;
  const patch = updateArgs(detail, editor.draft);
  if (patch === null) {
    state.notice = s.titleNeeded;
    render();
    return;
  }
  const blockedBy = editor.waits
    ? blockedByPatch(
        (detail.blockedBy ?? []).map((b) => b.id),
        editor.waits.map((w) => w.id),
      )
    : undefined;
  if (blockedBy) patch.blockedBy = blockedBy;
  if (Object.keys(patch).length === 0) {
    state.notice = s.saved;
    render();
    return;
  }
  await mutate(async () => {
    await call("update_task", { id: detail.id, ...patch });
    // Saved: the next load takes what it waits for from the server again.
    editor.waits = null;
    return s.saved;
  }, `The user edited the task "${detail.title}" (id ${detail.id}) in the Flows view: changed ${Object.keys(patch).join(", ")}.`);
}

/** Delete on the second press; the first only arms the button. */
async function removeTask(id: string, title: string, isSubtask: boolean) {
  const s = STRINGS[state.locale];
  const editor = state.editor;
  if (!editor) return;
  if (editor.confirmDelete !== id) {
    editor.confirmDelete = id;
    render();
    return;
  }
  await mutate(async () => {
    await call("delete_task", { id, confirm: true });
    if (!isSubtask) {
      state.editor = null;
      state.selected = null;
    }
    return s.deleted(title);
  }, `The user deleted the ${isSubtask ? "subtask" : "task"} "${title}" (id ${id}) in the Flows view.`);
}

async function setDone(id: string, title: string, done: boolean) {
  const s = STRINGS[state.locale];
  await mutate(async () => {
    await call("complete_task", { id, done });
    return done ? s.markedDone(title) : s.saved;
  }, `The user marked "${title}" (id ${id}) as ${done ? "done" : "not done"} in the Flows view.`);
}

async function renameSubtask(sub: TaskDetailSubtask, title: string) {
  const next = title.trim();
  if (!next || next === sub.title) return;
  await mutate(async () => {
    await call("update_task", { id: sub.id, title: next });
    return STRINGS[state.locale].saved;
  }, `The user renamed the subtask "${sub.title}" to "${next}" (id ${sub.id}) in the Flows view.`);
}

async function addSubtask() {
  const editor = state.editor;
  const parent = editor?.detail;
  if (!editor || !parent) return;
  const args = createArgs({ ...EMPTY_DRAFT, title: editor.newSubtask }, parent.id);
  if (!args) return;
  await mutate(async () => {
    await call("create_task", args);
    editor.newSubtask = "";
    return STRINGS[state.locale].created(String(args.title));
  }, `The user added the subtask "${String(args.title)}" to "${parent.title}" (id ${parent.id}) in the Flows view.`);
  document.getElementById("f-newsub")?.focus();
}

/**
 * "Sync with Obsidian": Echo runs one board-sync pass (the app-only
 * `sync_boards` tool), then the streams are read again so its changes show.
 */
async function syncBoards() {
  if (state.syncing) return;
  const s = STRINGS[state.locale];
  state.syncing = true;
  flash(null);
  render();
  let synced = false;
  try {
    const result = (await call("sync_boards", {})) as SyncBoardsOut;
    flash(syncSummary(result, s));
    synced = result.status === "done";
    tellModel(
      synced
        ? `The user synced the Obsidian task boards with the planner from the Flows view (${syncSummary(result, STRINGS.en)}). Re-read tasks before relying on earlier lists.`
        : "The user asked Echo to sync the Obsidian task boards from the Flows view; the sync is still running.",
    );
  } catch (err) {
    flash(err instanceof ToolError && err.message ? err.message : s.actionFailed);
  }
  state.syncing = false;
  if (synced) await refetch();
  else render();
}

// -- painting: the toolbar ---------------------------------------------------------------

type IconName = "sync" | "today" | "sliders" | "plus";

/** The toolbar's icons, 16×16 line drawings in the text colour. */
const ICONS: Record<IconName, [string, Record<string, string>][]> = {
  sync: [
    ["path", { fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round", d: "M13.5 6.5A5.5 5.5 0 0 0 3.2 4.6M2.5 9.5a5.5 5.5 0 0 0 10.3 1.9" }],
    ["path", { fill: "currentColor", d: "M3.6 1.8v3.4H7zM12.4 14.2v-3.4H9z" }],
  ],
  today: [
    ["circle", { cx: "8", cy: "8", r: "5.5", fill: "none", stroke: "currentColor", "stroke-width": "1.6" }],
    ["circle", { cx: "8", cy: "8", r: "1.8", fill: "currentColor" }],
  ],
  sliders: [
    ["path", { stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round", d: "M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7" }],
    ["circle", { cx: "10.5", cy: "4.5", r: "1.7", fill: "none", stroke: "currentColor", "stroke-width": "1.6" }],
    ["circle", { cx: "5.5", cy: "11.5", r: "1.7", fill: "none", stroke: "currentColor", "stroke-width": "1.6" }],
  ],
  plus: [["path", { stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", d: "M8 3v10M3 8h10" }]],
};

function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "ic");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  for (const [tag, attrs] of ICONS[name]) {
    const part = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) part.setAttribute(key, value);
    svg.append(part);
  }
  return svg;
}

/**
 * A toolbar button: an icon, and a label that narrow widths hide (it stays
 * for screen readers). `id` lets a repaint give the button its focus back.
 */
function toolButton(id: string, className: string, name: IconName, label?: string): HTMLButtonElement {
  const button = el("button", `tbtn ${className}`);
  button.type = "button";
  button.id = id;
  button.append(icon(name));
  if (label) button.append(el("span", "lbl", label));
  return button;
}

function syncButton(s: Strings): HTMLButtonElement {
  const button = toolButton("tb-sync", "tbtn-icon sync", "sync");
  const name = state.syncing ? s.syncing : s.sync;
  button.setAttribute("aria-label", name);
  button.title = name;
  // aria-disabled, not disabled: the button keeps its focus while the sync runs.
  button.setAttribute("aria-disabled", String(state.syncing));
  button.setAttribute("aria-busy", String(state.syncing));
  button.addEventListener("click", () => void syncBoards());
  return button;
}

/** Give the focus to a toolbar control by id, once it is painted. */
function focusById(id: string) {
  (document.getElementById(id) as HTMLElement | null)?.focus({ preventScroll: true });
}

function openViewMenu() {
  state.viewMenu = true;
  render();
  // Into the menu: its first chosen option, or the switch.
  const pop = document.getElementById("tb-view-pop");
  (pop?.querySelector<HTMLElement>('[aria-pressed="true"], [role="switch"]'))?.focus({ preventScroll: true });
}

/** Close the View menu. Only the menu and its button change, so an outside click lands where it was aimed. */
function closeViewMenu(returnFocus: boolean) {
  if (!state.viewMenu) return;
  state.viewMenu = false;
  document.getElementById("tb-view-pop")?.remove();
  const button = document.getElementById("tb-view");
  button?.setAttribute("aria-expanded", "false");
  button?.classList.remove("on");
  if (returnFocus) button?.focus({ preventScroll: true });
}

document.addEventListener(
  "pointerdown",
  (e) => {
    if (!state.viewMenu) return;
    const target = e.target as Element | null;
    if (target?.closest?.("#tb-view-pop, #tb-view")) return;
    closeViewMenu(false);
  },
  true,
);

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !state.viewMenu || e.defaultPrevented) return;
  const active = document.activeElement;
  const inside = !!active?.closest?.("#tb-view-pop, #tb-view");
  if (inside) e.preventDefault();
  closeViewMenu(inside);
});

/** A small segmented choice inside the View menu; each press refetches at once and the menu stays open. */
function miniSeg<T extends string>(
  key: string,
  label: string,
  value: T,
  options: readonly T[],
  names: Record<T, string>,
  onPick: (next: T) => void,
): HTMLElement {
  const box = el("div", "pop-field");
  const head = el("div", "pop-label", label);
  head.id = `tb-${key}-label`;
  const seg = el("div", `seg seg-sm seg-${key}`);
  seg.setAttribute("role", "group");
  seg.setAttribute("aria-labelledby", head.id);
  for (const option of options) {
    const on = option === value;
    const button = el("button", on ? "seg-on" : undefined, names[option]);
    button.type = "button";
    button.id = `tb-${key}-${option}`;
    button.setAttribute("aria-pressed", String(on));
    button.addEventListener("click", () => {
      if (!on) onPick(option);
    });
    seg.append(button);
  }
  box.append(head, seg);
  return box;
}

function viewMenu(s: Strings): HTMLElement {
  const pop = el("div", "pop");
  pop.id = "tb-view-pop";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", s.viewMenu);
  const fields = viewMenuFields(state.view);
  if (fields.includes("groupBy")) {
    pop.append(miniSeg("group", s.groupBy, state.groupBy, GROUPS, s.groups, (groupBy) => void refetch({ groupBy })));
  }
  if (fields.includes("attention")) {
    pop.append(miniSeg("attention", s.attention, state.attention, MODES, s.modes, (attention) => void refetch({ attention })));
  }
  const mine = el("button", "switch");
  mine.type = "button";
  mine.id = "tb-mine";
  mine.setAttribute("role", "switch");
  mine.setAttribute("aria-checked", String(state.mine));
  const knob = el("span", "knob");
  knob.setAttribute("aria-hidden", "true");
  mine.append(el("span", undefined, s.mine), knob);
  mine.addEventListener("click", () => void refetch({ mine: !state.mine }));
  pop.append(mine);
  return pop;
}

/** The status slot: a sync in flight, or the last result, on one line that never moves the layout. */
function statusSlot(s: Strings): HTMLElement {
  const slot = el("p", "tb-status");
  slot.id = "tb-status";
  slot.setAttribute("role", "status");
  const text = state.syncing ? s.syncing : (state.flash?.text ?? "");
  slot.textContent = text;
  if (text) slot.title = text;
  if (!state.syncing && state.flash) {
    // A repaint redraws the line: the fade picks up where it was.
    slot.classList.add("fading");
    slot.style.animationDelay = `-${Date.now() - state.flash.at}ms`;
  }
  return slot;
}

/**
 * Row 1, shared by every view: the view switch; then, pushed right, the status
 * line, Sync (Flows and Now), View (its menu holds what the view can change)
 * and New task (not in Calendar, which has no editor).
 */
function toolbar(s: Strings): HTMLElement {
  const bar = el("div", "toolbar");
  const views = el("div", "seg seg-views");
  views.setAttribute("role", "group");
  views.setAttribute("aria-label", s.viewSwitch);
  for (const view of VIEWS) {
    const on = view === state.view;
    const button = el("button", on ? "seg-on" : undefined);
    button.type = "button";
    button.id = `tb-v-${view}`;
    button.setAttribute("aria-pressed", String(on));
    // Narrow phones show the short label; the full one stays the button's name.
    button.setAttribute("aria-label", s.views[view]);
    button.title = s.views[view];
    button.append(el("span", "full", s.views[view]), el("span", "short", s.viewsShort[view]));
    button.addEventListener("click", () => setView(view));
    views.append(button);
  }
  bar.append(views, statusSlot(s));

  const actions = el("div", "tb-actions");
  if (state.view !== "calendar") actions.append(syncButton(s));

  const changed = viewSettingsChanged(state, viewMenuFields(state.view));
  const viewButton = toolButton("tb-view", "tbtn-fold view-btn", "sliders", s.view);
  if (state.viewMenu) viewButton.classList.add("on");
  viewButton.title = s.viewMenu;
  viewButton.setAttribute("aria-haspopup", "dialog");
  viewButton.setAttribute("aria-expanded", String(state.viewMenu));
  viewButton.setAttribute("aria-controls", "tb-view-pop");
  if (changed) {
    const dot = el("span", "dot");
    dot.setAttribute("aria-hidden", "true");
    viewButton.append(dot);
    viewButton.setAttribute("aria-label", s.viewChanged);
  }
  viewButton.addEventListener("click", () => {
    if (state.viewMenu) closeViewMenu(true);
    else openViewMenu();
  });
  actions.append(viewButton);
  if (state.viewMenu) actions.append(viewMenu(s));

  if (state.view !== "calendar") {
    const add = toolButton("tb-new", "tbtn-fold primary", "plus", s.newTaskShort);
    add.setAttribute("aria-label", s.newTask);
    add.title = s.newTask;
    add.addEventListener("click", openCreate);
    actions.append(add);
  }
  bar.append(actions);
  return bar;
}

/**
 * Row 2, Flows only: the stream chips ("All" first) in one sideways-scrolling
 * row, then "Back to today" for the track below.
 */
function streamRow(
  open: FlowsOut["streams"],
  current: FlowsOut["streams"][number] | null,
  all: boolean,
  track: HTMLElement,
  s: Strings,
): HTMLElement {
  const row = el("div", "row2");
  if (open.length > 1) {
    const chips = el("div", "streams");
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", s.stream);
    const chip = (id: string, label: string, count: number, overdue: number, on: boolean, pick: () => void) => {
      const button = el("button", on ? "chip-s on" : "chip-s");
      button.type = "button";
      button.id = id;
      button.setAttribute("aria-pressed", String(on));
      button.append(el("span", "chip-label", label), el("span", overdue > 0 ? "n late" : "n", String(count)));
      // Overdue is red and bold, and said in words too.
      if (overdue > 0) button.append(el("span", "sr-only", `, ${s.overdue(overdue)}`));
      button.addEventListener("click", () => {
        state.chipsX = chips.scrollLeft;
        pick();
      });
      return button;
    };
    const total = open.reduce((n, st) => n + st.open, 0);
    const late = open.reduce((n, st) => n + st.overdue, 0);
    chips.append(
      chip("tb-st-all", s.allStreams, total, late, all, () => {
        state.focus = ALL_STREAMS;
        render();
      }),
    );
    open.forEach((st, i) => {
      chips.append(
        chip(`tb-st-${i}`, st.label, st.open, st.overdue, st === current, () => {
          state.focus = st.key;
          render();
        }),
      );
    });
    const edge = () => chips.classList.toggle("more-right", chips.scrollLeft + chips.clientWidth < chips.scrollWidth - 1);
    chips.addEventListener(
      "scroll",
      () => {
        if (!chips.isConnected) return;
        state.chipsX = chips.scrollLeft;
        edge();
      },
      { passive: true },
    );
    requestAnimationFrame(() => {
      if (state.chipsX !== null) chips.scrollLeft = state.chipsX;
      else {
        // First paint: the chosen chip in view.
        const on = chips.querySelector<HTMLElement>(".chip-s.on");
        if (on && on.offsetLeft + on.offsetWidth > chips.clientWidth) {
          chips.scrollLeft = on.offsetLeft + on.offsetWidth - chips.clientWidth + 32;
        }
      }
      edge();
    });
    row.append(chips);
  } else {
    row.append(el("span", "row2-gap"));
  }
  const today = toolButton("tb-today", "tbtn-fold today", "today", s.todayShort);
  today.setAttribute("aria-label", s.backToToday);
  today.title = s.backToToday;
  today.addEventListener("click", () => {
    state.scrollX = null;
    scrollToNow(track, true);
  });
  row.append(today);
  return row;
}

// -- painting: the views ---------------------------------------------------------

const pct = (x: number) => `${x * 100}%`;

const SVG_NS = "http://www.w3.org/2000/svg";

/** The padlock every waiting bar carries, so "blocked" never rests on colour alone. */
function lockIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "lock");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute(
    "d",
    "M5 7V5a3 3 0 0 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5A1.5 1.5 0 0 1 11.5 15h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z",
  );
  svg.append(path);
  return svg;
}

/** The lane's width in px: the whole scrollable track. */
function laneWidth(): number {
  return RUNWAY_TRACK_PX;
}

/** A lane row's bar: a task's own runway, or a subtask's on its dates. */
function rowRunway(row: LaneRow, today: string): Runway {
  return row.kind === "task" ? runwayOf(row.task, today) : subtaskRunway(row.sub, row.task, today);
}

interface RowContext {
  today: string;
  dim: boolean;
  /** a connector leaves or enters this row: its words keep clear of the line's turn */
  linked: boolean;
  /** the selected row only: its blockers that are not on screen */
  offscreen: { id: string; title: string }[];
}

function toggleSelect(id: string) {
  if (state.selected === id) closeEditor();
  else openEditor(id);
}

/** One lane row: a task's runway, or (thinner) a subtask's. */
function runwayRow(row: LaneRow, ctx: RowContext, s: Strings): HTMLElement {
  const isSub = row.kind === "sub";
  const el0 = el("div", isSub ? `run run-sub depth-${row.sub.depth}` : "run");
  if (ctx.dim) el0.classList.add("dim");
  if (row.kind === "sub" && row.sub.done) el0.classList.add("run-done");
  const runway = rowRunway(row, ctx.today);
  const title = isSub ? row.sub.title : row.task.title;
  const blocked = isSub ? row.sub.blocked === true : row.task.blocked === true;
  const done = isSub && row.sub.done;
  const progress = isSub ? subtreeProgress(row.task.subtasks ?? [], row.id) : (row.task.progress ?? null);
  const label = isSub
    ? row.sub.due && !done
      ? runwayLabel({ ...row.task, dueDate: row.sub.due }, ctx.today, state.locale)
      : null
    : runwayLabel(row.task, ctx.today, state.locale);
  const waitTitles = isSub
    ? [subtaskWaitTitle(row.sub, row.task.subtasks ?? [])].filter((t): t is string => !!t)
    : (row.task.waitingOn ?? []).map((w) => w.title);
  const detail = [
    label ?? (isSub ? "" : s.noDeadline),
    progress ? s.subtasks(progress.done, progress.total) : "",
    blocked ? (waitTitles.length ? s.waitsDetail(waitTitles.join(", ")) : s.waiting) : "",
    done ? s.doneShort : "",
  ]
    .filter(Boolean)
    .join(", ");

  const selected = state.selected === row.id;
  const bar = el("button", `bar bar-${runway.state}`);
  bar.type = "button";
  bar.style.left = pct(runway.x0);
  bar.style.width = pct(runway.x1 - runway.x0);
  if (runway.clippedStart) bar.classList.add("clip-start");
  if (runway.clippedEnd) bar.classList.add("clip-end");
  if (selected) bar.classList.add("bar-selected");
  if (blocked) bar.classList.add("bar-blocked");
  if (done) bar.classList.add("bar-done");
  if (!isSub && attentionLevel(row.task.score) === "now") bar.classList.add("bar-urgent");
  bar.setAttribute("aria-pressed", String(selected));
  bar.setAttribute("aria-label", s.runway(title, detail));
  bar.title = s.runway(title, detail);
  bar.addEventListener("click", () => toggleSelect(row.id));
  if (runway.fill > 0 || (progress && progress.done > 0)) {
    const share = runway.fill > 0 ? runway.fill : progress ? progress.done / progress.total : 0;
    const fill = el("i", "fill");
    fill.style.width = pct(share);
    bar.append(fill);
  }
  const expandable = hasChildren(row);
  if (expandable) bar.classList.add("bar-has-chev");
  // A short runway cannot hold its title: it goes beside the bar instead.
  // A subtask's title is short: it stays inside while the bar can hold it
  // whole (by an estimate of the lane's width), else it goes beside the bar.
  const narrow = isSub
    ? (runway.x1 - runway.x0) * laneWidth() < SUB_RUNWAY_NARROW_PX ||
      (runway.x1 - runway.x0) * laneWidth() < title.length * 7 + 14 + (blocked ? 16 : 0) + (hasChildren(row) ? 22 : 0)
    : (runway.x1 - runway.x0) * laneWidth() < Math.max(RUNWAY_NARROW_PX, Math.min(260, title.length * 7 + 24));
  const inner = el("span", "bar-title");
  if (blocked) inner.append(lockIcon());
  if (!narrow) inner.append(el("span", "bar-text", title));
  if (inner.childNodes.length) bar.append(inner);
  el0.append(bar);

  if (expandable) {
    const open = state.unfolded.has(row.id);
    const chev = el("button", "chev", open ? "▾" : "▸");
    chev.type = "button";
    chev.style.left = pct(runway.x0);
    chev.setAttribute("aria-expanded", String(open));
    chev.setAttribute("aria-label", open ? s.collapse(title) : s.expand(title));
    chev.addEventListener("click", () => {
      if (open) state.unfolded.delete(row.id);
      else state.unfolded.add(row.id);
      render();
    });
    el0.append(chev);
  }

  if (runway.over) {
    const over = el("div", "over");
    over.style.left = pct(runway.over.x0);
    over.style.width = pct(Math.max(0.012, runway.over.x1 - runway.over.x0));
    el0.append(over);
  }
  // The count, then the deadline: what survives when the words are cut short.
  const words = [
    progress ? `${progress.done}/${progress.total}` : "",
    label ?? "",
    narrow ? title : "",
    isSub && blocked && waitTitles[0] ? s.after(waitTitles[0]) : "",
    ctx.offscreen.length ? s.waits(ctx.offscreen.map((b) => b.title).join(", ")) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  if (words) {
    // The words follow whatever ends last: the bar, or the overrun.
    const end = Math.max(runway.x1, runway.over?.x1 ?? 0);
    const side = runwayLabelSide(runway);
    const tag = el("span", runway.state === "late" ? "tag late" : "tag", words);
    tag.setAttribute("aria-hidden", "true");
    if (ctx.linked) tag.classList.add("tag-clear");
    if (side === "after") tag.style.left = pct(end);
    else if (side === "before") {
      tag.classList.add("tag-before");
      tag.style.right = pct(1 - runway.x0);
    } else {
      tag.classList.add("tag-inside");
    }
    el0.append(tag);
  }
  return el0;
}

/** The faint guide down the side of an unfolded task's subtasks. */
function guides(rows: readonly LaneRow[], today: string): HTMLElement[] {
  const out: HTMLElement[] = [];
  rows.forEach((row, i) => {
    if (!state.unfolded.has(row.id) || !hasChildren(row)) return;
    const depth = row.kind === "sub" ? row.sub.depth : 0;
    let last = i;
    for (let j = i + 1; j < rows.length; j++) {
      const r = rows[j];
      if (r.kind !== "sub" || r.task.id !== (row.kind === "sub" ? row.task.id : row.id) || r.sub.depth <= depth) break;
      last = j;
    }
    if (last === i) return;
    const guide = el("div", "guide");
    guide.setAttribute("aria-hidden", "true");
    guide.style.left = `calc(${pct(rowRunway(row, today).x0)} + 3px)`;
    guide.style.top = `${row.top + row.height}px`;
    guide.style.height = `${rows[last].top + rows[last].height / 2 - row.top - row.height}px`;
    out.push(guide);
  });
  return out;
}

/** The selected row's connectors, drawn over the lane (A1). */
function linksOverlay(rows: readonly LaneRow[], today: string, height: number): Element[] {
  const items = flowItems(state.data?.streams ?? []);
  const arrows = dependencyArrows(rows, state.selected, dependencyEdges(items), (row) => rowRunway(row, today));
  if (arrows.length === 0) return [];
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "links");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", `0 0 100 ${height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.style.height = `${height}px`;
  const heads: HTMLElement[] = [];
  for (const arrow of arrows) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", arrow.d);
    svg.append(path);
    const head = el("i", "head");
    head.setAttribute("aria-hidden", "true");
    head.style.left = pct(arrow.head.x / 100);
    head.style.top = `${arrow.head.y}px`;
    heads.push(head);
  }
  return [svg, ...heads];
}

/** Scroll the Flows track so today sits about a third of the way in. */
function scrollToNow(track: HTMLElement, smooth: boolean) {
  const target = RUNWAY_NOW_X * RUNWAY_TRACK_PX - track.clientWidth / 3;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  track.scrollTo({ left: Math.max(0, target), behavior: smooth && !reduce ? "smooth" : "auto" });
}

function ruler(today: string, s: Strings): HTMLElement {
  const axis = el("div", "axis");
  axis.setAttribute("aria-hidden", "true");
  for (const tick of runwayTicks(today, state.locale)) {
    const node = el("span", "tick", tick.label);
    node.style.left = pct(tick.x);
    axis.append(node);
  }
  const now = el("span", "tick tick-now", s.now);
  now.style.left = pct(RUNWAY_NOW_X);
  axis.append(now);
  return axis;
}

function flowsView(data: FlowsOut, s: Strings): HTMLElement {
  const wrap = el("div", "flows");
  const board = el("div", "board");
  // The name column stays put; the axis and the lane scroll sideways together.
  const side = el("div", "side");
  side.append(el("div", "corner"));
  const track = el("div", "track");
  track.tabIndex = 0;
  track.setAttribute("role", "region");
  track.setAttribute("aria-label", s.timeline);
  const inner = el("div", "track-inner");
  inner.style.width = `${RUNWAY_TRACK_PX}px`;
  inner.append(ruler(data.date, s));
  track.append(inner);
  track.addEventListener(
    "scroll",
    () => {
      // A repaint detaches this track, which then reads 0: that is not the user scrolling.
      if (track.isConnected) state.scrollX = track.scrollLeft;
    },
    { passive: true },
  );
  board.append(side, track);
  // Chips for the streams with open tasks, most pressing first, led by "All".
  // One stream: its name sits in the left column. All: the column goes and
  // each lane gets a header pinned to the left edge as it scrolls.
  const open = data.streams.filter((st) => st.open > 0);
  const all = state.focus === ALL_STREAMS && open.length > 1;
  const shownStreams = visibleStreams(data.streams, all ? ALL_STREAMS : state.focus);
  const current = all ? null : shownStreams[0];
  if (all) board.classList.add("board-all");
  wrap.append(streamRow(open, current ?? null, all, track, s), board);
  for (const stream of shownStreams) {
    const name = el("div", "name");
    name.append(el("b", undefined, stream.label));
    name.append(el("small", stream.overdue > 0 ? "late" : undefined, streamSummary(stream, data.date, state.locale)));
    const lane = el("div", "lane");
    const nowLine = el("div", "now-line");
    nowLine.style.left = pct(RUNWAY_NOW_X);
    lane.append(nowLine);
    const open = state.expanded.has(stream.key);
    const shown = open ? stream.tasks : stream.tasks.slice(0, COLLAPSED_TASKS);
    const rows = laneRows(shown, state.unfolded);
    const items = flowItems(data.streams);
    const dim = dimmedRows(rows, state.selected, dependencyEdges(items));
    const offscreen = offscreenBlockers(rows, state.selected, items);
    const linked = state.selected && rows.some((r) => r.id === state.selected) ? new Set(rows.filter((r) => !dim.has(r.id)).map((r) => r.id)) : new Set<string>();
    lane.append(...guides(rows, data.date));
    for (const row of rows) {
      lane.append(
        runwayRow(row, { today: data.date, dim: dim.has(row.id), linked: linked.has(row.id), offscreen: row.id === state.selected ? offscreen : [] }, s),
      );
    }
    const last = rows[rows.length - 1];
    if (last) lane.append(...linksOverlay(rows, data.date, last.top + last.height + 8));
    const folded = stream.tasks.length - shown.length;
    // Past what the server sent (a very long stream): a count, not a button.
    const unsent = stream.open - stream.tasks.length;
    if (folded > 0 || (open && stream.tasks.length > COLLAPSED_TASKS)) {
      const toggle = el("button", "ghost more", open ? s.fewer : s.more(stream.open - shown.length));
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", String(open));
      toggle.addEventListener("click", () => {
        if (open) state.expanded.delete(stream.key);
        else state.expanded.add(stream.key);
        render();
      });
      lane.append(toggle);
    }
    if (unsent > 0 && (open || folded === 0)) lane.append(el("div", "more", s.more(unsent)));
    if (all) {
      const head = el("div", "lane-head");
      head.append(...name.childNodes);
      inner.append(head, lane);
    } else {
      side.append(name);
      inner.append(lane);
    }
  }
  // After layout: back where the user left it, or with today in view.
  requestAnimationFrame(() => {
    if (state.scrollX === null) scrollToNow(track, false);
    else track.scrollLeft = state.scrollX;
  });

  wrap.append(editorPanel(s) ?? hintPanel(s));
  return wrap;
}

function hintPanel(s: Strings): HTMLElement {
  const box = el("div", "detail");
  box.append(el("span", "hint", s.pick));
  return box;
}

function field(label: string, control: HTMLElement, id: string): HTMLElement {
  const wrap = el("label", "field");
  wrap.setAttribute("for", id);
  control.id = id;
  wrap.append(el("span", "field-label", label), control);
  return wrap;
}

function textInput(value: string, onInput: (v: string) => void, type = "text"): HTMLInputElement {
  const input = el("input");
  input.type = type;
  input.value = value;
  input.addEventListener("input", () => onInput(input.value));
  return input;
}

function subtaskRow(sub: TaskDetailSubtask, editor: Editor, s: Strings): HTMLElement {
  const row = el("li", "sub");
  row.style.paddingInlineStart = `${(sub.depth - 1) * 18}px`;
  const box = el("input");
  box.type = "checkbox";
  box.checked = sub.done;
  box.disabled = editor.busy;
  box.setAttribute("aria-label", s.subDone(sub.title));
  box.addEventListener("change", () => void setDone(sub.id, sub.title, box.checked));
  const title = textInput(sub.title, () => undefined);
  title.className = sub.done ? "sub-title sub-done" : "sub-title";
  title.maxLength = 500;
  title.setAttribute("aria-label", s.subRename(sub.title));
  title.addEventListener("keydown", (e) => {
    if (e.key === "Enter") title.blur();
    if (e.key === "Escape") {
      title.value = sub.title;
      title.blur();
    }
  });
  title.addEventListener("blur", () => void renameSubtask(sub, title.value));
  const armed = editor.confirmDelete === sub.id;
  const del = el("button", armed ? "ghost danger armed" : "ghost danger", armed ? s.delConfirm : "×");
  del.type = "button";
  del.disabled = editor.busy;
  del.setAttribute("aria-label", armed ? s.delConfirm : s.subDelete(sub.title));
  del.addEventListener("click", () => void removeTask(sub.id, sub.title, true));
  row.append(box, title, del);
  return row;
}

/** Add a task to what the edited one waits for, and give the search its focus back. */
function addWait(editor: Editor, id: string, title: string) {
  if (!editor.waits || editor.waits.some((w) => w.id === id)) return;
  editor.waits.push({ id, title });
  editor.waitQuery = "";
  render();
  document.getElementById("f-wait")?.focus();
}

/** C1: "Waits for" chips with a search over every loaded task, and the read-only "Holds" list. */
function waitsSection(editor: Editor, s: Strings): HTMLElement | null {
  const waits = editor.waits;
  if (!waits) return null;
  const detail = editor.detail;
  const section = el("div", "subs waits");
  const label = el("label", "subs-title", s.waitsFor);
  label.setAttribute("for", "f-wait");
  section.append(label);
  const box = el("div", "wait-field");
  const chips = el("ul", "chips");
  chips.setAttribute("aria-label", s.waitsFor);
  for (const w of waits) {
    const chip = el("li", "chip");
    chip.append(lockIcon(), el("span", "chip-text", w.title));
    const x = el("button", "chip-x", "×");
    x.type = "button";
    x.disabled = editor.busy;
    x.setAttribute("aria-label", s.unwait(w.title));
    x.addEventListener("click", () => {
      editor.waits = (editor.waits ?? []).filter((v) => v.id !== w.id);
      render();
      document.getElementById("f-wait")?.focus();
    });
    chip.append(x);
    chips.append(chip);
  }
  if (waits.length) box.append(chips);
  const input = el("input");
  input.type = "text";
  input.id = "f-wait";
  input.value = editor.waitQuery;
  input.placeholder = s.findTask;
  input.autocomplete = "off";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", "f-wait-list");
  box.append(input);
  section.append(box);
  if (waits.length === 0) section.append(el("p", "hint sr-only", s.waitsNone));

  const list = el("ul", "wait-menu");
  list.id = "f-wait-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", s.findTask);
  const items = flowItems(state.data?.streams ?? []);
  const fill = (show: boolean) => {
    const found = waitCandidates(
      detail?.id ?? null,
      items,
      waits.map((w) => w.id),
      (detail?.blocks ?? []).map((b) => b.id),
      editor.waitQuery,
    );
    list.replaceChildren();
    list.hidden = !show;
    input.setAttribute("aria-expanded", String(show));
    if (!show) return;
    if (found.length === 0) list.append(el("li", "wait-none", s.noMatch));
    for (const c of found) {
      const li = el("li");
      li.setAttribute("role", "option");
      li.setAttribute("aria-disabled", String(c.disabled !== null));
      const opt = el("button", "wait-opt");
      opt.type = "button";
      opt.disabled = c.disabled !== null || editor.busy;
      // Keep the search's focus through the press, so the list does not close under it.
      opt.addEventListener("mousedown", (e) => e.preventDefault());
      opt.addEventListener("click", () => addWait(editor, c.id, c.title));
      const why = c.disabled === "added" ? s.alreadyAdded : c.disabled === "loop" ? s.wouldLoop : c.context;
      opt.append(el("span", "wait-title", c.title), el("span", "wait-why", why));
      li.append(opt);
      list.append(li);
    }
  };
  fill(editor.waitQuery.trim() !== "");
  input.addEventListener("input", () => {
    editor.waitQuery = input.value;
    fill(true);
  });
  input.addEventListener("focus", () => fill(true));
  input.addEventListener("blur", () => {
    // Moving into the list (by Tab or arrow) keeps it open.
    setTimeout(() => {
      if (!list.contains(document.activeElement) && document.activeElement !== input) fill(editor.waitQuery.trim() !== "");
    }, 120);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      (list.querySelector("button:not(:disabled)") as HTMLButtonElement | null)?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      (list.querySelector("button:not(:disabled)") as HTMLButtonElement | null)?.click();
    } else if (e.key === "Escape" && !list.hidden) {
      e.preventDefault();
      editor.waitQuery = "";
      input.value = "";
      fill(false);
    }
  });
  list.addEventListener("keydown", (e) => {
    const options = [...list.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const i = options.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown" && i >= 0) {
      e.preventDefault();
      options[Math.min(options.length - 1, i + 1)]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (i <= 0) input.focus();
      else options[i - 1]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      input.focus();
    }
  });
  section.append(list);

  if (editor.mode === "edit" && detail) {
    section.append(el("div", "subs-title", s.holds));
    const blocks = detail.blocks ?? [];
    if (blocks.length === 0) section.append(el("p", "hint", s.holdsNone));
    else {
      const holds = el("ul", "hold-list");
      for (const b of blocks) {
        const li = el("li", b.done ? "sub-done" : undefined, b.title);
        if (b.done) li.append(el("span", "wait-why", ` · ${s.doneShort}`));
        holds.append(li);
      }
      section.append(holds);
    }
  }
  return section;
}

/** The editor for the selected task, or for a new one; null when neither. */
function editorPanel(s: Strings): HTMLElement | null {
  const editor = state.editor;
  if (!editor) return null;
  const panel = el("form", "editor");
  panel.setAttribute("aria-label", editor.mode === "create" ? s.newTask : s.editTask(editor.draft.title));
  panel.addEventListener("submit", (e) => {
    e.preventDefault();
    void saveEditor();
  });
  const draft = editor.draft;

  const title = textInput(draft.title, (v) => (draft.title = v));
  title.maxLength = 500;
  title.required = true;
  panel.append(field(s.fTitle, title, "f-title"));

  const grid = el("div", "editor-grid");
  grid.append(
    field(s.fStart, textInput(draft.startDate, (v) => (draft.startDate = v), "date"), "f-start"),
    field(s.fDue, textInput(draft.dueDate, (v) => (draft.dueDate = v), "date"), "f-due"),
  );
  const priority = el("select");
  for (const [value, name] of [["", s.priorityNone], ["1", s.priority[1]], ["2", s.priority[2]], ["3", s.priority[3]]]) {
    const option = el("option", undefined, name);
    option.value = value;
    option.selected = draft.priority === value;
    priority.append(option);
  }
  priority.addEventListener("change", () => (draft.priority = priority.value));
  grid.append(field(s.fPriority, priority, "f-priority"));
  const tags = textInput(draft.tags, (v) => (draft.tags = v));
  tags.placeholder = s.tagsHint;
  grid.append(field(s.fTags, tags, "f-tags"));
  if (state.collections && state.collections.length > 0) {
    const collection = el("select");
    for (const [value, name] of [["", s.noCollection], ...state.collections.map((c) => [c.id, c.name])]) {
      const option = el("option", undefined, name);
      option.value = value;
      option.selected = draft.collection === value;
      collection.append(option);
    }
    collection.addEventListener("change", () => {
      draft.collection = collection.value;
      editor.collectionTouched = true;
      render();
    });
    grid.append(field(s.fCollection, collection, "f-collection"));
  }
  panel.append(grid);
  const moving =
    editor.mode === "edit" &&
    editor.detail &&
    draft.collection !== (editor.detail.collectionId ?? "") &&
    editor.detail.subtasks.length > 0;
  if (moving && editor.detail) panel.append(el("p", "hint", s.movedWith(editor.detail.subtasks.length)));

  if (editor.mode === "edit") {
    const detail = editor.detail;
    const section = el("div", "subs");
    section.append(el("div", "subs-title", s.subtasksTitle));
    if (editor.failed) section.append(el("p", "hint", s.failed));
    else if (!detail) section.append(el("p", "hint", s.loading));
    else {
      if (detail.subtasks.length === 0) section.append(el("p", "hint", s.subEmpty));
      else {
        const list = el("ul", "sub-list");
        for (const sub of detail.subtasks) list.append(subtaskRow(sub, editor, s));
        section.append(list);
      }
      const add = el("div", "sub-add");
      const input = textInput(editor.newSubtask, (v) => (editor.newSubtask = v));
      input.id = "f-newsub";
      input.maxLength = 500;
      input.placeholder = s.subAdd;
      input.setAttribute("aria-label", s.subAdd);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void addSubtask();
        }
      });
      const button = el("button", "ghost", s.subAddButton);
      button.type = "button";
      button.disabled = editor.busy;
      button.addEventListener("click", () => void addSubtask());
      add.append(input, button);
      section.append(add);
    }
    panel.append(section);
  }
  const waits = waitsSection(editor, s);
  if (waits) panel.append(waits);
  if (state.notice) {
    // Inside the editor, where the press was: a refused loop reads right here.
    const said = el("p", "notice editor-notice", state.notice);
    said.setAttribute("role", "status");
    panel.append(said);
  }

  const actions = el("div", "editor-actions");
  const save = el("button", "primary", editor.mode === "create" ? s.create : s.save);
  save.type = "submit";
  save.disabled = editor.busy || (editor.mode === "edit" && !editor.detail);
  actions.append(save);
  const detail = editor.detail;
  if (editor.mode === "edit" && detail) {
    const done = el("button", "ghost", detail.done ? s.reopen : s.done);
    done.type = "button";
    done.disabled = editor.busy;
    done.addEventListener("click", () => {
      if (detail.done) void setDone(detail.id, detail.title, false);
      else void complete({ id: detail.id, title: detail.title, score: 0, overdue: false });
    });
    actions.append(done);
    const armed = editor.confirmDelete === detail.id;
    const del = el("button", armed ? "ghost danger armed" : "ghost danger", armed ? s.delConfirm : s.del);
    del.type = "button";
    del.disabled = editor.busy;
    del.addEventListener("click", () => void removeTask(detail.id, detail.title, false));
    actions.append(del);
    if (armed && detail.subtasks.length > 0) actions.append(el("span", "hint late", s.delSubtasks(detail.subtasks.length)));
  }
  const close = el("button", "ghost", s.cancel);
  close.type = "button";
  close.addEventListener("click", closeEditor);
  actions.append(close);
  panel.append(actions);
  return panel;
}

function doneButton(task: FlowTaskOut, s: Strings): HTMLButtonElement {
  const button = el("button", "ghost done", s.done);
  button.type = "button";
  button.disabled = state.busy.has(task.id);
  button.setAttribute("aria-label", s.markDone(task.title));
  button.addEventListener("click", () => void complete(task));
  return button;
}

function nowView(data: FlowsOut, s: Strings): HTMLElement {
  const wrap = el("div", "now");
  const items = nowItems(data.streams);
  wrap.append(el("p", "count", items.length ? s.nowCount(items.length) : s.nowEmpty));
  if (items.length === 0) {
    const panel = editorPanel(s);
    if (panel) wrap.append(panel);
    return wrap;
  }
  const list = el("ol", "now-list");
  items.forEach(({ task, streams }, index) => {
    const row = el("li", "now-row");
    row.append(el("span", "rank", String(index + 1)));
    const text = el("div", "now-text");
    text.append(el("b", undefined, task.title));
    const meta = el("div", "now-meta");
    const detail = taskDetail(task, data.date, state.locale);
    if (detail) meta.append(el("span", task.overdue ? "late" : undefined, detail));
    for (const label of streams) meta.append(el("span", "pill", label));
    text.append(meta);
    const edit = el("button", "ghost", s.edit);
    edit.type = "button";
    edit.setAttribute("aria-label", s.editTask(task.title));
    edit.addEventListener("click", () => openEditor(task.id));
    row.append(text, edit, doneButton(task, s));
    list.append(row);
  });
  wrap.append(list);
  const panel = editorPanel(s);
  if (panel) wrap.append(panel);
  return wrap;
}

function calendarView(data: FlowsOut, s: Strings): HTMLElement {
  const wrap = el("div", "calendar");
  if (state.eventsStatus === "error") {
    const box = el("div", "empty");
    box.append(el("p", undefined, s.calendarFailed));
    const retry = el("button", "ghost", s.retry);
    retry.type = "button";
    retry.addEventListener("click", () => void loadEvents());
    box.append(retry);
    wrap.append(box);
    return wrap;
  }
  if (state.events === null) {
    wrap.append(el("p", "empty", s.loading));
    return wrap;
  }
  const locale = state.locale === "en" ? "en-GB" : "ru";
  const dayName = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const clock = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const days = calendarDays(
    localToday(),
    CALENDAR_DAYS,
    state.events,
    data.streams,
    (iso) => dateOf(new Date(iso)),
    (iso) => clock.format(new Date(iso)),
  );
  for (const day of days) {
    const section = el("section", day.date === localToday() ? "day day-today" : "day");
    const title = day.date === localToday() ? s.today : dayName.format(Date.parse(`${day.date}T00:00:00Z`));
    section.append(el("h2", "day-name", title));
    const list = el("ul", "day-list");
    for (const event of day.events) {
      const row = el("li", "event");
      row.append(el("span", "time", event.time ?? s.allDay), el("span", "event-title", event.title));
      list.append(row);
    }
    for (const task of day.due) {
      const row = el("li", "event event-due");
      row.append(el("span", "time", `◇ ${s.dueTask}`), el("span", "event-title", task.title));
      list.append(row);
    }
    if (list.childElementCount === 0) list.append(el("li", "event event-none", s.calendarEmpty));
    section.append(list);
    wrap.append(section);
  }
  return wrap;
}

function render() {
  // A repaint rebuilds the toolbar: whichever of its controls had the focus gets it back.
  const active = document.activeElement as HTMLElement | null;
  const keep = active?.id?.startsWith("tb-") ? active.id : null;
  paint();
  if (keep && document.activeElement !== document.getElementById(keep)) focusById(keep);
}

function paint() {
  const s = STRINGS[state.locale];
  document.documentElement.lang = state.locale;
  root.replaceChildren(toolbar(s));
  if (state.status === "error") {
    const box = el("div", "empty");
    box.append(el("p", undefined, s.failed));
    const retry = el("button", "ghost", s.retry);
    retry.type = "button";
    retry.addEventListener("click", () => void refetch());
    box.append(retry);
    root.append(box);
    return;
  }
  if (!state.data) {
    root.append(el("p", "empty", s.loading));
    return;
  }
  const { data } = state;
  const body = el("div", state.status === "loading" ? "body stale" : "body");
  body.setAttribute("aria-busy", String(state.status === "loading"));
  if (state.view === "calendar") body.append(calendarView(data, s));
  else if (data.streams.every((stream) => stream.open === 0)) {
    body.append(el("p", "empty", s.empty));
    const panel = editorPanel(s);
    if (panel) body.append(panel);
  }
  else body.append(state.view === "now" ? nowView(data, s) : flowsView(data, s));
  root.append(body);
  if (data.truncated && state.view === "flows") root.append(el("p", "footnote", s.truncated));
}

// -- host ------------------------------------------------------------------------

function applyHost(ctx: McpUiHostContext | undefined) {
  if (!ctx) return;
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx.locale) state.locale = pickLocale(ctx.locale);
  if (ctx.safeAreaInsets) {
    const { top, right, bottom, left } = ctx.safeAreaInsets;
    document.body.style.padding = `${top}px ${right}px ${bottom}px ${left}px`;
  }
}

app.ontoolinput = (params) => {
  const args = (params.arguments ?? {}) as { mine?: unknown; stream?: unknown };
  state.mine = args.mine === true;
  if (typeof args.stream === "string") state.stream = args.stream;
  render();
};

app.ontoolresult = (result) => {
  if (!accept(result)) state.status = "error";
  render();
};

app.ontoolcancelled = () => {
  state.status = "error";
  render();
};

app.onhostcontextchanged = (ctx) => {
  applyHost(ctx);
  render();
};

render();
void app.connect(new PostMessageTransport(window.parent, window.parent)).then(() => {
  applyHost(app.getHostContext());
  render();
});
