import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

// Add-project chrome state: modal visibility, the path draft, and validation
// feedback. The registration itself stays in stores/server (`useAddWorkspace`),
// the sole wire client. This mirrors `createDocChrome` exactly so the two modal
// surfaces read identically. Mutation pending is read from the add hook, not held
// here, so this store owns only the disclosure + draft.
export const ADD_PROJECT_PATH_MAX_CHARS = 1024;
export const ADD_PROJECT_ERROR_MAX_CHARS = 1024;

export interface AddProjectChromeState {
  open: boolean;
  path: string;
  error: string | null;
  toggleOpen: () => void;
  setPath: (path: unknown) => void;
  setError: (error: unknown) => void;
  reset: () => void;
}

const RESET_STATE = {
  open: false,
  path: "",
  error: null,
};

export function normalizeAddProjectPath(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.length <= ADD_PROJECT_PATH_MAX_CHARS
    ? value
    : value.slice(0, ADD_PROJECT_PATH_MAX_CHARS);
}

export function normalizeAddProjectError(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized =
    value.length <= ADD_PROJECT_ERROR_MAX_CHARS
      ? value
      : value.slice(0, ADD_PROJECT_ERROR_MAX_CHARS);
  return normalized.trim().length > 0 ? normalized : null;
}

export interface AddProjectChromeView {
  open: boolean;
  path: string;
  error: string | null;
}

export function normalizeAddProjectChromeView(state: unknown): AddProjectChromeView {
  const value =
    state !== null && typeof state === "object"
      ? (state as Partial<Record<keyof AddProjectChromeView, unknown>>)
      : {};
  return {
    open: value.open === true,
    path: normalizeAddProjectPath(value.path),
    error: normalizeAddProjectError(value.error),
  };
}

export const useAddProjectChromeStore = create<AddProjectChromeState>((set) => ({
  ...RESET_STATE,
  toggleOpen: () =>
    set((state) =>
      state.open
        ? RESET_STATE
        : { ...normalizeAddProjectChromeView(state), open: true, error: null },
    ),
  setPath: (path) => set({ path: normalizeAddProjectPath(path), error: null }),
  setError: (error) => set({ error: normalizeAddProjectError(error) }),
  reset: () => set(RESET_STATE),
}));

export function useAddProjectChrome(): AddProjectChromeView {
  return useAddProjectChromeStore(
    useShallow((state) => normalizeAddProjectChromeView(state)),
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

export function setAddProjectError(error: unknown): void {
  useAddProjectChromeStore.getState().setError(error);
}

export function resetAddProjectChrome(): void {
  useAddProjectChromeStore.getState().reset();
}
