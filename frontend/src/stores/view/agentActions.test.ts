// Agent ActionDescriptor + seam tests (agentic-authoring-ux W02.P02.S11). Pure
// logic over the shared builders and imperative seams — the wire is exercised only
// where a mutation is asserted (a spied client method + a preset session token, no
// mocked engine transport otherwise).

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { queryClient } from "../server/queryClient";
import { setActorToken } from "../server/authoring";
import { useAgentPanel } from "./agentPanel";
import {
  AGENT_NEW_SESSION_ACTION_ID,
  AGENT_TOGGLE_PANEL_ACTION_ID,
  agentNewSessionAction,
  agentTogglePanelAction,
  deriveAgentKeybindings,
  hasStoppableAgentRun,
  stopActiveAgentRun,
} from "./agentActions";

function resetPanel(): void {
  useAgentPanel.setState({ open: false, currentSessionId: null });
}

beforeEach(() => {
  resetPanel();
  queryClient.clear();
  setActorToken(null);
});

afterEach(() => {
  resetPanel();
  queryClient.clear();
  setActorToken(null);
});

describe("agent:toggle-panel descriptor", () => {
  it("toggles the panel and labels reflect the resulting state", () => {
    expect(useAgentPanel.getState().open).toBe(false);
    const closed = agentTogglePanelAction();
    expect(closed.id).toBe(AGENT_TOGGLE_PANEL_ACTION_ID);
    expect(closed.label).toEqual({ key: "common:agent.actions.openPanel" });

    closed.run?.();
    expect(useAgentPanel.getState().open).toBe(true);

    // Built again while open: the label now names the close action.
    expect(agentTogglePanelAction().label).toEqual({
      key: "common:agent.actions.closePanel",
    });
  });
});

describe("agent:new-session descriptor", () => {
  it("clears the current session (a blank composer) and opens the panel", () => {
    useAgentPanel.setState({ open: false, currentSessionId: "session:old" });
    const action = agentNewSessionAction();
    expect(action.id).toBe(AGENT_NEW_SESSION_ACTION_ID);

    action.run?.();
    expect(useAgentPanel.getState().currentSessionId).toBeNull();
    expect(useAgentPanel.getState().open).toBe(true);
  });
});

describe("agent:stop-run descriptor + seam", () => {
  it("is not stoppable and is a no-op when no active run is cached", async () => {
    expect(hasStoppableAgentRun()).toBe(false);
    await stopActiveAgentRun();
    expect(useAgentPanel.getState().currentSessionId).toBeNull();
  });
});

describe("agent keybindings", () => {
  it("binds Mod+Alt+A to the toggle-panel id in the global context (and nothing else)", () => {
    const defs = deriveAgentKeybindings();
    expect(defs).toHaveLength(1);
    expect(defs[0]!.id).toBe(AGENT_TOGGLE_PANEL_ACTION_ID);
    expect(defs[0]!.defaultChord).toBe("Mod+Alt+A");
    expect(defs[0]!.context).toBe("global");
  });
});
