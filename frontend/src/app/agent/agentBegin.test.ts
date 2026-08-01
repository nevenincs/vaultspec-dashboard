// Begin/continue posture rules (agent-panel-shell-integration D2; research G8).
// Pure — no wire, no render. The posture decides where the composer sits, so the
// rules that matter are the ones that would otherwise make it JUMP: a fresh session
// with no turns must not read as a conversation, and an unsettled transcript must
// not flash the begin idiom before the turns arrive.

import { describe, expect, it } from "vitest";

import {
  AGENT_BEGIN_RECENTS_CAP,
  AGENT_STARTERS,
  agentBeginHeadlineDescriptor,
  agentBeginPosture,
  agentBeginShowsRecents,
  agentComposerPosture,
} from "./agentBegin";

describe("agentComposerPosture", () => {
  it("begins with no session, no turns, and no team run", () => {
    expect(
      agentComposerPosture({ sessionId: null, hasTurns: false, teamRunId: null }),
    ).toBe("begin");
  });

  it("still begins for a session that exists but has said nothing yet", () => {
    // The composer creates the durable session on the FIRST prompt, but a session
    // can also be selected from recents or recovered. Until it carries a turn there
    // is nothing to continue, so the centered idiom is still correct.
    expect(
      agentComposerPosture({
        sessionId: "session:abc",
        hasTurns: false,
        teamRunId: null,
      }),
    ).toBe("begin");
  });

  it("continues once the session carries a turn", () => {
    expect(
      agentComposerPosture({
        sessionId: "session:abc",
        hasTurns: true,
        teamRunId: null,
      }),
    ).toBe("continue");
  });

  it("continues for a live team run even with no single-agent session", () => {
    // The two planes are distinct: a team run is a conversation in progress on its
    // own, and its transcript needs the bottom-docked composer.
    expect(
      agentComposerPosture({ sessionId: null, hasTurns: false, teamRunId: "run-1" }),
    ).toBe("continue");
  });

  it("continues while the transcript is unsettled, so the composer never jumps", () => {
    // Loading or faulted, the turn count is UNKNOWN. Reading unknown as "no turns"
    // would center the composer and then yank it to the bottom a moment later.
    expect(
      agentComposerPosture({
        sessionId: "session:abc",
        hasTurns: false,
        teamRunId: null,
        transcriptUnsettled: true,
      }),
    ).toBe("continue");
  });
});

describe("agentBeginPosture", () => {
  it("invites when the served agent tier reports the plane usable", () => {
    expect(agentBeginPosture({ agentPlaneAvailable: true })).toBe("invite");
  });

  it("withholds the invitation when the plane is degraded", () => {
    // G10: the panel is allowed to keep the composer in front of the user, but it
    // is not allowed to ask for a prompt it already knows cannot start.
    expect(agentBeginPosture({ agentPlaneAvailable: false })).toBe("unavailable");
  });

  it("still invites while availability is unknown, rather than announcing a failure", () => {
    // An unsettled read is not a degradation. Rendering the unavailable posture here
    // would tell the user the agent is down and then take it back a moment later —
    // a false alarm, which is worse than a momentary optimism that self-corrects.
    expect(
      agentBeginPosture({ agentPlaneAvailable: false, availabilityUnsettled: true }),
    ).toBe("invite");
    expect(
      agentBeginPosture({ agentPlaneAvailable: true, availabilityUnsettled: true }),
    ).toBe("invite");
  });
});

describe("agentBeginHeadlineDescriptor", () => {
  it("names the bound scope when there is one", () => {
    expect(agentBeginHeadlineDescriptor("vaultspec-dashboard")).toEqual({
      key: "common:agent.begin.headline",
      values: { workspace: "vaultspec-dashboard" },
    });
  });

  it("says so plainly rather than naming an empty workspace", () => {
    // G2 personalizes from REAL context. With none, the unbound wording is used —
    // never an interpolated blank, which would read as a bug to the user.
    expect(agentBeginHeadlineDescriptor(null)).toEqual({
      key: "common:agent.begin.headlineUnbound",
    });
    expect(agentBeginHeadlineDescriptor("")).toEqual({
      key: "common:agent.begin.headlineUnbound",
    });
  });
});

describe("starters and recents", () => {
  it("offers a bounded set of intent verbs, each with a seed", () => {
    expect(AGENT_STARTERS.length).toBeGreaterThan(0);
    expect(AGENT_STARTERS.length).toBeLessThanOrEqual(4);
    for (const starter of AGENT_STARTERS) {
      expect(starter.label.key.startsWith("common:agent.begin.starters.")).toBe(true);
      expect(starter.seed.key.startsWith("common:agent.begin.seeds.")).toBe(true);
    }
    expect(new Set(AGENT_STARTERS.map((s) => s.id)).size).toBe(AGENT_STARTERS.length);
  });

  it("yields starters to recents the moment any history exists", () => {
    // G4/G11: never both at once — showing both would turn the begin state into the
    // dashboard G1 exists to forbid.
    expect(agentBeginShowsRecents(0)).toBe(false);
    expect(agentBeginShowsRecents(1)).toBe(true);
    expect(agentBeginShowsRecents(50)).toBe(true);
    expect(AGENT_BEGIN_RECENTS_CAP).toBeGreaterThan(0);
  });
});
