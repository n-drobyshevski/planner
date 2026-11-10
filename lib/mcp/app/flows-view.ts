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

import type { FlowsOut, FlowStreamOut, FlowTaskOut } from "@/lib/mcp/flows";
import {
  STRINGS,
  STRIP_NOW_X,
  attentionLevel,
  pickLocale,
  streamSummary,
  stripMarks,
  taskDetail,
  type Strings,
  type ViewLocale,
} from "./view-model";

type GroupBy = FlowsOut["groupBy"];
type Attention = FlowsOut["attention"];

interface State {
  data: FlowsOut | null;
  status: "loading" | "ready" | "error";
  groupBy: GroupBy;
  attention: Attention;
  mine: boolean;
  /** a saved stream the model asked for; kept across refreshes */
  stream?: string;
  expanded: Set<string>;
  /** task ids with a completion in flight */
  busy: Set<string>;
  notice: string | null;
  locale: ViewLocale;
}

const state: State = {
  data: null,
  status: "loading",
  groupBy: "tag",
  attention: "combined",
  mine: false,
  expanded: new Set(),
  busy: new Set(),
  notice: null,
  locale: pickLocale(navigator.language),
};

const app = new App({ name: "Planner flows", version: "1.0.0" });
const root = document.getElementById("root") as HTMLElement;

const GROUPS: GroupBy[] = ["tag", "category", "collection", "assignee", "status", "priority"];
const MODES: Attention[] = ["combined", "deadline", "priority"];

/** The viewer's local calendar date, "yyyy-MM-dd". */
function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

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
  return true;
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
        limit: 5,
        ...(state.stream ? { stream: state.stream } : {}),
      },
    });
    if (!accept(result)) state.status = "error";
  } catch {
    state.status = "error";
  }
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
  const heading = el("h1", "title", state.data?.stream ?? s.title);
  bar.append(heading);
  const controls = el("div", "controls");
  controls.append(
    select(s.groupBy, state.groupBy, GROUPS, s.groups, (groupBy) => void refetch({ groupBy })),
    select(s.attention, state.attention, MODES, s.modes, (attention) => void refetch({ attention })),
  );
  const mine = el("label", "check");
  const box = el("input");
  box.type = "checkbox";
  box.checked = state.mine;
  box.addEventListener("change", () => void refetch({ mine: box.checked }));
  mine.append(box, el("span", undefined, s.mine));
  controls.append(mine);
  const refresh = el("button", "ghost", s.refresh);
  refresh.type = "button";
  refresh.addEventListener("click", () => void refetch());
  controls.append(refresh);
  bar.append(controls);
  return bar;
}

/** The small timeline under a stream: now, and a mark per upcoming deadline. */
function strip(stream: FlowStreamOut, today: string, s: Strings): HTMLElement {
  const track = el("div", "strip");
  track.setAttribute("aria-hidden", "true");
  const line = el("div", "strip-line");
  const now = el("div", "strip-now");
  now.style.left = `${STRIP_NOW_X * 100}%`;
  now.title = s.now;
  track.append(line, now);
  for (const mark of stripMarks(stream.tasks, today)) {
    const node = el("div", mark.overdue ? "mark mark-late" : "mark");
    node.style.left = `${mark.x * 100}%`;
    if (mark.count > 1) node.append(el("span", "mark-count", String(mark.count)));
    track.append(node);
  }
  return track;
}

function chip(stream: FlowStreamOut, s: Strings): HTMLElement | null {
  const level = attentionLevel(stream.score);
  if (level === "none" || stream.needsAttention === 0) return null;
  // The level is carried by the glyph and the border, not by colour alone.
  const node = el("span", `chip chip-${level}`, `${level === "now" ? "»" : "›"} ${stream.needsAttention}`);
  node.title = s.needs(stream.needsAttention);
  node.setAttribute("aria-label", s.needs(stream.needsAttention));
  return node;
}

function taskRow(task: FlowTaskOut, today: string, s: Strings): HTMLElement {
  const row = el("li", "task");
  const level = attentionLevel(task.score);
  const text = el("div", "task-text");
  text.append(el("span", "task-title", task.title));
  const detail = taskDetail(task, today, state.locale);
  if (detail) text.append(el("span", task.overdue ? "task-detail late" : "task-detail", detail));
  if (level !== "none") row.classList.add(`task-${level}`);
  const button = el("button", "ghost done", s.done);
  button.type = "button";
  button.disabled = state.busy.has(task.id);
  button.setAttribute("aria-label", s.markDone(task.title));
  button.addEventListener("click", () => void complete(task));
  row.append(text, button);
  return row;
}

function streamCard(stream: FlowStreamOut, today: string, s: Strings): HTMLElement {
  const card = el("section", "stream");
  const open = state.expanded.has(stream.key);
  const head = el("button", "stream-head");
  head.type = "button";
  head.setAttribute("aria-expanded", String(open));
  head.disabled = stream.tasks.length === 0;
  head.addEventListener("click", () => {
    if (open) state.expanded.delete(stream.key);
    else state.expanded.add(stream.key);
    render();
  });
  const names = el("div", "stream-names");
  names.append(el("span", "caret", open ? "▾" : "▸"), el("span", "stream-label", stream.label));
  const attention = chip(stream, s);
  if (attention) names.append(attention);
  head.append(names, el("div", stream.overdue > 0 ? "summary late" : "summary", streamSummary(stream, today, state.locale)));
  card.append(head, strip(stream, today, s));
  if (open) {
    const list = el("ul", "tasks");
    for (const task of stream.tasks) list.append(taskRow(task, today, s));
    const hidden = stream.open - stream.tasks.length;
    if (hidden > 0) list.append(el("li", "more", s.more(hidden)));
    card.append(list);
  }
  return card;
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
  const list = el("div", state.status === "loading" ? "streams stale" : "streams");
  list.setAttribute("aria-busy", String(state.status === "loading"));
  if (data.streams.length === 0) list.append(el("p", "empty", s.empty));
  for (const stream of data.streams) list.append(streamCard(stream, data.date, s));
  root.append(list);
  if (data.truncated) root.append(el("p", "footnote", s.truncated));
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
  // Open the stream that needs attention most, so the first screen answers
  // "what now?" without a click.
  const first = state.data?.streams.find((stream) => stream.needsAttention > 0 && stream.tasks.length > 0);
  if (first && state.expanded.size === 0) state.expanded.add(first.key);
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
