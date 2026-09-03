// Agent-panel view-store tests. Pure local chrome state — no wire. Covers the
// open/toggle lifecycle (which is the CENTER SLOT verb now, not a second open flag)
// and the current-session pointer. The panel has no width of its own any more — the
// dock owns its geometry — so there is no width clamp to cover here.
//
// The refusal derivation is covered here too: it takes already-read snapshots as
// arguments, so its inputs are built from the real adapters rather than fetched.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  closeAgentPanel,
  openAgentPanel,
  setAgentCurrentSession,
  setAgentPendingChangesOpen,
  setAgentTeamRun,
  scopedTeamRunId,
  teamRunProviderCondition,
  teamRunScopeAction,
  toggleAgentPanel,
  useAgentPanel,
} from "./agentPanel";
import { getShellCenterSlot, setShellCenterSlot } from "./shellLayout";
import type { TeamRunStatus } from "../server/agent/a2aTeam";
import { adaptRelayFrame } from "../server/liveAdapters/a2aRelay";

function reset(): void {
  setShellCenterSlot("none");
  useAgentPanel.setState({
    pendingChangesOpen: false,
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

  it("expands the pending-changes region on request and leaves it alone otherwise", () => {
    // D9: there is no view switch — the flag opens a disclosure INSIDE the one
    // conversation view.
    openAgentPanel({ pendingChanges: true });
    expect(getShellCenterSlot()).toBe("agent");
    expect(useAgentPanel.getState().pendingChangesOpen).toBe(true);

    setShellCenterSlot("none");
    openAgentPanel();
    expect(useAgentPanel.getState().pendingChangesOpen).toBe(true);

    setAgentPendingChangesOpen(false);
    expect(useAgentPanel.getState().pendingChangesOpen).toBe(false);
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

describe("team-run refusal", () => {
  const status = (patch: Partial<TeamRunStatus>): TeamRunStatus => ({
    run_id: "run-a",
    status: "running",
    proposal_ids: [],
    changeset_ids: [],
    roles: [],
    assignments: [],
    ...patch,
  });
  const liveFailure = (code: string) =>
    adaptRelayFrame({ channel: "error", data: { code, message: "Reconnecting… 1/5" } });

  it("opens only on an authoritative failure, never on a live fault alone", () => {
    const frames = [liveFailure("credits_exhausted")];
    expect(teamRunProviderCondition(undefined, frames)).toBeNull();
    expect(teamRunProviderCondition(status({}), frames)).toBeNull();
    expect(
      teamRunProviderCondition(status({ status: "completed" }), frames),
    ).toBeNull();
  });

  it("prefers the served classification over the live one for the same failure", () => {
    const served = status({
      status: "failed",
      provider_condition: "budget_exhausted",
      failure_reason: "out of credit",
    });
    // Both the live frame and the prose say credit; the durable snapshot says the
    // operator's own ceiling, and the durable snapshot is what a remedy follows.
    expect(teamRunProviderCondition(served, [liveFailure("credits_exhausted")])).toBe(
      "budget_exhausted",
    );
  });

  it("fills a classification-less snapshot from the newest live failure", () => {
    const frames = [liveFailure("throttled"), liveFailure("usage_exhausted")];
    expect(teamRunProviderCondition(status({ status: "failed" }), frames)).toBe(
      "usage_exhausted",
    );
  });

  it("falls to the floor member when nothing classified the failure", () => {
    expect(teamRunProviderCondition(status({ status: "failed" }), [])).toBe("unknown");
    expect(
      teamRunProviderCondition(status({ status: "failed" }), [liveFailure("")]),
    ).toBe("unknown");
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
