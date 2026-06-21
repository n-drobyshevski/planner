"use client";

import { useState } from "react";

import { EventDialog } from "@/components/event/event-dialog";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { CreateContextDialog } from "@/components/shared/create-context-dialog";
import { Button } from "@/components/ui/button";
import type { Category, Member } from "@/lib/types";

const WORKSPACE = "preview";
const ME = "m1";

// The Member type carries a lot of preference fields the dialogs never read
// (only id / name / color matter here), so cast a minimal pair rather than
// enumerate them — this is a throwaway sandbox, not production data.
const members = [
  { id: "m1", name: "Alex", color: "#c0492a" },
  { id: "m2", name: "Sam", color: "#0f766e" },
] as unknown as Member[];

const categories: Category[] = [
  { id: "c1", workspaceId: WORKSPACE, ownerId: null, name: "Household", color: "#b45309", sortOrder: 0 },
  { id: "c2", workspaceId: WORKSPACE, ownerId: ME, name: "Work", color: "#0369a1", sortOrder: 1 },
  { id: "c3", workspaceId: WORKSPACE, ownerId: ME, name: "Personal", color: "#7c3aed", sortOrder: 2 },
];

type Which = null | "event" | "task" | "context";

export function DialogPreview() {
  const [which, setWhich] = useState<Which>(null);
  const close = () => setWhich(null);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 p-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Dialog preview</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          The redesigned two-column create dialogs. On desktop they open wider and
          shorter; drag the window below 768px to watch each one switch to the
          single-column bottom sheet. Don&apos;t press Save — this sandbox has no
          workspace behind it.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setWhich("event")}>Open event</Button>
        <Button onClick={() => setWhich("task")}>Open task</Button>
        <Button onClick={() => setWhich("context")}>Open context</Button>
      </div>

      <EventDialog
        open={which === "event"}
        onOpenChange={(o) => (o ? setWhich("event") : close())}
        mode="create"
        workspaceId={WORKSPACE}
        currentMemberId={ME}
        categories={categories}
      />

      <TaskDialog
        open={which === "task"}
        onOpenChange={(o) => (o ? setWhich("task") : close())}
        mode="create"
        workspaceId={WORKSPACE}
        currentMemberId={ME}
        boards={[]}
        members={members}
        categories={categories}
      />

      <CreateContextDialog
        open={which === "context"}
        onOpenChange={(o) => (o ? setWhich("context") : close())}
        workspaceId={WORKSPACE}
        currentMemberId={ME}
        onCreated={close}
      />
    </main>
  );
}
