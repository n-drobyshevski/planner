"use client";

import { useReducer } from "react";
import type { TaskRow } from "@/lib/types";

export type EditorState =
  | { mode: "create"; boardId?: string; parentId?: string }
  | { mode: "edit"; taskId: string };

/** The checkpoint (flow milestone) editor: create on a flow, or edit by id. */
export type CheckpointEditorState =
  | { mode: "create"; taskId: string; atDate?: string }
  | { mode: "edit"; checkpointId: string };

interface DialogsState {
  editor: EditorState | null;
  scheduling: TaskRow | null;
  deleting: TaskRow | null;
  checkpointEditor: CheckpointEditorState | null;
}

type DialogsAction =
  | { type: "openCreate"; boardId?: string; parentId?: string }
  | { type: "openEdit"; taskId: string }
  | { type: "openSchedule"; task: TaskRow }
  /** "Add to calendar" from inside the editor: swap editor → schedule. */
  | { type: "scheduleFromEditor"; task: TaskRow }
  | { type: "openDelete"; task: TaskRow }
  | { type: "openCreateCheckpoint"; taskId: string; atDate?: string }
  | { type: "openEditCheckpoint"; checkpointId: string }
  | { type: "closeEditor" }
  | { type: "closeSchedule" }
  | { type: "closeDelete" }
  | { type: "closeCheckpoint" };

function reducer(state: DialogsState, action: DialogsAction): DialogsState {
  switch (action.type) {
    case "openCreate":
      return {
        ...state,
        editor: { mode: "create", boardId: action.boardId, parentId: action.parentId },
      };
    case "openEdit":
      return { ...state, editor: { mode: "edit", taskId: action.taskId } };
    case "openSchedule":
      return { ...state, scheduling: action.task };
    case "scheduleFromEditor":
      return { ...state, editor: null, scheduling: action.task };
    case "openDelete":
      return { ...state, deleting: action.task };
    case "openCreateCheckpoint":
      return {
        ...state,
        checkpointEditor: { mode: "create", taskId: action.taskId, atDate: action.atDate },
      };
    case "openEditCheckpoint":
      return {
        ...state,
        checkpointEditor: { mode: "edit", checkpointId: action.checkpointId },
      };
    case "closeEditor":
      return { ...state, editor: null };
    case "closeSchedule":
      return { ...state, scheduling: null };
    case "closeDelete":
      return { ...state, deleting: null };
    case "closeCheckpoint":
      return { ...state, checkpointEditor: null };
  }
}

const CLOSED: DialogsState = {
  editor: null,
  scheduling: null,
  deleting: null,
  checkpointEditor: null,
};

/**
 * The tasks screen's overlay state (editor / schedule / delete-confirm) as one
 * reducer, so compound transitions (editor → schedule) are a single named
 * action instead of paired setStates in the shell.
 */
export function useTaskDialogs() {
  const [state, dispatch] = useReducer(reducer, CLOSED);
  return {
    editor: state.editor,
    scheduling: state.scheduling,
    deleting: state.deleting,
    checkpointEditor: state.checkpointEditor,
    openCreate: (boardId?: string, parentId?: string) =>
      dispatch({ type: "openCreate", boardId, parentId }),
    openEdit: (taskId: string) => dispatch({ type: "openEdit", taskId }),
    openSchedule: (task: TaskRow) => dispatch({ type: "openSchedule", task }),
    scheduleFromEditor: (task: TaskRow) => dispatch({ type: "scheduleFromEditor", task }),
    openDelete: (task: TaskRow) => dispatch({ type: "openDelete", task }),
    openCreateCheckpoint: (taskId: string, atDate?: string) =>
      dispatch({ type: "openCreateCheckpoint", taskId, atDate }),
    openEditCheckpoint: (checkpointId: string) =>
      dispatch({ type: "openEditCheckpoint", checkpointId }),
    closeEditor: () => dispatch({ type: "closeEditor" }),
    closeSchedule: () => dispatch({ type: "closeSchedule" }),
    closeDelete: () => dispatch({ type: "closeDelete" }),
    closeCheckpoint: () => dispatch({ type: "closeCheckpoint" }),
  };
}
