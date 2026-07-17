import { describe, expect, it } from "vitest";

import {
  adaptPresetsList,
  adaptRunStart,
  adaptRunStatus,
  adaptServiceState,
  readAgentTierAvailability,
  type PassThrough,
} from "./a2aTeam";

describe("adaptPresetsList", () => {
  it("adapts the sibling preset list tolerantly and preserves tiers", () => {
    const pass: PassThrough = {
      envelope: {
        api_version: "v1",
        presets: [
          {
            id: "vaultspec-authoring",
            loadable: true,
            display_name: "Authoring team",
            required_roles: ["researcher", "planner"],
            is_mock: false,
            origin: "bundled",
            default_profile_id: "team-defaults",
          },
          // A preset that failed to load is still listed (truthful set).
          { id: "broken", loadable: false, unavailable_reason: "preset not found" },
          // Junk entries are dropped, never thrown on.
          { no_id: true },
          42,
        ],
      },
      tiers: { semantic: { available: true } },
    };
    const { presets, tiers } = adaptPresetsList(pass);
    expect(presets.map((p) => p.id)).toEqual(["vaultspec-authoring", "broken"]);
    expect(presets[0].required_roles).toEqual(["researcher", "planner"]);
    expect(presets[1].loadable).toBe(false);
    expect(presets[1].unavailable_reason).toBe("preset not found");
    expect(tiers).toBe(pass.tiers);
  });

  it("returns an empty list when a2a is down (null envelope)", () => {
    const { presets } = adaptPresetsList({ envelope: null, tiers: {} });
    expect(presets).toEqual([]);
  });
});

describe("adaptRunStart", () => {
  it("adapts a successful run-start ack", () => {
    const result = adaptRunStart({
      envelope: {
        api_version: "v1",
        run_id: "run-9",
        status: "active",
        nickname: "brave-otter",
        eligible: true,
        profile_id: "team-defaults",
      },
    });
    expect(result.ok).toBe(true);
    expect(result.run_id).toBe("run-9");
    expect(result.status).toBe("active");
    expect(result.eligible).toBe(true);
  });

  it("surfaces a sibling business refusal (422) as ok:false with detail", () => {
    const result = adaptRunStart({
      envelope: { detail: "preset ineligible" },
      siblingStatus: 422,
    });
    expect(result.ok).toBe(false);
    expect(result.sibling_status).toBe(422);
    expect(result.refusal_detail).toBe("preset ineligible");
  });

  it("treats a null envelope (a2a down) as ok:false", () => {
    expect(adaptRunStart({ envelope: null }).ok).toBe(false);
  });
});

describe("adaptRunStatus", () => {
  it("passes served run status through without deriving it", () => {
    const status = adaptRunStatus({
      envelope: {
        run_id: "run-9",
        status: "completed",
        semantic_phase: "adr",
        feature_tag: "a2a-orchestration-edge",
        proposal_ids: ["p1", "p2"],
        changeset_ids: ["c1"],
        last_sequence: 12,
      },
    });
    expect(status.status).toBe("completed");
    expect(status.semantic_phase).toBe("adr");
    expect(status.proposal_ids).toEqual(["p1", "p2"]);
    expect(status.last_sequence).toBe(12);
  });

  it("floors a sparse status body without throwing", () => {
    const status = adaptRunStatus({ envelope: {} });
    expect(status.status).toBe("unknown");
    expect(status.proposal_ids).toEqual([]);
  });
});

describe("adaptServiceState", () => {
  it("adapts the readiness snapshot", () => {
    const state = adaptServiceState({
      envelope: {
        status: "ready",
        alive: true,
        ready: true,
        can_accept_run: true,
        service_version: "1.2.3",
        degraded_reasons: [],
      },
    });
    expect(state.status).toBe("ready");
    expect(state.can_accept_run).toBe(true);
    expect(state.service_version).toBe("1.2.3");
  });
});

describe("readAgentTierAvailability (tolerant absent-tier handling)", () => {
  it("treats an ABSENT agent tier as healthy (appears only-when-degraded)", () => {
    // The engine seeds only the four canonical tiers; a healthy a2a omits `agent`.
    expect(readAgentTierAvailability({ semantic: { available: true } })).toEqual({
      available: true,
    });
    expect(readAgentTierAvailability(undefined)).toEqual({ available: true });
  });

  it("treats a PRESENT available:false agent tier as down, with the reason", () => {
    const avail = readAgentTierAvailability({
      agent: {
        available: false,
        reason: "a2a gateway not running (no service.json discovered)",
      },
    });
    expect(avail.available).toBe(false);
    expect(avail.reason).toContain("a2a gateway not running");
  });

  it("treats a present available:true agent tier as healthy", () => {
    expect(readAgentTierAvailability({ agent: { available: true } })).toEqual({
      available: true,
    });
  });
});
