import { beforeEach, describe, expect, it } from "vitest";

import {
  WORKTREE_SWITCH_ID_CAP,
  beginWorktreeSwitch,
  cancelWorktreeSwitch,
  completeWorktreeSwitch,
  failWorktreeSwitch,
  normalizeWorktreePickerActivationIntent,
  normalizeWorktreePickerBoolean,
  normalizeWorktreePickerChromeView,
  normalizeWorktreePickerSwitchId,
  normalizeWorktreePickerSwitchError,
  resetWorktreePickerChrome,
  setWorktreePickerExpanded,
  toggleWorktreePickerExpanded,
  useWorktreePickerChromeStore,
  worktreePickerFirstRowFocusTarget,
  worktreePickerListClassName,
  worktreePickerRowKeyboardTarget,
} from "./worktreePickerChrome";
import type { WorkspaceMapPickerRowView } from "../server/queries";

function row(id: string): WorkspaceMapPickerRowView {
  return {
    worktreeId: id,
    branch: id,
    hasVault: true,
    selectable: true,
    isActive: false,
    isPending: false,
    title: { key: "projects:workspaceIdentity.accessibility.choose" },
    ariaLabel: { key: "projects:workspaceIdentity.accessibility.choose" },
    nameLabel: id,
    defaultLabel: null,
    branchLabel: null,
    noVaultLabel: null,
    degradedTitle: { key: "projects:workspaceIdentity.labels.noProjectFiles" },
    isDegraded: false,
    pendingLabel: null,
    rowClassName: "row",
    activeCueClassName: "cue",
    branchClassName: "branch",
    badgeClassName: "badge",
    degradedIconClassName: "degraded",
    pendingLabelClassName: "pending",
  };
}

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

  it("normalizes malformed chrome reads before publishing or toggling", () => {
    useWorktreePickerChromeStore.setState({
      expanded: "true",
      keyboardToggle: "keyboard",
      pendingId: " scope-a ",
      switchError: { key: "projects:workspaceIdentity.states.switchFailed" },
    } as unknown as Partial<ReturnType<typeof useWorktreePickerChromeStore.getState>>);

    const view = normalizeWorktreePickerChromeView(
      useWorktreePickerChromeStore.getState(),
    );

    expect(view).toMatchObject({
      expanded: false,
      keyboardToggle: false,
      pendingId: "scope-a",
    });
    expect(view.switchError).toEqual({
      key: "projects:workspaceIdentity.states.switchFailed",
    });

    toggleWorktreePickerExpanded(true);
    expect(useWorktreePickerChromeStore.getState()).toMatchObject({
      expanded: true,
      keyboardToggle: true,
    });

    completeWorktreeSwitch("scope-a");
    expect(useWorktreePickerChromeStore.getState().pendingId).toBeNull();
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
      switchError: { key: "projects:workspaceIdentity.states.switchFailed" },
    });
  });

  it("normalizes pending switch ids at the chrome store boundary", () => {
    expect(normalizeWorktreePickerSwitchId("  scope-a  ")).toBe("scope-a");
    expect(normalizeWorktreePickerSwitchId("   ")).toBeNull();
    expect(normalizeWorktreePickerSwitchId(null)).toBeNull();
    expect(
      normalizeWorktreePickerSwitchId("s".repeat(WORKTREE_SWITCH_ID_CAP + 1)),
    ).toBeNull();
    expect(normalizeWorktreePickerSwitchError("failed")).toBeNull();
    expect(normalizeWorktreePickerSwitchError("  failed  ")).toBeNull();
    expect(normalizeWorktreePickerSwitchError("   ")).toBeNull();

    beginWorktreeSwitch("  scope-a  ");
    expect(useWorktreePickerChromeStore.getState().pendingId).toBe("scope-a");

    completeWorktreeSwitch(" scope-a ");
    expect(useWorktreePickerChromeStore.getState().pendingId).toBeNull();

    beginWorktreeSwitch("scope-b");
    failWorktreeSwitch(" scope-b ", "branch-b", "selection-rejected");
    expect(useWorktreePickerChromeStore.getState()).toMatchObject({
      pendingId: null,
      switchError: { key: "projects:workspaceIdentity.states.switchFailed" },
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

    useWorktreePickerChromeStore.getState().failSwitch(" scope-c ", {
      key: "projects:workspaceIdentity.states.switchFailed",
    });
    expect(useWorktreePickerChromeStore.getState()).toMatchObject({
      pendingId: null,
      switchError: { key: "projects:workspaceIdentity.states.switchFailed" },
    });
  });

  it("normalizes selectable worktree activation rows at the view seam", () => {
    expect(
      normalizeWorktreePickerActivationIntent({
        selectable: true,
        worktreeId: " scope-a ",
        branch: " feature/a ",
      }),
    ).toEqual({ id: "scope-a", branch: " feature/a " });
    expect(
      normalizeWorktreePickerActivationIntent({
        selectable: false,
        worktreeId: "scope-a",
        branch: "feature/a",
      }),
    ).toBeNull();
    expect(
      normalizeWorktreePickerActivationIntent({
        selectable: true,
        worktreeId: "   ",
        branch: "feature/a",
      }),
    ).toBeNull();
    expect(
      normalizeWorktreePickerActivationIntent({
        selectable: true,
        worktreeId: "s".repeat(WORKTREE_SWITCH_ID_CAP + 1),
        branch: "feature/a",
      }),
    ).toBeNull();
    expect(
      normalizeWorktreePickerActivationIntent({
        selectable: true,
        worktreeId: null,
        branch: null,
      }),
    ).toBeNull();
  });

  it("accepts only the localized switch failure descriptor", () => {
    const switchFailed = { key: "projects:workspaceIdentity.states.switchFailed" };
    expect(normalizeWorktreePickerSwitchError(switchFailed)).toEqual(switchFailed);
    expect(normalizeWorktreePickerSwitchError("internal failure")).toBeNull();
    beginWorktreeSwitch("scope-long");
    useWorktreePickerChromeStore.getState().failSwitch("scope-long", switchFailed);
    expect(useWorktreePickerChromeStore.getState().switchError).toEqual(switchFailed);
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

  it("projects disclosure list and switch-error chrome behind the seam", () => {
    expect(worktreePickerListClassName(true)).toBe("mt-fg-1 space-y-fg-0-5");
    expect(worktreePickerListClassName(false)).toBe(
      "mt-fg-1 space-y-fg-0-5 animate-slide-in-down",
    );
  });

  it("projects keyboard row focus targets behind the picker seam", () => {
    const rows = [row("scope-a"), row("scope-b"), row("scope-c")];

    expect(worktreePickerFirstRowFocusTarget(rows)).toBe("scope-a");
    expect(worktreePickerRowKeyboardTarget(rows, 0, "ArrowDown")).toBe("scope-b");
    expect(worktreePickerRowKeyboardTarget(rows, 1, "ArrowUp")).toBe("scope-a");
    expect(worktreePickerRowKeyboardTarget(rows, 0, "ArrowUp")).toBe("scope-a");
    expect(worktreePickerRowKeyboardTarget(rows, 2, "ArrowDown")).toBe("scope-c");
  });

  it("keeps malformed keyboard row targets inert", () => {
    const rows = [row(" scope-a "), row("scope-b")];

    expect(worktreePickerFirstRowFocusTarget([])).toBeNull();
    expect(worktreePickerFirstRowFocusTarget(rows)).toBe("scope-a");
    expect(worktreePickerRowKeyboardTarget(rows, 0, "Enter")).toBeNull();
    expect(worktreePickerRowKeyboardTarget(rows, 0.5, "ArrowDown")).toBeNull();
    expect(worktreePickerRowKeyboardTarget(rows, "0", "ArrowDown")).toBeNull();
    expect(worktreePickerRowKeyboardTarget([], 0, "ArrowDown")).toBeNull();
  });
});
