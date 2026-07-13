// The add-project modal: a path-input prompt that registers a NEW project root
// (dashboard-workspace-registry). A browser cannot open a native folder dialog and
// the engine registers by an operator-supplied absolute path, so "add a project" is
// a typed path. Dumb `app/` chrome (dashboard-layer-ownership): it drives the stores
// `useAddWorkspace` mutation (the sole wire client), reads its draft through the
// chrome view seam, and never touches the engine client, the raw view store, or the
// raw `tiers` block. Reachable from the worktree dropdown's pinned item, the command
// palette, and the keymap under the one shared `left-rail:add-project` id.

import { useState } from "react";

import { useAddWorkspace } from "../../stores/server/queries";
import {
  resetAddProjectChrome,
  setAddProjectError,
  setAddProjectPath,
  useAddProjectChrome,
} from "../../stores/view/addProjectChrome";
import { Dialog } from "../chrome/Dialog";
import { FolderBrowser } from "./FolderBrowser";
import { Button } from "../kit";

/** A FRIENDLY, user-facing refusal — never the raw engine/git message (the UI must
 *  not surface internal errors). The thrown error's text is inspected only to pick
 *  the right friendly variant, never rendered. */
function addProjectErrorMessage(error: unknown): string {
  const raw = (
    typeof (error as { message?: unknown } | null)?.message === "string"
      ? (error as { message: string }).message
      : ""
  ).toLowerCase();
  if (
    /not a (readable )?directory|no such file|does not exist|readable directory/.test(
      raw,
    )
  ) {
    return "That folder couldn’t be found. Check the path and try again.";
  }
  if (/git|repository|worktree/.test(raw)) {
    return "That folder isn’t a git project. Pick a folder that contains a git repository.";
  }
  return "Couldn’t add that project. Make sure it’s a folder containing a git repository.";
}

export function AddProjectDialog() {
  const { open, path, error } = useAddProjectChrome();
  const { add, mutation } = useAddWorkspace();
  // Browse is widget-intrinsic, ephemeral UI (not a corpus filter or shared
  // dashboard intent): plain component state, reset for free each time the
  // dialog remounts (`Dialog` renders nothing while closed).
  const [browsing, setBrowsing] = useState(false);
  const [browsePath, setBrowsePath] = useState<string | undefined>(undefined);

  const submit = () => {
    const trimmed = path.trim();
    if (trimmed.length === 0) {
      setAddProjectError("Enter the absolute path to a project folder.");
      return;
    }
    setAddProjectError(null);
    void add(trimmed)
      .then(() => resetAddProjectChrome())
      .catch((err: unknown) => setAddProjectError(addProjectErrorMessage(err)));
  };

  return (
    <Dialog
      open={open}
      onClose={resetAddProjectChrome}
      title="Add a project"
      description="Point the dashboard at a project folder. The path is registered read-only — nothing on disk is created or modified."
    >
      <div className="flex flex-col gap-fg-3 px-fg-4 pt-fg-3 pb-fg-4">
        <label className="flex flex-col gap-fg-1 text-label text-ink-muted">
          Project folder
          <input
            type="text"
            value={path}
            onChange={(event) => setAddProjectPath(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="/absolute/path/to/project"
            aria-label="project folder path"
            spellCheck={false}
            className="rounded-fg-xs border border-rule bg-paper px-fg-2 py-fg-1 font-mono text-body text-ink outline-none focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          />
        </label>
        <button
          type="button"
          onClick={() => setBrowsing((prev) => !prev)}
          aria-expanded={browsing}
          className="self-start rounded-fg-xs text-label text-ink-muted underline-offset-2 transition-colors duration-ui-fast hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {browsing ? "Hide browser" : "Browse…"}
        </button>
        {browsing && (
          <FolderBrowser
            path={browsePath}
            onNavigate={setBrowsePath}
            onChoose={(chosen) => {
              setAddProjectPath(chosen);
              setBrowsing(false);
            }}
          />
        )}
        {error !== null && (
          <p role="alert" className="text-label text-state-broken">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-fg-2 border-t border-rule pt-fg-3">
          <Button variant="secondary" onClick={resetAddProjectChrome}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={mutation.isPending}>
            Add project
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
