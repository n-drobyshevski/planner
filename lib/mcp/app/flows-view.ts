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

import type { FlowsOut, FlowTaskOut } from "@/lib/mcp/flows";
import {
  RUNWAY_NARROW,
  RUNWAY_NOW_X,
  STRINGS,
  attentionLevel,
  calendarDays,
  nowItems,
  pickLocale,
  runwayLabel,
  runwayLabelSide,
  runwayOf,
  runwayTicks,
  streamSummary,
  taskDetail,
  type CalendarEventIn,
  type Strings,
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
  if (state.selected && !findTask(state.selected)) state.selected = null;
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
        limit: 6,
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

async function complete(task: FlowTaskOut) {
  const s = STRINGS[state.locale];
  state.busy.add(task.id);
  state.notice = null;
  render();
  let ok = false;
  try {
    const result = await app.callServerTool({ name: "complete_task", arguments: { id: task.id } });
    ok = !result.isError;
  } catch {
    ok = false;
  }
  state.busy.delete(task.id);
  if (!ok) {
    state.notice = s.doneFailed;
    render();
    return;
  }
  state.notice = s.markedDone(task.title);
  if (state.selected === task.id) state.selected = null;
  // Tell the model what the member just did, so its next answer is not stale.
  void app
    .updateModelContext({
      content: [{ type: "text", text: `The user marked the task "${task.title}" (id ${task.id}) as done in the Flows view.` }],
    })
    .catch(() => undefined);
  await refetch();
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
    state.selected = state.selected === task.id ? null : task.id;
    render();
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
  for (const stream of data.streams) {
    if (stream.open === 0) continue;
    const name = el("div", "name");
    name.append(el("b", undefined, stream.label));
    name.append(el("small", stream.overdue > 0 ? "late" : undefined, streamSummary(stream, data.date, state.locale)));
    const lane = el("div", "lane");
    const nowLine = el("div", "now-line");
    nowLine.style.left = pct(RUNWAY_NOW_X);
    lane.append(nowLine);
    for (const task of stream.tasks) lane.append(runwayRow(task, data.date, s));
    const hidden = stream.open - stream.tasks.length;
    if (hidden > 0) lane.append(el("div", "more", s.more(hidden)));
    board.append(name, lane);
  }
  wrap.append(board);

  const selected = state.selected ? findTask(state.selected) : undefined;
  const detail = el("div", "detail");
  if (selected) {
    const text = el("div", "detail-text");
    text.append(el("b", undefined, selected.title));
    const facts = [
      taskDetail(selected, data.date, state.locale) || s.noDeadline,
      selected.progress ? s.subtasks(selected.progress.done, selected.progress.total) : "",
    ].filter(Boolean);
    text.append(el("span", selected.overdue ? "late" : undefined, facts.join(" · ")));
    detail.append(text, doneButton(selected, s));
  } else {
    detail.append(el("span", "hint", s.pick));
  }
  wrap.append(detail);
  return wrap;
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
  if (items.length === 0) return wrap;
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
    row.append(text, doneButton(task, s));
    list.append(row);
  });
  wrap.append(list);
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
  else if (data.streams.every((stream) => stream.open === 0)) body.append(el("p", "empty", s.empty));
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
