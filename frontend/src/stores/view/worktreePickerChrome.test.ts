import { beforeEach, describe, expect, it } from "vitest";

import {
  WORKTREE_SWITCH_ERROR_CAP,
  WORKTREE_SWITCH_ID_CAP,
  WORKTREE_SWITCH_LABEL_CAP,
  beginWorktreeSwitch,
  cancelWorktreeSwitch,
  completeWorktreeSwitch,
  failWorktreeSwitch,
  normalizeWorktreePickerActivationIntent,
  normalizeWorktreePickerBoolean,
  normalizeWorktreePickerSwitchId,
  normalizeWorktreePickerSwitchError,
  normalizeWorktreePickerSwitchLabel,
  resetWorktreePickerChrome,
  setWorktreePickerExpanded,
  toggleWorktreePickerExpanded,
  useWorktreePickerChromeStore,
  worktreePickerListClassName,
  worktreeSwitchFailureMessage,
} from "./worktreePickerChrome";

describe("worktree picker chrome store", () => {
  beforeEach(() => resetWorktreePickerChrome());

  it("owns disclosure chrome behind named helpers", () => {
    setWorktreePickerExpanded(true, false);
    expect(useWorktreePickerChromeStore.getState()).toMatchObject({
      expanded: true,
      keyboardToggle: false,
    });

    toggleWorktreePickerExpanded(true);
    expect(useWorktreePickerChromeStore.getState()).toMatchObject({
      expanded: false,
      keyboardToggle: true,
    });
  });

  it("normalizes disclosure chrome input at the store boundary", () => {
    expect(normalizeWorktreePickerBoolean(true)).toBe(true);
    expect(normalizeWorktreePickerBoolean("true")).toBeNull();

    setWorktreePickerExpanded(true, false);
    setWorktreePickerExpanded("false", true);
    expect(useWorktreePickerChromeStore.getState()).toMatchObject({
      expanded: true,
      keyboardToggle: false,
    });

    toggleWorktreePickerExpanded("keyboard");
    expect(useWorktreePickerChromeStore.getState()).toMatchObject({
      expanded: false,
      keyboardToggle: false,
    });
  });

  it("keeps pending switch feedback identity-scoped", () => {
    beginWorktreeSwitch("scope-a");
    beginWorktreeSwitch("scope-b");

    failWorktreeSwitch("scope-a", "old", "persist-failed");
    expect(useWorktreePickerChromeStore.getState()).toMatchObject({
      pendingId: "scope-b",
      switchError: null,
    });

    failWorktreeSwitch("scope-b", "current", "persist-failed");
    expect(useWorktreePickerChromeStore.getState()).toMatchObject({
      pendingId: null,
      switchError: "could not persist the worktree switch",
    });
  });

  it("normalizes pending switch ids at the chrome store boundary", () => {
    expect(normalizeWorktreePickerSwitchId("  scope-a  ")).toBe("scope-a");
    expect(normalizeWorktreePickerSwitchId("   ")).toBeNull();
    expect(normalizeWorktreePickerSwitchId(null)).toBeNull();
    expect(normalizeWorktreePickerSwitchId("s".repeat(WORKTREE_SWITCH_ID_CAP + 1))).toBeNull();
    expect(normalizeWorktreePickerSwitchError("failed")).toBe("failed");
    expect(normalizeWorktreePickerSwitchError("  failed  ")).toBe("failed");
    expect(normalizeWorktreePickerSwitchError("   ")).toBeNull();

    beginWorktreeSwitch("  scope-a  ");
    expect(useWorktreePickerChromeStore.getState().pendingId).toBe("scope-a");

    completeWorktreeSwitch(" scope-a ");
    expect(useWorktreePickerChromeStore.getState().pendingId).toBeNull();

    beginWorktreeSwitch("scope-b");
    failWorktreeSwitch(" scope-b ", "branch-b", "selection-rejected");
    expect(useWorktreePickerChromeStore.getState()).toMatchObject({
      pendingId: null,
      switchError: "could not switch to branch-b - selection not saved",
    });

    resetWorktreePickerChrome();
    beginWorktreeSwitch("   ");
    expect(useWorktreePickerChromeStore.getState().pendingId).toBeNull();

    beginWorktreeSwitch(null);
    expect(useWorktreePickerChromeStore.getState().pendingId).toBeNull();

    beginWorktreeSwitch("s".repeat(WORKTREE_SWITCH_ID_CAP + 1));
    expect(useWorktreePickerChromeStore.getState().pendingId).toBeNull();

    beginWorktreeSwitch("scope-c");
    useWorktreePickerChromeStore.getState().failSwitch("scope-c", null);
    expect(useWorktreePickerChromeStore.getState()).toMatchObject({
      pendingId: "scope-c",
      switchError: null,
    });

    useWorktreePickerChromeStore.getState().failSwitch(" scope-c ", "  failed  ");
    expect(useWorktreePickerChromeStore.getState()).toMatchObject({
      pendingId: null,
      switchError: "failed",
    });
  });

  it("normalizes selectable worktree activation rows at the view seam", () => {
    expect(
      normalizeWorktreePickerActivationIntent({
        selectable: true,
        worktree: { id: " scope-a ", branch: " feature/a " },
      }),
    ).toEqual({ id: "scope-a", branch: " feature/a " });
    expect(
      normalizeWorktreePickerActivationIntent({
        selectable: false,
        worktree: { id: "scope-a", branch: "feature/a" },
      }),
    ).toBeNull();
    expect(
      normalizeWorktreePickerActivationIntent({
        selectable: true,
        worktree: { id: "   ", branch: "feature/a" },
      }),
    ).toBeNull();
    expect(
      normalizeWorktreePickerActivationIntent({
        selectable: true,
        worktree: {
          id: "s".repeat(WORKTREE_SWITCH_ID_CAP + 1),
          branch: "feature/a",
        },
      }),
    ).toBeNull();
    expect(
      normalizeWorktreePickerActivationIntent({
        selectable: true,
        worktree: null,
      }),
    ).toBeNull();
  });

  it("bounds switch error and branch-label text at the chrome boundary", () => {
    const longError = "x".repeat(WORKTREE_SWITCH_ERROR_CAP + 10);
    const normalizedError = normalizeWorktreePickerSwitchError(` ${longError} `);
    expect(normalizedError).toHaveLength(WORKTREE_SWITCH_ERROR_CAP);
    expect(normalizedError?.endsWith("…")).toBe(true);

    const longBranch = "feature/".concat("x".repeat(WORKTREE_SWITCH_LABEL_CAP + 10));
    const normalizedLabel = normalizeWorktreePickerSwitchLabel(longBranch);
    expect(normalizedLabel).toHaveLength(WORKTREE_SWITCH_LABEL_CAP);
    expect(normalizedLabel?.endsWith("…")).toBe(true);

    beginWorktreeSwitch("scope-long");
    useWorktreePickerChromeStore.getState().failSwitch("scope-long", longError);
    expect(useWorktreePickerChromeStore.getState().switchError).toBe(normalizedError);
    expect(worktreeSwitchFailureMessage(longBranch, "selection-rejected")).toContain(
      normalizedLabel,
    );
  });

  it("clears only the matching pending switch on completion or cancellation", () => {
    beginWorktreeSwitch("scope-a");
    completeWorktreeSwitch("scope-b");
    expect(useWorktreePickerChromeStore.getState().pendingId).toBe("scope-a");

    completeWorktreeSwitch("scope-a");
    expect(useWorktreePickerChromeStore.getState().pendingId).toBeNull();

    beginWorktreeSwitch("scope-c");
    cancelWorktreeSwitch("scope-d");
    expect(useWorktreePickerChromeStore.getState().pendingId).toBe("scope-c");

    cancelWorktreeSwitch("scope-c");
    expect(useWorktreePickerChromeStore.getState().pendingId).toBeNull();
  });

  it("projects switch failure copy behind the chrome seam", () => {
    expect(worktreeSwitchFailureMessage("feature/local", "selection-rejected")).toBe(
      "could not switch to feature/local - selection not saved",
    );
    expect(
      worktreeSwitchFailureMessage("  feature/local  ", "selection-rejected"),
    ).toBe("could not switch to feature/local - selection not saved");
    expect(worktreeSwitchFailureMessage("feature/local", "persist-failed")).toBe(
      "could not persist the worktree switch",
    );
    expect(worktreeSwitchFailureMessage(null, "selection-rejected")).toBe(
      "could not switch to worktree - selection not saved",
    );
  });

  it("projects disclosure list and switch-error chrome behind the seam", () => {
    expect(worktreePickerListClassName(true)).toBe("mt-fg-1 space-y-fg-0-5");
    expect(worktreePickerListClassName(false)).toBe(
      "mt-fg-1 space-y-fg-0-5 animate-slide-in-down",
    );
  });
});
