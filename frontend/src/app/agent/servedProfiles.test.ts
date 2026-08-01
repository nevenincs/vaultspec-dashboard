// Served-profile consumption rules (plan S40 + S42). Pure.
//
// Both steps exist because the frontend was DROPPING fields the sibling already
// served. So the rules pinned here are the ones that decide what the user is told
// about a model: never an invented provider label for a profile that routes roles
// to several, never a filtered list that hides why a choice is unavailable, and
// never an elapsed reading measured from something that is not the run's start.

import { describe, expect, it } from "vitest";

import {
  adaptPresetsList,
  adaptRunStatus,
  profileIsMixedProvider,
  profileProviderIds,
  startedAtMs,
  type TeamProfile,
} from "../../stores/server/agent/a2aTeam";
import { deriveTeamRoster } from "./teamRun";
import { profileLabel, profileProviderLabel } from "./ComposerModelPicker";

function profile(overrides: Partial<TeamProfile> = {}): TeamProfile {
  return {
    id: "p1",
    is_default: false,
    eligible: true,
    unavailable_reasons: [],
    assignments: [],
    ...overrides,
  };
}

describe("adaptPresetsList profiles", () => {
  it("carries the served profile list the adapter used to drop", () => {
    const { presets } = adaptPresetsList({
      envelope: {
        presets: [
          {
            id: "research_adr",
            default_profile_id: "balanced",
            profiles: [
              {
                id: "balanced",
                display_name: "Balanced",
                is_default: true,
                eligible: true,
                assignments: [{ role: "researcher", provider_id: "claude" }],
              },
              {
                id: "cheap",
                eligible: false,
                unavailable_reasons: ["no api key for zhipu"],
                assignments: [{ role: "researcher", provider_id: "zhipu" }],
              },
            ],
          },
        ],
      },
    });
    expect(presets).toHaveLength(1);
    expect(presets[0]?.profiles.map((p) => p.id)).toEqual(["balanced", "cheap"]);
    // The INELIGIBLE profile survives adaptation with the sibling's own words.
    expect(presets[0]?.profiles[1]?.eligible).toBe(false);
    expect(presets[0]?.profiles[1]?.unavailable_reasons).toEqual([
      "no api key for zhipu",
    ]);
    expect(presets[0]?.profiles[0]?.assignments).toEqual([
      { role: "researcher", provider_id: "claude", model: undefined },
    ]);
  });

  it("treats an omitted eligibility verdict as eligible, not as a refusal", () => {
    // The absence of a verdict is not an objection. Disabling a profile the sibling
    // never objected to would hide a working choice.
    const { presets } = adaptPresetsList({
      envelope: { presets: [{ id: "t", profiles: [{ id: "p" }] }] },
    });
    expect(presets[0]?.profiles[0]?.eligible).toBe(true);
  });

  it("yields an empty list for a preset body that serves none", () => {
    const { presets } = adaptPresetsList({ envelope: { presets: [{ id: "t" }] } });
    expect(presets[0]?.profiles).toEqual([]);
  });
});

describe("provider labelling", () => {
  it("names one provider plainly", () => {
    const single = profile({
      assignments: [
        { role: "a", provider_id: "claude" },
        { role: "b", provider_id: "claude" },
      ],
    });
    expect(profileProviderIds(single)).toEqual(["claude"]);
    expect(profileIsMixedProvider(single)).toBe(false);
    expect(profileProviderLabel(single, "Mixed providers")).toBe("claude");
  });

  it("refuses to collapse a MIXED profile into one invented label", () => {
    // A profile may route different roles to different providers. Picking one of
    // them to stand for the whole profile would be telling the user something the
    // sibling never said.
    const mixed = profile({
      assignments: [
        { role: "a", provider_id: "claude" },
        { role: "b", provider_id: "kimi" },
      ],
    });
    expect(profileProviderIds(mixed)).toEqual(["claude", "kimi"]);
    expect(profileIsMixedProvider(mixed)).toBe(true);
    expect(profileProviderLabel(mixed, "Mixed providers")).toBe("Mixed providers");
  });

  it("says nothing about providers when none are served", () => {
    expect(profileProviderLabel(profile(), "Mixed providers")).toBeNull();
  });

  it("falls back to the served id when a profile has no display name", () => {
    expect(profileLabel(profile({ display_name: "Balanced" }))).toBe("Balanced");
    expect(profileLabel(profile({ id: "cheap" }))).toBe("cheap");
  });
});

describe("adaptRunStatus roster fields", () => {
  it("carries roles, the frozen profile, and per-role assignments", () => {
    const status = adaptRunStatus({
      envelope: {
        run_id: "run-1",
        status: "running",
        profile_id: "balanced",
        roles: [
          { role: "researcher", state: "working" },
          { role: "reviewer", state: "idle" },
        ],
        assignments: [
          { role: "researcher", provider_id: "claude", model: "opus" },
          { role: "reviewer", provider_id: "kimi", model: "k2" },
        ],
      },
    });
    expect(status.profile_id).toBe("balanced");
    expect(status.roles).toEqual([
      { role: "researcher", state: "working" },
      { role: "reviewer", state: "idle" },
    ]);
    expect(status.assignments).toHaveLength(2);
  });

  it("floors an older run that serves none of the additive fields", () => {
    // Additive-v1: a run started before the fields existed must not throw or
    // fabricate — it simply has no roster of its own.
    const status = adaptRunStatus({ envelope: { run_id: "old", status: "running" } });
    expect(status.roles).toEqual([]);
    expect(status.assignments).toEqual([]);
    expect(status.profile_id).toBeUndefined();
    expect(status.started_at_ms).toBeUndefined();
  });
});

describe("startedAtMs", () => {
  it("reads a millisecond epoch, a seconds epoch, and an ISO timestamp", () => {
    expect(startedAtMs({ started_at_ms: 1_775_000_000_000 })).toBe(1_775_000_000_000);
    expect(startedAtMs({ started_at: 1_775_000_000 })).toBe(1_775_000_000_000);
    expect(startedAtMs({ created_at: "2026-04-01T00:00:00.000Z" })).toBe(
      Date.parse("2026-04-01T00:00:00.000Z"),
    );
  });

  it("returns undefined when nothing usable is served", () => {
    // This is what keeps the header from measuring elapsed off the moment the panel
    // happened to start watching — with no start time there is simply no clock.
    expect(startedAtMs({})).toBeUndefined();
    expect(startedAtMs({ started_at: "" })).toBeUndefined();
    expect(startedAtMs({ started_at: "not a date" })).toBeUndefined();
    expect(startedAtMs({ started_at: Number.NaN })).toBeUndefined();
  });
});

describe("deriveTeamRoster with authoritative status", () => {
  it("seeds from run-status and binds each role to its served provider/model", () => {
    const status = adaptRunStatus({
      envelope: {
        run_id: "run-1",
        status: "running",
        roles: [{ role: "researcher", state: "working" }],
        assignments: [{ role: "researcher", provider_id: "claude", model: "opus" }],
      },
    });
    expect(deriveTeamRoster([], status)).toEqual([
      { agentId: "researcher", state: "working", providerId: "claude", model: "opus" },
    ]);
  });

  it("survives a reload with no relay frames at all", () => {
    // The point of seeding from status: frames are lost on reload, the roster is not.
    const status = adaptRunStatus({
      envelope: { run_id: "r", status: "running", roles: [{ role: "planner" }] },
    });
    expect(deriveTeamRoster([], status).map((m) => m.agentId)).toEqual(["planner"]);
  });

  it("still works from relay frames alone for a run that serves no roles", () => {
    const frames = [
      {
        kind: "status" as const,
        event: "team_status",
        payload: { agents: [{ agent_id: "worker", state: "working" }] },
      },
    ];
    expect(deriveTeamRoster(frames)).toEqual([{ agentId: "worker", state: "working" }]);
  });
});
