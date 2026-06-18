"use client";

// "Blocked by" editor: the tasks this one depends on (its blockers). Add via a
// picker, remove via the chip's ×. Candidates exclude self, existing blockers,
// and any task that would close a cycle (the DB rejects those anyway; filtering
// keeps them out of reach). Used in the subtask detail panel and the task dialog.
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { X, Ban } from "lucide-react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
} from "@/components/ui/select";
import type { TaskDependency, TaskRow } from "@/lib/types";

export function TaskDependenciesField({
  task,
  allTasks,
  deps,
  onAdd,
  onRemove,
}: {
  task: TaskRow;
  /** Candidate tasks to depend on (typically the collection's tasks). */
  allTasks: TaskRow[];
  /** Every dependency edge in scope (workspace). */
  deps: TaskDependency[];
  onAdd: (dependsOnTaskId: string) => void;
  onRemove: (dep: TaskDependency) => void;
}) {
  const t = useTranslations("tasks");
  const byId = useMemo(() => new Map(allTasks.map((tk) => [tk.id, tk])), [allTasks]);

  // This task's blockers (edges where it is the blocked side).
  const blockers = useMemo(
    () => deps.filter((d) => d.taskId === task.id),
    [deps, task.id],
  );

  // Adjacency for cycle detection: taskId -> the ids it depends on.
  const dependsOn = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of deps) {
      const arr = m.get(d.taskId);
      if (arr) arr.push(d.dependsOnTaskId);
      else m.set(d.taskId, [d.dependsOnTaskId]);
    }
    return m;
  }, [deps]);

  // Adding task -> candidate cycles iff candidate already (transitively) depends
  // on task. Walk candidate's dependency chain looking for task.id.
  const wouldCycle = (candidateId: string): boolean => {
    const seen = new Set<string>();
    const stack = [candidateId];
    while (stack.length) {
      const cur = stack.pop() as string;
      if (cur === task.id) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const next of dependsOn.get(cur) ?? []) stack.push(next);
    }
    return false;
  };

  const blockerIds = new Set(blockers.map((b) => b.dependsOnTaskId));
  const candidates = useMemo(
    () =>
      allTasks.filter(
        (c) => c.id !== task.id && !blockerIds.has(c.id) && !wouldCycle(c.id),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTasks, task.id, deps],
  );

  return (
    <Field>
      <FieldLabel>{t("dependencies.blockedByLabel")}</FieldLabel>
      {blockers.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {blockers.map((d) => {
            const blocker = byId.get(d.dependsOnTaskId);
            const done = blocker?.completedAt != null;
            return (
              <li key={d.id}>
                <Badge variant="outline" className="gap-1 pr-1">
                  {!done && <Ban className="size-3 text-muted-foreground" aria-hidden />}
                  <span className={done ? "text-muted-foreground line-through" : undefined}>
                    {blocker?.title ?? t("dependencies.unknownTask")}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(d)}
                    aria-label={t("dependencies.remove", {
                      title: blocker?.title ?? "",
                    })}
                    className="grid size-4 place-items-center rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
      {candidates.length > 0 ? (
        <Select value="" onValueChange={(v) => v && onAdd(v)}>
          <SelectTrigger aria-label={t("dependencies.addLabel")}>
            <SelectValue placeholder={t("dependencies.addPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {candidates.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : (
        blockers.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("dependencies.emptyHint")}</p>
        )
      )}
    </Field>
  );
}
