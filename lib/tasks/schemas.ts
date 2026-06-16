// Runtime validation for task/collection writes. The mutation layer
// (lib/supabase/mutations.ts) parses every create/update through these, so a
// buggy caller can't write malformed rows; forms reuse the same primitives so
// validation messages live in one place.
import { z } from "zod";

import { itemAttributesSchema } from "@/lib/attributes/schema";
import { flowLineStyleSchema } from "@/lib/tasks/flow-line-styles";

const nullableUuid = z.uuid().nullable();

// Shared between the write schemas below and the dialog form schema, so the
// user-facing messages live in one place.
const titleSchema = z
  .string()
  .trim()
  .min(1, "Please add a title.")
  .max(500, "Keep the title under 500 characters.");
const descriptionSchema = z.string().max(10_000, "Keep the description under 10,000 characters.");

const taskInputBase = z.object({
  workspaceId: z.uuid(),
  ownerId: z.uuid(),
  assigneeId: nullableUuid.optional(),
  parentId: nullableUuid.optional(),
  collectionId: nullableUuid.optional(),
  categoryId: nullableUuid.optional(),
  title: titleSchema,
  description: descriptionSchema.nullable().optional(),
  isPrivate: z.boolean().optional(),
  color: z.string().min(1).nullable().optional(),
  boardId: nullableUuid.optional(),
  // The form offers 1..3; 0 stays legal for legacy rows (DB CHECK is 0..3).
  priority: z.number().int().min(0).max(3).nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
  startDate: z.iso.date().nullable().optional(),
  isMilestone: z.boolean().optional(),
  position: z.number().finite().optional(),
  sequential: z.boolean().optional(),
  completedAt: z.number().int().nullable().optional(),
  attributes: itemAttributesSchema.optional(),
});

/**
 * Full create payload. The completedAt <-> done coupling is now owned by the DB
 * (a BEFORE trigger sets/clears completedAt from the target board's is_done), so
 * the schema no longer cross-checks the pair — a bare boardId can't know whether
 * its board is a completion column.
 */
export const taskInputSchema = taskInputBase;

/**
 * Update payload: any subset of fields, but never workspace/owner (tasks don't
 * move between workspaces or change creators). completedAt is normalized server-
 * side from the task's board, so no cross-field check here.
 */
export const taskPatchSchema = taskInputBase
  .omit({ workspaceId: true, ownerId: true })
  .partial();

/**
 * The task dialog's field shape: selects use "none" sentinels and the date
 * field uses "" for unset, so this schema speaks string. The submit handler
 * maps it onto TaskInput (which `taskInputSchema` then re-checks).
 */
export const taskFormSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  assigneeId: z.string(), // "none" | member id
  categoryId: z.string(), // "none" | category id
  isPrivate: z.boolean(),
  priority: z.enum(["none", "1", "2", "3"]),
  dueDate: z.literal("").or(z.iso.date()),
  startDate: z.literal("").or(z.iso.date()),
  isMilestone: z.boolean(),
  // "" = the collection's default (first) board; otherwise a board id.
  boardId: z.string(),
  attributes: itemAttributesSchema,
});
export type TaskFormValues = z.infer<typeof taskFormSchema>;

// --- Checkpoints -----------------------------------------------------------

/** Marker shapes; the single source of truth mirrored by the DB CHECK + the
 *  CheckpointShape union in lib/types.ts. */
export const checkpointShapeSchema = z.enum([
  "flag",
  "diamond",
  "star",
  "dot",
  "triangle",
]);

const checkpointTitleSchema = z
  .string()
  .trim()
  .max(200, "Keep the title under 200 characters.");

const checkpointInputBase = z.object({
  workspaceId: z.uuid(),
  taskId: z.uuid(),
  title: checkpointTitleSchema.optional(),
  atDate: z.iso.date("Pick a date."),
  reached: z.boolean().optional(),
  reachedAt: z.number().int().nullable().optional(),
  color: z.string().min(1).nullable().optional(),
  shape: checkpointShapeSchema.optional(),
  position: z.number().finite().optional(),
  createdBy: nullableUuid.optional(),
});

export const checkpointInputSchema = checkpointInputBase;

/** Update payload: any subset, but never workspace/task (a checkpoint doesn't
 *  move between tasks or workspaces). */
export const checkpointPatchSchema = checkpointInputBase
  .omit({ workspaceId: true, taskId: true })
  .partial();

/** The checkpoint editor dialog's field shape. `title` allows empty (an
 *  untitled, click-placed checkpoint); `color` null = inherit the flow color. */
export const checkpointFormSchema = z.object({
  title: checkpointTitleSchema,
  atDate: z.iso.date("Pick a date."),
  reached: z.boolean(),
  color: z.string().min(1).nullable(),
  shape: checkpointShapeSchema,
});
export type CheckpointFormValues = z.infer<typeof checkpointFormSchema>;

const collectionNameSchema = z
  .string()
  .trim()
  .min(1, "Please name the collection.")
  .max(100, "Keep the name under 100 characters.");

export const collectionInputSchema = z.object({
  workspaceId: z.uuid(),
  ownerId: nullableUuid,
  name: collectionNameSchema,
  color: z.string().min(1),
  sortOrder: z.number().finite().optional(),
});

const boardNameSchema = z
  .string()
  .trim()
  .min(1, "Please name the column.")
  .max(100, "Keep the name under 100 characters.");

export const boardInputSchema = z.object({
  workspaceId: z.uuid(),
  collectionId: z.uuid(),
  name: boardNameSchema,
  lineStyle: flowLineStyleSchema.optional(),
  position: z.number().finite().optional(),
  isDone: z.boolean().optional(),
});

export const boardPatchSchema = boardInputSchema
  .pick({ name: true, lineStyle: true, position: true, isDone: true })
  .partial();

/** The board (column) editor's field shape. */
export const boardFormSchema = z.object({
  name: boardNameSchema,
  lineStyle: flowLineStyleSchema,
  isDone: z.boolean(),
});
export type BoardFormValues = z.infer<typeof boardFormSchema>;

/**
 * The schedule dialog's field shape. Durations/counts stay strings (select and
 * number-input values); the submit handler converts and clamps them.
 */
export const scheduleTaskFormSchema = z.object({
  date: z.iso.date("Pick a date."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a start time."),
  mode: z.enum(["single", "split", "subtasks"]),
  duration: z.string().min(1),
  totalDuration: z.string().min(1),
  count: z.string(),
});
export type ScheduleTaskFormValues = z.infer<typeof scheduleTaskFormSchema>;

/** The collection dialog's field shape (create and edit share it). */
export const collectionFormSchema = z.object({
  name: collectionNameSchema,
  color: z.string().min(1),
  shared: z.boolean(),
});
export type CollectionFormValues = z.infer<typeof collectionFormSchema>;

export const collectionPatchSchema = collectionInputSchema
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
