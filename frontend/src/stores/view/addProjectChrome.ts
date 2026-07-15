import { useMemo } from "react";
import { create } from "zustand";
import { normalizeAddProjectIssue, type AddProjectIssue } from "../addProjectIssue";

// Add-project chrome state: modal visibility, the path draft, and validation
// feedback. The registration itself stays in stores/server (`useAddWorkspace`),
// the sole wire client. This mirrors `createDocChrome` exactly so the two modal
// surfaces read identically. Submission state stays local to the dialog, so this
// store owns only disclosure, path data, and a closed user-facing issue condition.
export const ADD_PROJECT_PATH_MAX_CHARS = 1024;

export interface AddProjectChromeState {
  open: boolean;
  path: string;
  issue: AddProjectIssue | null;
  toggleOpen: () => void;
  setPath: (path: unknown) => void;
  setIssue: (issue: unknown) => void;
  reset: () => void;
}

const RESET_STATE = {
  open: false,
  path: "",
  issue: null,
};

export function normalizeAddProjectPath(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.length <= ADD_PROJECT_PATH_MAX_CHARS
    ? value
    : value.slice(0, ADD_PROJECT_PATH_MAX_CHARS);
}

export interface AddProjectChromeView {
  open: boolean;
  path: string;
  issue: AddProjectIssue | null;
}

export function normalizeAddProjectChromeView(state: unknown): AddProjectChromeView {
  const value =
    state !== null && typeof state === "object"
      ? (state as Partial<Record<keyof AddProjectChromeView, unknown>>)
      : {};
  return {
    open: value.open === true,
    path: normalizeAddProjectPath(value.path),
    issue: normalizeAddProjectIssue(value.issue),
  };
}

export const useAddProjectChromeStore = create<AddProjectChromeState>((set) => ({
  ...RESET_STATE,
  toggleOpen: () =>
    set((state) =>
      state.open
        ? RESET_STATE
        : { ...normalizeAddProjectChromeView(state), open: true, issue: null },
    ),
  setPath: (path) => set({ path: normalizeAddProjectPath(path), issue: null }),
  setIssue: (issue) => set({ issue: normalizeAddProjectIssue(issue) }),
  reset: () => set(RESET_STATE),
}));

export function useAddProjectChrome(): AddProjectChromeView {
  // Select the RAW stable fields; derive the view in useMemo (stable-selectors) —
  // never inside the selector, even under useShallow.
  const open = useAddProjectChromeStore((state) => state.open);
  const path = useAddProjectChromeStore((state) => state.path);
  const issue = useAddProjectChromeStore((state) => state.issue);
  return useMemo(
    () => normalizeAddProjectChromeView({ open, path, issue }),
    [open, path, issue],
  );
}

export function toggleAddProjectDialog(): void {
  useAddProjectChromeStore.getState().toggleOpen();
}

/**
 * Open the add-project dialog from any surface (the worktree dropdown's pinned
 * item, the command palette, the keyboard). Idempotent-open: it never closes an
 * already-open dialog, so two surfaces racing to "add a project" converge on one
 * open dialog rather than toggling each other shut (mirrors `openCreateDocDialog`).
 */
export function openAddProjectDialog(): void {
  const store = useAddProjectChromeStore.getState();
  if (!store.open) store.toggleOpen();
}

export function setAddProjectPath(path: unknown): void {
  useAddProjectChromeStore.getState().setPath(path);
}

export function setAddProjectIssue(issue: unknown): void {
  useAddProjectChromeStore.getState().setIssue(issue);
}

export function resetAddProjectChrome(): void {
  useAddProjectChromeStore.getState().reset();
}
