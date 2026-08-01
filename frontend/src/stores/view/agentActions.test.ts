// Agent ActionDescriptor + seam tests. Pure
// logic over the shared builders and imperative seams — the wire is exercised only
// where a mutation is asserted (a spied client method + a preset session token, no
// mocked engine transport otherwise).

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { queryClient } from "../server/queryClient";
import { setActorToken } from "../server/authoring";
import { useAgentPanel } from "./agentPanel";
import { getShellCenterSlot, setShellCenterSlot } from "./shellLayout";
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
  setShellCenterSlot("none");
  useAgentPanel.setState({ currentSessionId: null });
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
  it("toggles the center slot and labels reflect the resulting state", () => {
    expect(getShellCenterSlot()).toBe("none");
    const closed = agentTogglePanelAction();
    expect(closed.id).toBe(AGENT_TOGGLE_PANEL_ACTION_ID);
    expect(closed.label).toEqual({ key: "common:agent.actions.openPanel" });

    closed.run?.();
    expect(getShellCenterSlot()).toBe("agent");

    // Built again while open: the label now names the close action.
    expect(agentTogglePanelAction().label).toEqual({
      key: "common:agent.actions.closePanel",
    });

    // From the GRAPH the verb opens rather than closes — a slot the panel does not
    // hold is not an open panel, whichever occupant is there.
    setShellCenterSlot("graph");
    expect(agentTogglePanelAction().label).toEqual({
      key: "common:agent.actions.openPanel",
    });
    agentTogglePanelAction().run?.();
    expect(getShellCenterSlot()).toBe("agent");
  });
});

describe("agent:new-session descriptor", () => {
  it("clears the current session (a blank composer) and opens the panel", () => {
    useAgentPanel.setState({ currentSessionId: "session:old" });
    const action = agentNewSessionAction();
    expect(action.id).toBe(AGENT_NEW_SESSION_ACTION_ID);

    action.run?.();
    expect(useAgentPanel.getState().currentSessionId).toBeNull();
    expect(getShellCenterSlot()).toBe("agent");
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
