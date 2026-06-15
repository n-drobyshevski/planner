import type { TaskRow } from "@/lib/types";

/**
 * The task handlers the shell exposes to its views, grouped so the board/list
 * take one `actions` prop instead of a six-way handler drill.
 */
export interface TaskActions {
  /** Open the editor dialog for a task. */
  open: (t: TaskRow) => void;
  toggleDone: (t: TaskRow) => void;
  /** Persist a drag: new board column + fractional position. */
  move: (t: TaskRow, boardId: string, position: number) => void;
  /** Open the create dialog, optionally seeded with a board column. */
  create: (boardId?: string) => void;
  /** Open the create dialog seeded to file the new task under `parent`. */
  addSubtask: (parent: TaskRow) => void;
  changeColor: (t: TaskRow, color: string | null) => void;
  /** Ask to delete (opens the confirm dialog). */
  remove: (t: TaskRow) => void;
}
