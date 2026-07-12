// The SPA's first-run onboarding empty state (single-app-runtime ADR D4). A
// fresh install boots the engine over an engine-owned bootstrap corpus with an
// EMPTY workspace registry (`GET /workspaces` -> `data.workspaces: []`,
// `active_workspace: null`) — that empty-registry condition is the ONLY
// first-run signal, never guessed from scope or tiers. This surface takes
// over the WHOLE shell (mounted as `AppShell`'s alternate top-level branch,
// mirroring the compact/desktop split) instead of overlaying the normal graph
// chrome — there is no real project to show underneath yet.
//
// Split like `ProvisionPanel`: `resolveFirstRunOnboardingState` is a pure
// function (unit-tested wire-free), `FirstRunOnboardingBody` is a dumb
// props-driven presentation, and `FirstRunOnboarding` is the thin wired
// wrapper that reads the workspaces query. Registration reuses the EXISTING
// add-project flow verbatim — firing the shared `project:open` action
// descriptor, which opens `AddProjectDialog` (`useAddWorkspace`, the sole wire
// client for the registry's `add_workspace` write seam). That hook already
// warms and SELECTS the newly-registered root exactly like a launch root
// (dashboard-workspace-registry ADR), so once registration succeeds the
// registry refetches, this signal clears, and the normal shell takes over —
// no bespoke registration handler is authored here.

import { useMemo } from "react";

import { FolderPlus } from "lucide-react";

import type { WorkspacesState } from "../../stores/server/engine";
import { useWorkspaces } from "../../stores/server/queries";
import { openProjectAction } from "../../stores/view/projectActions";
import { AddProjectDialog } from "../left/AddProjectDialog";
import { Button } from "../kit";

export type FirstRunOnboardingState = { kind: "hidden" } | { kind: "onboarding" };

/** Pure resolver: the empty-registry condition is the ONLY first-run signal.
 *  A read failure or an in-flight fetch both stay hidden so the normal shell's
 *  own loading/error handling shows through instead of a false first-run
 *  flash while the registry is still resolving. */
export function resolveFirstRunOnboardingState(inputs: {
  isPending: boolean;
  isError: boolean;
  data: WorkspacesState | undefined;
}): FirstRunOnboardingState {
  if (inputs.isPending || inputs.isError || inputs.data === undefined) {
    return { kind: "hidden" };
  }
  return inputs.data.workspaces.length === 0
    ? { kind: "onboarding" }
    : { kind: "hidden" };
}

/** The ONE resolved-state read, mirroring `useProvisionPanelState`: wraps
 *  `useWorkspaces` + `resolveFirstRunOnboardingState` behind a single hook,
 *  memoized on the raw query fields (frontend-store-selectors). */
export function useFirstRunOnboardingState(): FirstRunOnboardingState {
  const { isPending, isError, data } = useWorkspaces();
  return useMemo(
    () => resolveFirstRunOnboardingState({ isPending, isError, data }),
    [isPending, isError, data],
  );
}

/** Dumb, props-driven presentation (unit-tested wire-free): the welcome card
 *  that explains no project is connected yet and hands off to the shared
 *  add-project affordance. */
export function FirstRunOnboardingBody({ onAddProject }: { onAddProject: () => void }) {
  return (
    <div className="flex h-screen min-h-0 w-screen items-center justify-center bg-paper px-fg-4 text-center">
      <div className="flex max-w-[28rem] flex-col items-center gap-fg-3">
        <FolderPlus aria-hidden size={32} className="shrink-0 text-ink-faint" />
        <h1 className="text-title font-medium text-ink">Welcome to vaultspec</h1>
        <p className="text-body text-ink-muted">
          No project is connected yet. Add a project folder to get started — the path is
          registered read-only, so nothing on disk is created or modified.
        </p>
        <Button variant="primary" onClick={onAddProject}>
          Add your first project
        </Button>
      </div>
    </div>
  );
}

/** The wired surface: mounted once at the shell top as `AppShell`'s alternate
 *  top-level branch. Renders null the instant the registry holds at least one
 *  root, so the normal shell takes over without a reload. Mounts
 *  `AddProjectDialog` itself since the normal shell's own instance is absent
 *  on this branch. */
export function FirstRunOnboarding() {
  const state = useFirstRunOnboardingState();
  if (state.kind === "hidden") return null;
  return (
    <>
      <FirstRunOnboardingBody onAddProject={() => openProjectAction().run?.()} />
      <AddProjectDialog />
    </>
  );
}
