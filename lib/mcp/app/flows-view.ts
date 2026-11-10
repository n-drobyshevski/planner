// The Flows MCP App: the view Claude shows when it calls `show_flows`.
//
// Browser code. scripts/build-mcp-app.mjs bundles this file (with the MCP
// Apps SDK) into one self-contained HTML document, kept in
// flows-app.generated.ts and served as the `ui://planner/flows.html`
// resource. The host renders it in a sandboxed iframe: no network of its own,
// no cookies, no planner session. Everything it knows arrives as the tool's
// result, and everything it does goes back through the host as a tool call
// the member's own token authorizes (`show_flows` to refetch, `complete_task`
// to tick a task off).
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

import type { FlowsOut, FlowTaskOut, TaskDetailOut, TaskDetailSubtask } from "@/lib/mcp/flows";
import {
  EMPTY_DRAFT,
  RUNWAY_NARROW,
  RUNWAY_NOW_X,
  STRINGS,
  attentionLevel,
  calendarDays,
  createArgs,
  draftOf,
  nowItems,
  pickLocale,
  runwayLabel,
  runwayLabelSide,
  runwayOf,
  runwayTicks,
  streamSummary,
  taskDetail,
  updateArgs,
  type CalendarEventIn,
  type Strings,
  type TaskDraft,
  type ViewLocale,
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
  notice: string | null;
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
  locale: pickLocale(navigator.language),
  events: null,
  eventsStatus: "idle",
  editor: null,
  collections: null,
  expanded: new Set(),
  focus: null,
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

/** Call one of this server's tools through the host; its JSON result, or a throw. */
async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await app.callServerTool({ name, arguments: args });
  const first = result.content?.[0];
  if (result.isError || !first || first.type !== "text") throw new Error("tool failed");
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

function openEditor(id: string) {
  state.selected = id;
  state.editor = { mode: "edit", detail: null, failed: false, draft: { ...EMPTY_DRAFT }, newSubtask: "", collectionTouched: false, confirmDelete: null, busy: false };
  const known = findTask(id);
  if (known) state.editor.draft = draftOf({ ...known, tags: known.tags ?? [] });
  render();
  void loadCollections();
  void loadDetail(id);
}

function openCreate() {
  state.selected = null;
  state.editor = { mode: "create", detail: null, failed: false, draft: { ...EMPTY_DRAFT }, newSubtask: "", collectionTouched: false, confirmDelete: null, busy: false };
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
    state.notice = noticed;
    tellModel(said);
  } catch {
    state.notice = s.actionFailed;
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
    const args = createArgs(editor.draft);
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
        state.editor = { mode: "edit", detail: null, failed: false, draft: { ...editor.draft }, newSubtask: "", collectionTouched: false, confirmDelete: null, busy: false };
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
  if (Object.keys(patch).length === 0) {
    state.notice = s.saved;
    render();
    return;
  }
  await mutate(async () => {
    await call("update_task", { id: detail.id, ...patch });
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

// -- painting ------------------------------------------------------------------

function select<T extends string>(
  label: string,
  value: T,
  options: readonly T[],
  names: Record<T, string>,
  onChange: (next: T) => void,
): HTMLElement {
  const wrap = el("label", "field");
  wrap.append(el("span", "field-label", label));
  const input = el("select");
  for (const option of options) {
    const node = el("option", undefined, names[option]);
    node.value = option;
    node.selected = option === value;
    input.append(node);
  }
  input.addEventListener("change", () => onChange(input.value as T));
  wrap.append(input);
  return wrap;
}

function toolbar(s: Strings): HTMLElement {
  const bar = el("div", "toolbar");
  const views = el("div", "seg");
  views.setAttribute("role", "group");
  views.setAttribute("aria-label", s.view);
  for (const view of VIEWS) {
    const button = el("button", view === state.view ? "seg-on" : undefined, s.views[view]);
    button.type = "button";
    button.setAttribute("aria-pressed", String(view === state.view));
    button.addEventListener("click", () => setView(view));
    views.append(button);
  }
  bar.append(views);
  const controls = el("div", "controls");
  if (state.view === "flows") {
    controls.append(select(s.groupBy, state.groupBy, GROUPS, s.groups, (groupBy) => void refetch({ groupBy })));
  }
  if (state.view !== "calendar") {
    controls.append(
      select(s.attention, state.attention, MODES, s.modes, (attention) => void refetch({ attention })),
    );
  }
  const mine = el("label", "check");
  const box = el("input");
  box.type = "checkbox";
  box.checked = state.mine;
  box.addEventListener("change", () => void refetch({ mine: box.checked }));
  mine.append(box, el("span", undefined, s.mine));
  controls.append(mine);
  if (state.view !== "calendar") {
    const add = el("button", "primary", s.newTask);
    add.type = "button";
    add.addEventListener("click", openCreate);
    controls.append(add);
  }
  bar.append(controls);
  return bar;
}

const pct = (x: number) => `${x * 100}%`;

/** One task as a runway: a bar from its start to its deadline. */
function runwayRow(task: FlowTaskOut, today: string, s: Strings): HTMLElement {
  const row = el("div", "run");
  const runway = runwayOf(task, today);
  const label = runwayLabel(task, today, state.locale);
  const detail = [label ?? s.noDeadline, task.progress ? s.subtasks(task.progress.done, task.progress.total) : ""]
    .filter(Boolean)
    .join(", ");

  const bar = el("button", `bar bar-${runway.state}`);
  bar.type = "button";
  bar.style.left = pct(runway.x0);
  bar.style.width = pct(runway.x1 - runway.x0);
  if (runway.clippedStart) bar.classList.add("clip-start");
  if (runway.clippedEnd) bar.classList.add("clip-end");
  if (state.selected === task.id) bar.classList.add("bar-selected");
  if (attentionLevel(task.score) === "now") bar.classList.add("bar-urgent");
  bar.setAttribute("aria-pressed", String(state.selected === task.id));
  bar.setAttribute("aria-label", s.runway(task.title, detail));
  bar.title = s.runway(task.title, detail);
  bar.addEventListener("click", () => {
    if (state.selected === task.id) closeEditor();
    else openEditor(task.id);
  });
  if (runway.fill > 0) {
    const fill = el("i", "fill");
    fill.style.width = pct(runway.fill);
    bar.append(fill);
  }
  // A short runway cannot hold its title: it goes beside the bar instead.
  const narrow = runway.x1 - runway.x0 < RUNWAY_NARROW;
  if (!narrow) bar.append(el("span", "bar-title", task.title));
  row.append(bar);

  if (runway.over) {
    const over = el("div", "over");
    over.style.left = pct(runway.over.x0);
    over.style.width = pct(Math.max(0.012, runway.over.x1 - runway.over.x0));
    row.append(over);
  }
  // The deadline leads, so it is what survives when the words are cut short.
  const words = [label ?? "", narrow ? task.title : ""].filter(Boolean).join(" · ");
  if (words) {
    // The words follow whatever ends last: the bar, or the overrun.
    const end = Math.max(runway.x1, runway.over?.x1 ?? 0);
    const side = runwayLabelSide(runway);
    const tag = el("span", runway.state === "late" ? "tag late" : "tag", words);
    if (side === "after") tag.style.left = pct(end);
    else if (side === "before") {
      tag.classList.add("tag-before");
      tag.style.right = pct(1 - runway.x0);
    } else {
      tag.classList.add("tag-inside");
    }
    row.append(tag);
  }
  return row;
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
  board.append(el("div", "corner"), ruler(data.date, s));
  // One stream at a time: a picker of the streams with open tasks, most
  // pressing first. A focus that is gone (regrouped, all done) falls back.
  const open = data.streams.filter((st) => st.open > 0);
  const current = open.find((st) => st.key === state.focus) ?? open[0];
  if (open.length > 1) {
    const pick = el("div", "seg stream-pick");
    pick.setAttribute("role", "group");
    pick.setAttribute("aria-label", s.stream);
    for (const st of open) {
      const on = st === current;
      const button = el("button", on ? "seg-on" : undefined);
      button.type = "button";
      button.setAttribute("aria-pressed", String(on));
      button.append(el("span", undefined, st.label), el("span", st.overdue > 0 ? "pick-n late" : "pick-n", String(st.open)));
      button.addEventListener("click", () => {
        state.focus = st.key;
        render();
      });
      pick.append(button);
    }
    wrap.append(pick);
  }
  for (const stream of current ? [current] : []) {
    const name = el("div", "name");
    name.append(el("b", undefined, stream.label));
    name.append(el("small", stream.overdue > 0 ? "late" : undefined, streamSummary(stream, data.date, state.locale)));
    const lane = el("div", "lane");
    const nowLine = el("div", "now-line");
    nowLine.style.left = pct(RUNWAY_NOW_X);
    lane.append(nowLine);
    const open = state.expanded.has(stream.key);
    const shown = open ? stream.tasks : stream.tasks.slice(0, COLLAPSED_TASKS);
    for (const task of shown) lane.append(runwayRow(task, data.date, s));
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
    board.append(name, lane);
  }
  wrap.append(board);

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
  const s = STRINGS[state.locale];
  document.documentElement.lang = state.locale;
  root.replaceChildren(toolbar(s));
  const live = el("p", "notice", state.notice ?? "");
  live.setAttribute("role", "status");
  root.append(live);
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
