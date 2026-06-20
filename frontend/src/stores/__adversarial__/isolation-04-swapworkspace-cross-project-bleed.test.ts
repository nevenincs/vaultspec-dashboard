// Adversarial — LENS: scope/workspace isolation; the 018/022/023 cross-scope
// state-corruption class, WIDENED to the workspace level (dashboard-workspace-
// registry ADR).
//
// SUSPECT (PRIME): the workspace switch is the COARSEST scope change — a whole
// different project, its own repository and vault. The ADR is explicit: a
// workspace swap must perform the full 022 wholesale reset PLUS re-key the
// pin/lens stores to the NEW WORKSPACE (a worktree swap preserves the workspace
// key; a workspace swap must not, or the prior project's pins/lenses bleed in).
// The reset lives in the stores layer (`viewStore.swapWorkspace`), invoked by
// the WorkspacePicker control.
//
// CONSEQUENCE if the reset is too narrow (the bug this guards): project A is
// active, the user pins node "a:pinned" and saves a lens under workspace A; they
// switch to project B. If swapWorkspace only flipped `scope` (like setScope) and
// left the pin/lens WORKSPACE key at A, then project A's pins and lenses would
// be presented as the active membership on project B's stage — and the next
// togglePin/saveLens under B would persist A's stale state merged with B's new
// state under B's key. That is the exact cross-project corruption the
// per-workspace keying exists to prevent.
//
// CONTRACT-CORRECT behavior asserted here: after the documented workspace swap,
// (1) the view store reset everything scoped to the prior project, and (2) the
// pin AND lens stores are re-keyed to the NEW WORKSPACE so the prior project's
// pins/lenses are no longer the active membership.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useLensStore } from "../view/lenses";
import { usePinStore } from "../view/pins";
import { useViewStore } from "../view/viewStore";

const WS_A = "/project-a/.git";
const WS_B = "/project-b/.git";

describe("swapWorkspace must not leave the prior project's pins/lenses active (022 widened)", () => {
  beforeEach(() => {
    // Start clean: view store at project A's scope; pin + lens stores keyed to
    // WORKSPACE A.
    useViewStore.setState({
      scope: "/project-a/main",
      workingSet: [],
      openedIds: [],
      selection: null,
    });
    usePinStore.setState({ pinnedIds: [], workspace: WS_A, scope: "/project-a/main" });
    useLensStore.setState({ saved: [], workspace: WS_A, scope: "/project-a/main" });
  });

  afterEach(() => {
    useViewStore.setState({
      scope: null,
      workingSet: [],
      openedIds: [],
      selection: null,
    });
    usePinStore.setState({ pinnedIds: [], workspace: "default", scope: "default" });
    useLensStore.setState({ saved: [], workspace: "default", scope: "default" });
  });

  it("re-keys pins AND lenses to the NEW WORKSPACE on a workspace swap", () => {
    // Project A: pin a node and save a lens; the stores record them under
    // workspace A.
    usePinStore.getState().togglePin("a:pinned");
    expect(usePinStore.getState().pinnedIds).toEqual(["a:pinned"]);
    expect(usePinStore.getState().workspace).toBe(WS_A);
    expect(useLensStore.getState().workspace).toBe(WS_A);

    // Dirty some per-scope view state too, so we can prove the wholesale reset.
    useViewStore.getState().addToWorkingSet("a:node");
    useViewStore
      .getState()
      .selectEntity({ kind: "event", id: "evt:a", nodeIds: ["a:node"] });
    expect(useViewStore.getState().workingSet).toEqual(["a:node"]);

    // The documented WORKSPACE swap to project B.
    useViewStore.getState().swapWorkspace(WS_B, "/project-b/main");

    // (1) The view store reset everything scoped to project A.
    expect(useViewStore.getState().scope).toBe("/project-b/main");
    expect(useViewStore.getState().workingSet).toEqual([]);
    expect(useViewStore.getState().selection).toBeNull();
    expect(useViewStore.getState().activeFolder).toBeNull();
    expect(useViewStore.getState().featureContexts).toEqual([]);

    // (2) The pin AND lens stores re-keyed to WORKSPACE B (the load-bearing
    // widening vs setScope), so project A's pins/lenses are no longer active.
    expect(usePinStore.getState().workspace).toBe(WS_B);
    expect(useLensStore.getState().workspace).toBe(WS_B);
    expect(usePinStore.getState().isPinned("a:pinned")).toBe(false);
    expect(usePinStore.getState().pinnedIds).not.toContain("a:pinned");
  });

  it("a pin made under project B persists under B's key, never merged with A's", () => {
    // Project A pins, then swap to B and pin a different node under B.
    usePinStore.getState().togglePin("a:pinned");
    useViewStore.getState().swapWorkspace(WS_B, "/project-b/main");
    usePinStore.getState().togglePin("b:pinned");

    // B's active membership is ONLY B's pin — A's pin did not ride across.
    expect(usePinStore.getState().workspace).toBe(WS_B);
    expect(usePinStore.getState().pinnedIds).toEqual(["b:pinned"]);
    expect(usePinStore.getState().isPinned("a:pinned")).toBe(false);
  });
});
