import { describe, expect, it } from "vitest";

import {
  advanceRelayResumeCursor,
  adaptActiveRuns,
  adaptPresetsList,
  adaptRunStart,
  adaptRunStatus,
  adaptServiceState,
  createTeamRunId,
  isTeamRunTerminalStatus,
  latestRelayReconciliationSignal,
  observeRunReconciliation,
  readAgentTierAvailability,
  recoverableActiveRunId,
  relayStreamNeedsStatusPolling,
  resolveRunReconciliation,
  scopedTeamRunStatus,
  type PassThrough,
  type RunReconciliationState,
} from "./a2aTeam";
import { adaptRelayFrame } from "../liveAdapters/a2aRelay";

describe("team run identity + lifecycle authority", () => {
  it("creates a fresh path-safe UUID identity for each deliberate submission", () => {
    const first = createTeamRunId();
    const second = createTeamRunId();
    expect(first).toMatch(/^run-[0-9a-f]{32}$/);
    expect(second).toMatch(/^run-[0-9a-f]{32}$/);
    expect(second).not.toBe(first);
  });

  it("recognizes only the reviewed authoritative non-active statuses", () => {
    for (const status of ["archived", "cancelled", "completed", "failed"]) {
      expect(isTeamRunTerminalStatus(status)).toBe(true);
    }
    for (const status of ["running", "cancelling", "terminal", "unknown", undefined]) {
      expect(isTeamRunTerminalStatus(status)).toBe(false);
    }
  });

  it("rejects a terminal snapshot cached for a different run", () => {
    const previous = adaptRunStatus({
      envelope: { run_id: "run-a", status: "archived" },
    });
    expect(scopedTeamRunStatus("run-b", previous)).toBeUndefined();
    expect(scopedTeamRunStatus("run-a", previous)).toBe(previous);
  });
});

describe("relay resume + reconciliation", () => {
  it("advances a monotone cursor within one run and resets it across run identity", () => {
    let cursor = advanceRelayResumeCursor({ runId: null }, "run-a");
    cursor = advanceRelayResumeCursor(
      cursor,
      "run-a",
      adaptRelayFrame({ channel: "message_chunk", data: { seq: 8 } }),
    );
    cursor = advanceRelayResumeCursor(
      cursor,
      "run-a",
      adaptRelayFrame({ channel: "message_chunk", data: { seq: 3 } }),
    );
    expect(cursor).toEqual({ runId: "run-a", since: 8 });
    expect(advanceRelayResumeCursor(cursor, "run-b")).toEqual({
      runId: "run-b",
      since: undefined,
    });
  });

  it("keeps a gap sticky across normal progress and generation-fences status success", () => {
    const gap = adaptRelayFrame({ channel: "gap", data: { reason: "evicted" } });
    const normal = adaptRelayFrame({
      channel: "message_chunk",
      data: { seq: 9, content: "continued" },
    });
    const terminal = adaptRelayFrame({
      channel: "thread_terminal",
      data: { seq: 10, status: "completed" },
    });
    const initial: RunReconciliationState = {
      runId: "run-a",
      required: false,
      generation: 0,
      relayGeneration: 0,
      relayFailed: false,
    };

    const signalAfterNormal = latestRelayReconciliationSignal([gap, normal]);
    expect(signalAfterNormal).toBe(gap);
    const gapped = observeRunReconciliation(initial, "run-a", 1, false);
    expect(gapped.required).toBe(true);

    // Ordinary progress after the gap cannot clear it.
    expect(observeRunReconciliation(gapped, "run-a", 1, false)).toBe(gapped);

    const terminalSignal = latestRelayReconciliationSignal([gap, normal, terminal]);
    expect(terminalSignal).toBe(terminal);
    const newer = observeRunReconciliation(gapped, "run-a", 2, false);
    expect(newer.generation).toBe(gapped.generation + 1);
    expect(resolveRunReconciliation(newer, "run-a", gapped.generation)).toBe(newer);
    expect(resolveRunReconciliation(newer, "run-a", newer.generation).required).toBe(
      false,
    );
  });

  it("keeps browser status polling after degraded heartbeats until real activity", () => {
    const degraded = adaptRelayFrame({
      channel: "relay_degraded",
      data: { degraded: true },
    });
    const heartbeat = adaptRelayFrame({ channel: "heartbeat", data: { seq: 11 } });
    const progress = adaptRelayFrame({
      channel: "message_chunk",
      data: { seq: 12, content: "recovered" },
    });
    expect(relayStreamNeedsStatusPolling([degraded, heartbeat], false)).toBe(true);
    expect(relayStreamNeedsStatusPolling([degraded, heartbeat, progress], false)).toBe(
      false,
    );
    expect(relayStreamNeedsStatusPolling([], true)).toBe(true);
  });
});

describe("adaptActiveRuns", () => {
  const tiers = {
    declared: { available: true },
    structural: { available: true },
    temporal: { available: true },
    semantic: { available: true },
  };

  it("adapts an exact bounded active-run discovery projection", () => {
    const pass: PassThrough = {
      envelope: {
        api_version: "v1",
        state: "active",
        runs: [
          { run_id: "run-a", status: "running", feature_tag: "editor" },
          { run_id: "run-b", status: "submitted" },
        ],
        truncated: true,
      },
      tiers,
    };
    const result = adaptActiveRuns(pass);
    expect(result.runs.map((r) => r.run_id)).toEqual(["run-a", "run-b"]);
    expect(result.runs[0]!.feature_tag).toBe("editor");
    expect(result.truncated).toBe(true);
    expect(result.contractValid).toBe(true);
    expect(result.tiers).toBeDefined();
  });

  it("returns an empty list when a2a is down (null envelope)", () => {
    const result = adaptActiveRuns({
      envelope: null,
      tiers: { ...tiers, agent: { available: false } },
    });
    expect(result.runs).toEqual([]);
    expect(result.truncated).toBe(true);
    expect(result.contractValid).toBe(false);
  });

  it("selects only one complete unambiguous viewing binding", () => {
    const unique = adaptActiveRuns({
      envelope: {
        api_version: "v1",
        state: "active",
        runs: [{ run_id: "run-only", status: "running" }],
        truncated: false,
      },
      tiers,
    });
    expect(recoverableActiveRunId(unique)).toBe("run-only");
    expect(recoverableActiveRunId({ ...unique, truncated: true })).toBeNull();
    expect(recoverableActiveRunId({ ...unique, runs: [] })).toBeNull();
    expect(
      recoverableActiveRunId({
        ...unique,
        runs: [
          { run_id: "run-a", status: "running" },
          { run_id: "run-b", status: "submitted" },
        ],
      }),
    ).toBeNull();
  });

  it("accepts exactly the upstream active ThreadStatus vocabulary", () => {
    for (const status of [
      "submitted",
      "running",
      "input_required",
      "cancelling",
      "repair_needed",
      "reconciling",
    ]) {
      const result = adaptActiveRuns({
        envelope: {
          api_version: "v1",
          state: "active",
          runs: [{ run_id: `run-${status}`, status }],
          truncated: false,
        },
        tiers,
      });
      expect(result.contractValid, status).toBe(true);
    }
  });

  it("fails closed on version, state, completeness, refusal, row, or bound drift", () => {
    const exact = {
      api_version: "v1",
      state: "active",
      runs: [{ run_id: "run-only", status: "running" }],
      truncated: false,
    };
    const drifted: PassThrough[] = [
      { envelope: { ...exact, api_version: "v2" }, tiers },
      { envelope: { ...exact, state: "completed" }, tiers },
      { envelope: { ...exact, truncated: "true" }, tiers },
      { envelope: { api_version: "v1", state: "active", runs: exact.runs }, tiers },
      { envelope: exact, siblingStatus: 422, tiers },
      { envelope: exact },
      { envelope: exact, tiers: {} },
      { envelope: exact, tiers: { ...tiers, semantic: { available: "yes" } } as never },
      { envelope: exact, tiers: { ...tiers, agent: {} } as never },
      { envelope: exact, tiers: { ...tiers, agent: null } as never },
      {
        envelope: exact,
        tiers: { ...tiers, agent: { available: "no" } } as never,
      },
      {
        envelope: { ...exact, runs: [{ run_id: "terminal", status: "completed" }] },
        tiers,
      },
      {
        envelope: { ...exact, runs: [{ run_id: "terminal", status: "failed" }] },
        tiers,
      },
      {
        envelope: { ...exact, runs: [{ run_id: "terminal", status: "cancelled" }] },
        tiers,
      },
      {
        envelope: { ...exact, runs: [{ run_id: "terminal", status: "archived" }] },
        tiers,
      },
      {
        envelope: { ...exact, runs: [{ run_id: "future", status: "waiting" }] },
        tiers,
      },
      {
        envelope: {
          ...exact,
          runs: [exact.runs[0], { run_id: "missing-status" }],
        },
        tiers,
      },
      {
        envelope: {
          ...exact,
          runs: [
            exact.runs[0],
            { run_id: "run-two", status: "running" },
            { run_id: "run-three", status: "running" },
          ],
        },
        tiers,
      },
    ];
    for (const pass of drifted) {
      const result = adaptActiveRuns(pass);
      expect(result.contractValid).toBe(false);
      expect(result.truncated).toBe(true);
      expect(result.runs).toEqual([]);
      expect(recoverableActiveRunId(result)).toBeNull();
    }
  });
});

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
