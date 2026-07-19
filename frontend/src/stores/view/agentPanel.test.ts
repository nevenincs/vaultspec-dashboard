// Agent-panel view-store tests (agentic-authoring-ux W02.P02.S09). Pure local
// chrome state — no wire. Covers the open/toggle lifecycle and the current-session
// pointer. The docked column's WIDTH lives in the shell-layout store now, so its
// clamp/persist coverage is in shellLayout.test.ts.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  closeAgentPanel,
  openAgentPanel,
  setAgentCurrentSession,
  setAgentTeamRun,
  scopedTeamRunId,
  teamRunScopeAction,
  toggleAgentPanel,
  useAgentPanel,
} from "./agentPanel";

function reset(): void {
  useAgentPanel.setState({
    open: false,
    currentSessionId: null,
    teamRunId: null,
    teamRunPrompt: null,
    teamRunScope: null,
  });
}

beforeEach(reset);
afterEach(reset);

describe("agent panel open lifecycle", () => {
  it("opens, closes, and toggles the docked panel", () => {
    expect(useAgentPanel.getState().open).toBe(false);
    openAgentPanel();
    expect(useAgentPanel.getState().open).toBe(true);
    // Opening again is an idempotent no-op.
    openAgentPanel();
    expect(useAgentPanel.getState().open).toBe(true);
    closeAgentPanel();
    expect(useAgentPanel.getState().open).toBe(false);
    toggleAgentPanel();
    expect(useAgentPanel.getState().open).toBe(true);
    toggleAgentPanel();
    expect(useAgentPanel.getState().open).toBe(false);
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
