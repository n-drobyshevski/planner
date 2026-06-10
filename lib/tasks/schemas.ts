// Runtime validation for task/board writes. The mutation layer
// (lib/supabase/mutations.ts) parses every create/update through these, so a
// buggy caller can't write malformed rows; forms reuse the same primitives so
// validation messages live in one place.
import { z } from "zod";

export const taskStatusSchema = z.enum(["todo", "in_progress", "done"]);

const nullableUuid = z.uuid().nullable();

const taskInputBase = z.object({
  workspaceId: z.uuid(),
  ownerId: z.uuid(),
  assigneeId: nullableUuid.optional(),
  parentId: nullableUuid.optional(),
  boardId: nullableUuid.optional(),
  categoryId: nullableUuid.optional(),
  title: z.string().trim().min(1, "Please add a title.").max(500, "Keep the title under 500 characters."),
  description: z.string().max(10_000, "Keep the description under 10,000 characters.").nullable().optional(),
  isPrivate: z.boolean().optional(),
  color: z.string().min(1).nullable().optional(),
  status: taskStatusSchema.optional(),
  // The form offers 1..3; 0 stays legal for legacy rows (DB CHECK is 0..3).
  priority: z.number().int().min(0).max(3).nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
  position: z.number().finite().optional(),
  sequential: z.boolean().optional(),
  completedAt: z.number().int().nullable().optional(),
});

/** Full create payload. Enforces the done <-> completedAt coupling the DB CHECKs. */
export const taskInputSchema = taskInputBase.superRefine((v, ctx) => {
  const done = (v.status ?? "todo") === "done";
  if (done !== (v.completedAt != null)) {
    ctx.addIssue({
      code: "custom",
      path: ["completedAt"],
      message: done
        ? "A done task needs a completion time."
        : "Only done tasks carry a completion time.",
    });
  }
});

/**
 * Update payload: any subset of fields, but never workspace/owner (tasks don't
 * move between workspaces or change creators). When a patch carries only one of
 * status/completedAt the DB trigger normalizes the pair, so the coupling is
 * only checked when both are present.
 */
export const taskPatchSchema = taskInputBase
  .omit({ workspaceId: true, ownerId: true })
  .partial()
  .superRefine((v, ctx) => {
    if (v.status === undefined || v.completedAt === undefined) return;
    if ((v.status === "done") !== (v.completedAt != null)) {
      ctx.addIssue({
        code: "custom",
        path: ["completedAt"],
        message: "Completion time doesn't match the status.",
      });
    }
  });

export const boardInputSchema = z.object({
  workspaceId: z.uuid(),
  ownerId: nullableUuid,
  name: z.string().trim().min(1, "Please name the board.").max(100, "Keep the name under 100 characters."),
  color: z.string().min(1),
  sortOrder: z.number().finite().optional(),
});

export const boardPatchSchema = boardInputSchema
  .pick({ name: true, color: true, sortOrder: true })
  .partial();

/**
 * Parse with a plain Error carrying the first issue's message, so the existing
 * toast plumbing (use-task-mutations `run()`) shows a human-readable line
 * instead of a serialized ZodError.
 */
export function parseInput<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input.");
  }
  return result.data;
}
