// Agent-panel view-store tests (agentic-authoring-ux W02.P02.S09). Pure local
// chrome state — no wire. Covers the open/toggle lifecycle and the current-session
// pointer. The docked column's WIDTH lives in the shell-layout store now, so its
// clamp/persist coverage is in shellLayout.test.ts.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  closeAgentPanel,
  openAgentPanel,
  setAgentCurrentSession,
  toggleAgentPanel,
  useAgentPanel,
} from "./agentPanel";

function reset(): void {
  useAgentPanel.setState({
    open: false,
    currentSessionId: null,
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

describe("current session pointer", () => {
  it("sets and clears the current session id", () => {
    expect(useAgentPanel.getState().currentSessionId).toBeNull();
    setAgentCurrentSession("session:abc");
    expect(useAgentPanel.getState().currentSessionId).toBe("session:abc");
    setAgentCurrentSession(null);
    expect(useAgentPanel.getState().currentSessionId).toBeNull();
  });
});
