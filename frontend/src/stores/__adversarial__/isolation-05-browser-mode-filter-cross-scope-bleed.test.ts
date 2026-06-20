// Adversarial — LENS: per-scope browser-mode isolation; the 022 cross-scope
// state-corruption class, applied to the per-scope rail state the
// dashboard-left-rail campaign introduces.
//
// SUSPECT (PRIME): the rail's browser mode (vault | code) is PER-SCOPE
// view-local state. The left-rail ADR is explicit that the mode is "view-local
// state re-keyed per scope so it does not bleed across a swap" and warns directly
// that "a new piece of per-scope rail state not wired into setScope's reset would
// silently reintroduce cross-scope bleed; the existing isolation tests guard
// worktree swaps and must be extended". This test IS that extension.
//
// CONSEQUENCE if the reset omits the browser-mode store (the bug this guards):
// an operator on scope A switches the browser to CODE mode; they switch to a
// worktree B that is a vault-only / non-source corpus, or to a whole new project
// C. If setScope / swapWorkspace did not reset the browser-mode store, scope B/C
// would open in CODE mode against a foreign corpus. That is the exact cross-scope
// residue the wholesale reset exists to prevent.
//
// CONTRACT-CORRECT behavior asserted here: after BOTH a worktree swap
// (`setScope`) AND a workspace swap (`swapWorkspace`), the browser mode is back
// to the default (vault). Filter text is canonical dashboard-state and is tested
// at that layer.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useBrowserModeStore } from "../view/browserMode";
import { useViewStore } from "../view/viewStore";

describe("setScope/swapWorkspace must reset the per-scope browser mode (022)", () => {
  beforeEach(() => {
    useViewStore.setState({ scope: "/project-a/main" });
    useBrowserModeStore.getState().resetForScope();
  });

  afterEach(() => {
    useViewStore.setState({ scope: null });
    useBrowserModeStore.getState().resetForScope();
  });

  it("a WORKTREE swap (setScope) clears a stale code mode", () => {
    // Scope A: drive the rail into code mode.
    useBrowserModeStore.getState().setMode("code");
    expect(useBrowserModeStore.getState().mode).toBe("code");

    // Swap to a different worktree — the wholesale reset must clear the mode.
    useViewStore.getState().setScope("/project-a/feature-x");

    expect(useViewStore.getState().scope).toBe("/project-a/feature-x");
    expect(useBrowserModeStore.getState().mode).toBe("vault");
  });

  it("a WORKSPACE swap (swapWorkspace) clears a stale code mode", () => {
    // Project A: code mode, then switch to a whole different project B.
    useBrowserModeStore.getState().setMode("code");

    useViewStore.getState().swapWorkspace("/project-b/.git", "/project-b/main");

    // The coarser workspace swap must clear at least as much as a worktree swap.
    expect(useViewStore.getState().scope).toBe("/project-b/main");
    expect(useBrowserModeStore.getState().mode).toBe("vault");
  });
});
