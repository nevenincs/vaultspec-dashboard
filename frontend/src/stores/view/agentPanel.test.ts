// Agent-panel view-store tests. Pure local chrome state — no wire. Covers the
// open/toggle lifecycle (which is the CENTER SLOT verb now, not a second open flag)
// and the current-session pointer. The panel has no width of its own any more — the
// dock owns its geometry — so there is no width clamp to cover here.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  closeAgentPanel,
  openAgentPanel,
  setAgentCurrentSession,
  setAgentPanelView,
  setAgentTeamRun,
  scopedTeamRunId,
  teamRunScopeAction,
  toggleAgentPanel,
  useAgentPanel,
} from "./agentPanel";
import { getShellCenterSlot, setShellCenterSlot } from "./shellLayout";

function reset(): void {
  setShellCenterSlot("none");
  useAgentPanel.setState({
    panelView: "transcript",
    currentSessionId: null,
    teamRunId: null,
    teamRunPrompt: null,
    teamRunScope: null,
  });
}

beforeEach(reset);
afterEach(reset);

describe("agent panel open lifecycle", () => {
  it("opens, closes, and toggles by taking and yielding the center slot", () => {
    expect(getShellCenterSlot()).toBe("none");
    openAgentPanel();
    expect(getShellCenterSlot()).toBe("agent");
    // Opening again is an idempotent no-op.
    openAgentPanel();
    expect(getShellCenterSlot()).toBe("agent");
    closeAgentPanel();
    expect(getShellCenterSlot()).toBe("none");
    toggleAgentPanel();
    expect(getShellCenterSlot()).toBe("agent");
    toggleAgentPanel();
    expect(getShellCenterSlot()).toBe("none");
  });

  it("displaces the graph when opened, and never hides it when closed", () => {
    setShellCenterSlot("graph");
    openAgentPanel();
    expect(getShellCenterSlot()).toBe("agent");

    // Closing the panel while the GRAPH holds the slot must not empty the slot:
    // closing a panel that is not open is a no-op, not a hide of its replacement.
    setShellCenterSlot("graph");
    closeAgentPanel();
    expect(getShellCenterSlot()).toBe("graph");
  });

  it("opens straight into a targeted view and leaves the view alone otherwise", () => {
    openAgentPanel({ view: "pending" });
    expect(getShellCenterSlot()).toBe("agent");
    expect(useAgentPanel.getState().panelView).toBe("pending");

    setShellCenterSlot("none");
    openAgentPanel();
    expect(useAgentPanel.getState().panelView).toBe("pending");

    setAgentPanelView("transcript");
    expect(useAgentPanel.getState().panelView).toBe("transcript");
  });
});

describe("team-run viewing binding", () => {
  it("stores nullable recovered prompts with their owning scope", () => {
    setAgentTeamRun({ runId: "run-a", prompt: null, scope: "Y:/workspace-a" });
    expect(useAgentPanel.getState()).toMatchObject({
      teamRunId: "run-a",
      teamRunPrompt: null,
      teamRunScope: "Y:/workspace-a",
    });
  });

  it("clears a cross-scope binding and never guesses while scope is unresolved", () => {
    expect(teamRunScopeAction("run-a", "Y:/workspace-a", "Y:/workspace-b")).toBe(
      "clear",
    );
    expect(teamRunScopeAction("run-a", null, "Y:/workspace-a")).toBe("clear");
    expect(teamRunScopeAction("run-a", "Y:/workspace-a", null)).toBe("keep");
    expect(scopedTeamRunId("run-a", "Y:/workspace-a", "Y:/workspace-b")).toBeNull();
    expect(scopedTeamRunId("run-a", "Y:/workspace-a", "Y:/workspace-a")).toBe("run-a");
  });
});

describe("current session pointer", () => {
  it("sets and clears the current session id", () => {
    expect(useAgentPanel.getState().currentSessionId).toBeNull();
    setAgentCurrentSession("session:abc");
    expect(useAgentPanel.getState().currentSessionId).toBe("session:abc");
    setAgentCurrentSession(null);
    expect(useAgentPanel.getState().currentSessionId).toBeNull();
  });
});
