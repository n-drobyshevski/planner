/**
 * Seed the planner: create the two member auth users (so RLS works) plus a
 * workspace, categories, and a few sample events.
 *
 * Idempotent-ish: re-running upserts the workspace/members and recreates
 * sample data. Requires SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
 *
 * Run:  pnpm seed   (loads .env.local via --env-file)
 */
import { createClient } from "@supabase/supabase-js";

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var: ${name}. Copy .env.example to .env.local.`);
    process.exit(1);
  }
  return v;
}

async function ensureAuthUser(email: string, password: string): Promise<string> {
  // Try to create; if the user already exists, look it up.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error && data.user) return data.user.id;

  // Already registered -> find by listing (small project: page 1 is enough).
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listErr) throw listErr;
  const found = list.users.find((u) => u.email === email);
  if (!found) throw error ?? new Error(`Could not create or find user ${email}`);
  return found.id;
}

async function main() {
  const members = [
    {
      key: "A",
      name: process.env.MEMBER_A_NAME ?? "Alex",
      email: requireEnv("MEMBER_A_EMAIL"),
      password: requireEnv("MEMBER_A_PASSWORD"),
      color: "#c0492a", // coral
    },
    {
      key: "B",
      name: process.env.MEMBER_B_NAME ?? "Sam",
      email: requireEnv("MEMBER_B_EMAIL"),
      password: requireEnv("MEMBER_B_PASSWORD"),
      color: "#0f766e", // teal
    },
  ];

  // Auth users first.
  for (const m of members) {
    (m as { authUserId?: string }).authUserId = await ensureAuthUser(
      m.email,
      m.password,
    );
    console.log(`✓ auth user ${m.email}`);
  }

  // Fresh workspace each run (cascades clean up children).
  await admin.from("workspaces").delete().neq("id", crypto.randomUUID());
  const { data: ws, error: wsErr } = await admin
    .from("workspaces")
    .insert({ name: process.env.WORKSPACE_NAME ?? "Planner" })
    .select()
    .single();
  if (wsErr) throw wsErr;
  console.log(`✓ workspace ${ws.id}`);

  const memberRows = members.map((m) => ({
    workspace_id: ws.id,
    auth_user_id: (m as { authUserId?: string }).authUserId!,
    name: m.name,
    color: m.color,
  }));
  const { data: insertedMembers, error: memErr } = await admin
    .from("members")
    .insert(memberRows)
    .select();
  if (memErr) throw memErr;
  const memA = insertedMembers.find((m) => m.name === members[0].name)!;
  const memB = insertedMembers.find((m) => m.name === members[1].name)!;
  console.log(`✓ members ${memA.name}, ${memB.name}`);

  // Categories: shared (owner null) + one personal per member.
  const { data: cats, error: catErr } = await admin
    .from("categories")
    .insert([
      { workspace_id: ws.id, owner_id: null, name: "Home", color: "#b45309", sort_order: 0 },
      { workspace_id: ws.id, owner_id: null, name: "Social", color: "#7c3aed", sort_order: 1 },
      { workspace_id: ws.id, owner_id: memA.id, name: `${memA.name} · Work`, color: "#0369a1", sort_order: 2 },
      { workspace_id: ws.id, owner_id: memB.id, name: `${memB.name} · Work`, color: "#15803d", sort_order: 3 },
    ])
    .select();
  if (catErr) throw catErr;
  const home = cats.find((c) => c.name === "Home")!;
  const social = cats.find((c) => c.name === "Social")!;
  console.log(`✓ ${cats.length} categories`);

  // Collections: a shared default + a second shared collection, plus one
  // personal collection (left empty, handy for trying the delete flow).
  const { data: collections, error: collErr } = await admin
    .from("collections")
    .insert([
      { workspace_id: ws.id, owner_id: null, name: "Tasks", color: "#c0492a", sort_order: 0 },
      { workspace_id: ws.id, owner_id: null, name: "Errands", color: "#0369a1", sort_order: 1 },
      { workspace_id: ws.id, owner_id: memA.id, name: `${memA.name} · Focus`, color: "#7c3aed", sort_order: 2 },
    ])
    .select();
  if (collErr) throw collErr;
  const collectionMain = collections.find((c) => c.name === "Tasks")!;
  const collectionErrands = collections.find((c) => c.name === "Errands")!;
  console.log(`✓ ${collections.length} collections`);

  // Sample events around "today".
  const tz = "Europe/Berlin";
  const at = (dayOffset: number, hour: number, min = 0) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, min, 0, 0);
    return d.toISOString();
  };
  const plus = (iso: string, mins: number) =>
    new Date(new Date(iso).getTime() + mins * 60_000).toISOString();
  // Zone-free "yyyy-MM-dd" token for task due dates.
  const dateAt = (dayOffset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return d.toISOString().slice(0, 10);
  };

  const s1 = at(0, 9);
  const s2 = at(0, 9, 30); // overlaps s1 -> exercises packing
  const s3 = at(1, 14);

  const { error: evErr } = await admin.from("events").insert([
    {
      workspace_id: ws.id, owner_id: memA.id, category_id: social.id,
      title: "Coffee together",
      all_day: false, starts_at: s1, ends_at: plus(s1, 60), time_zone: tz,
    },
    {
      workspace_id: ws.id, owner_id: memB.id, category_id: cats.find((c) => c.owner_id === memB.id)!.id,
      title: "Standup", is_private: true,
      all_day: false, starts_at: s2, ends_at: plus(s2, 30), time_zone: tz,
    },
    {
      workspace_id: ws.id, owner_id: memA.id, category_id: home.id,
      title: "Grocery run",
      all_day: false, starts_at: s3, ends_at: plus(s3, 90), time_zone: tz,
    },
    {
      // A named context window (the labelled day-structure band). Public shares can
      // disclose its NAME independently of event titles — see the context-names share.
      workspace_id: ws.id, owner_id: memA.id, category_id: home.id,
      title: "Work hours", kind: "context",
      all_day: false, starts_at: at(0, 9), ends_at: at(0, 17), time_zone: tz,
    },
    {
      // Weekly recurring shared event (Mon/Wed/Fri 18:00 dinner).
      workspace_id: ws.id, owner_id: memB.id, category_id: home.id,
      title: "Dinner",
      all_day: false, starts_at: at(0, 18), ends_at: at(0, 19), time_zone: tz,
      rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
    },
    {
      // Multi-day, all-day shared event -> renders as a spanning bar in month view.
      workspace_id: ws.id, owner_id: memA.id, category_id: null,
      title: "Weekend getaway",
      all_day: true, starts_at: at(5, 0), ends_at: at(8, 0), time_zone: tz,
    },
  ]);
  if (evErr) throw evErr;
  console.log("✓ sample events");

  // --- Phase 4: public-sharing fixtures (deterministic tokens for e2e) ---------
  // A NON-private event explicitly withheld from public links — the public view
  // must never show it (distinct from the private "Standup", which is hidden by RLS).
  const { error: hidErr } = await admin.from("events").insert({
    workspace_id: ws.id, owner_id: memA.id, category_id: home.id,
    title: "Hidden lunch", hidden_from_public: true,
    all_day: false, starts_at: at(1, 12), ends_at: plus(at(1, 12), 60), time_zone: tz,
  });
  if (hidErr) throw hidErr;

  // Three share links with fixed tokens so the e2e specs can navigate
  // /share/<token> deterministically. Visibility is now per-axis (the `mode` column
  // is vestigial — kept only so a not-yet-redeployed client can still read it):
  //   • details  — everything shown (titles, descriptions, context names).
  //   • busy     — everything redacted to "Busy".
  //   • context  — events redacted to "Busy", but context-window NAMES disclosed
  //                (the "shape of the day without the events" case).
  const { data: shares, error: shErr } = await admin
    .from("public_calendar_shares")
    .insert([
      {
        workspace_id: ws.id, owner_id: memA.id, token: "e2e-details-token", label: "Friends", mode: "details",
        show_event_titles: true, show_event_details: true, show_context_names: true,
      },
      {
        workspace_id: ws.id, owner_id: memA.id, token: "e2e-busy-token", label: "Work", mode: "busy",
        show_event_titles: false, show_event_details: false, show_context_names: false,
      },
      {
        workspace_id: ws.id, owner_id: memA.id, token: "e2e-context-token", label: "Shape", mode: "busy",
        show_event_titles: false, show_event_details: false, show_context_names: true,
      },
    ])
    .select();
  if (shErr) throw shErr;
  const detailsShare = shares.find((s) => s.token === "e2e-details-token")!;
  console.log(`✓ public shares (${shares.length})`);

  // One pending timeslot request → lands in memA's inbox.
  const { error: reqErr } = await admin.from("timeslot_requests").insert([
    {
      share_id: detailsShare.id, workspace_id: ws.id, owner_id: memA.id,
      requester_name: "Riley", message: "Lunch next week?",
      proposed_start: at(3, 12), proposed_end: at(3, 13), status: "pending",
    },
  ]);
  if (reqErr) throw reqErr;
  console.log("✓ sample timeslot request");

  // Sample tasks (+ ordered subtasks + a task already scheduled on the calendar).
  const memBWork = cats.find((c) => c.owner_id === memB.id)!;
  const { data: taskRows, error: tErr } = await admin
    .from("tasks")
    .insert([
      {
        workspace_id: ws.id, owner_id: memA.id, category_id: home.id, collection_id: collectionMain.id,
        title: "Plan spring garden",
        status: "todo", position: 1, sequential: true,
      },
      {
        workspace_id: ws.id, owner_id: memB.id, category_id: memBWork.id, collection_id: collectionMain.id,
        title: "Performance review prep", is_private: true,
        status: "in_progress", position: 2, sequential: false,
      },
      {
        workspace_id: ws.id, owner_id: memA.id, category_id: home.id, collection_id: collectionErrands.id,
        title: "Pay rent",
        status: "todo", position: 3, priority: 3, due_date: dateAt(3), sequential: false,
      },
      {
        workspace_id: ws.id, owner_id: memA.id, assignee_id: memA.id, collection_id: collectionMain.id,
        title: "Write report",
        status: "todo", position: 4, sequential: false,
      },
    ])
    .select();
  if (tErr) throw tErr;
  const garden = taskRows.find((t) => t.title === "Plan spring garden")!;
  const report = taskRows.find((t) => t.title === "Write report")!;

  // Ordered subtasks; parent is "do in order" so "Plant" is blocked until
  // "Buy seeds" is done ("Clear the beds" is already done -> 1/3 progress).
  const { error: stErr } = await admin.from("tasks").insert([
    {
      workspace_id: ws.id, owner_id: memA.id, parent_id: garden.id, collection_id: garden.collection_id,
      title: "Clear the beds",
      status: "done", position: 1, completed_at: new Date().toISOString(),
    },
    {
      workspace_id: ws.id, owner_id: memA.id, parent_id: garden.id, collection_id: garden.collection_id,
      title: "Buy seeds",
      status: "todo", position: 2,
    },
    {
      workspace_id: ws.id, owner_id: memA.id, parent_id: garden.id, collection_id: garden.collection_id,
      title: "Plant",
      status: "todo", position: 3,
    },
  ]);
  if (stErr) throw stErr;

  // "Write report" already scheduled as a 90-min block tomorrow (linked via task_id).
  const { error: blkErr } = await admin.from("events").insert({
    workspace_id: ws.id, owner_id: memA.id, category_id: null, task_id: report.id,
    title: "Write report",
    all_day: false, starts_at: at(1, 10), ends_at: at(1, 11, 30), time_zone: tz,
  });
  if (blkErr) throw blkErr;
  console.log("✓ sample tasks (+ subtasks + scheduled block)");

  console.log("\nSeed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
