import { describe, expect, it } from "vitest";

import {
  advanceRelayResumeCursor,
  adaptActiveRuns,
  adaptProviderCatalog,
  adaptPresetsList,
  adaptRunStart,
  adaptRunStatus,
  adaptSelection,
  createTeamRunId,
  isProviderCatalogSelectable,
  isTeamRunTerminalStatus,
  latestRelayReconciliationSignal,
  observeRunReconciliation,
  readAgentTierAvailability,
  recoverableActiveRunId,
  relayStreamNeedsStatusPolling,
  resolveRunReconciliation,
  isCurrentCatalogSelection,
  PROVIDER_CATALOG_STALE_REFETCH_BASE_MS,
  PROVIDER_CATALOG_STALE_REFETCH_MAX_MS,
  providerCatalogQueryOptions,
  providerCatalogRefetchInterval,
  selectionFromCatalogEntry,
  selectionWithCatalogControl,
  scopedTeamRunStatus,
  type PassThrough,
  type RunReconciliationState,
} from "./a2aTeam";
import { adaptRelayFrame } from "../liveAdapters/a2aRelay";
import { PROVIDER_CONDITIONS } from "./providerCondition";

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
  it("adapts provider-free team topology tolerantly and preserves tiers", () => {
    const pass: PassThrough = {
      envelope: {
        api_version: "v1",
        presets: [
          {
            id: "vaultspec-authoring",
            loadable: true,
            display_name: "Authoring team",
            required_roles: ["researcher", "planner"],
            required_role_labels: { researcher: "Researcher" },
            is_mock: false,
            origin: "bundled",
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
    expect(presets[0].required_role_labels).toEqual({ researcher: "Researcher" });
    expect(presets[1].loadable).toBe(false);
    expect(presets[1].unavailable_reason).toBe("preset not found");
    expect(tiers).toBe(pass.tiers);
  });

  it("returns an empty list when a2a is down (null envelope)", () => {
    const { presets } = adaptPresetsList({ envelope: null, tiers: {} });
    expect(presets).toEqual([]);
  });

  it("preserves a prototype-colliding served role label as an owned value", () => {
    const { presets } = adaptPresetsList({
      envelope: {
        presets: [
          {
            id: "prototype-role",
            loadable: true,
            required_roles: ["constructor"],
            required_role_labels: { constructor: "Constructor worker" },
            is_mock: false,
          },
        ],
      },
      tiers: {},
    });

    const labels = presets[0]?.required_role_labels;
    expect(labels).toBeDefined();
    expect(Object.getPrototypeOf(labels!)).toBeNull();
    expect(labels!["constructor"]).toBe("Constructor worker");
  });
});

describe("adaptProviderCatalog", () => {
  const providerCatalogPass: PassThrough = {
    envelope: {
      api_version: "v1",
      providers: [
        {
          provider_id: "provider-issued-id",
          display_name: "Provider-issued display",
          execution_mode: "execution-lane-issued-id",
          health: {
            configured: "available",
            transport: "available",
            authentication: "authenticated",
            catalog: "available",
            admission: "admitted",
            selectable: true,
            reasons: [],
            checked_at: "2026-08-02T09:00:00Z",
          },
          catalog: {
            schema_version: 1,
            state: {
              status: "available",
              revision: "catalog-revision-issued-id",
              checked_at: "2026-08-02T09:00:00Z",
              expires_at: "2099-08-02T09:00:00Z",
            },
            models: [
              {
                entry_id: "entry-issued-id",
                display_name: "Entry-issued display",
                capabilities: ["provider-issued-capability"],
                native_control_ids: ["provider-native-control-id"],
              },
            ],
            native_controls: [
              {
                control_id: "provider-native-control-id",
                kind: "provider-issued-kind",
                display_name: "Provider-native control",
                default_option_id: "provider-native-default-option",
                options: [
                  {
                    option_id: "provider-native-default-option",
                    display_name: "Provider-native default",
                  },
                  {
                    option_id: "provider-native-other-option",
                    display_name: "Provider-native alternative",
                  },
                ],
              },
              {
                control_id: "lane-only-control-id",
                default_option_id: "lane-only-default-option",
                options: [{ option_id: "lane-only-default-option" }],
              },
            ],
          },
        },
      ],
    },
  };

  it("keeps provider-owned entries, health, and native controls without inventing tiers", () => {
    const catalog = adaptProviderCatalog(providerCatalogPass);
    expect(catalog.providers).toHaveLength(1);
    const provider = catalog.providers[0]!;
    expect(provider.health).toMatchObject({
      configured: "available",
      transport: "available",
      authentication: "authenticated",
      admission: "admitted",
      selectable: true,
    });
    expect(provider.catalog.models[0]?.entry_id).toBe("entry-issued-id");
    expect(provider.catalog.models[0]?.native_control_ids).toEqual([
      "provider-native-control-id",
    ]);
    expect(provider.catalog.native_controls[0]?.kind).toBe("provider-issued-kind");
    expect(provider.catalog.native_controls[0]?.options).toHaveLength(2);
  });

  it("rejects absent or unknown API versions as one closed catalog snapshot", () => {
    const known = providerCatalogPass.envelope as {
      readonly api_version: string;
      readonly providers: readonly unknown[];
    };

    expect(
      adaptProviderCatalog({ envelope: { providers: known.providers } }).providers,
    ).toEqual([]);
    expect(
      adaptProviderCatalog({ envelope: { ...known, api_version: "v2" } }).providers,
    ).toEqual([]);
  });

  it("rejects a missing or unknown lane schema without retaining a sibling lane", () => {
    const known = providerCatalogPass.envelope as {
      readonly api_version: string;
      readonly providers: readonly {
        readonly provider_id: string;
        readonly catalog: { readonly schema_version: number };
      }[];
    };
    const valid = known.providers[0]!;
    const withUnknownSchema = {
      ...known,
      providers: [
        valid,
        {
          ...valid,
          provider_id: "second-provider-issued-id",
          catalog: { ...valid.catalog, schema_version: 2 },
        },
      ],
    };
    const withMissingSchema = {
      ...known,
      providers: [
        valid,
        {
          ...valid,
          provider_id: "second-provider-issued-id",
          catalog: { ...valid.catalog, schema_version: undefined },
        },
      ],
    };

    expect(adaptProviderCatalog({ envelope: withUnknownSchema }).providers).toEqual([]);
    expect(adaptProviderCatalog({ envelope: withMissingSchema }).providers).toEqual([]);
  });

  it("fails closed when A2A omits selectability, even if a catalog entry is present", () => {
    const catalog = adaptProviderCatalog({
      envelope: {
        api_version: "v1",
        providers: [
          {
            provider_id: "provider-issued-id",
            execution_mode: "execution-lane-issued-id",
            health: {
              configured: "available",
              catalog: "available",
              admission: "admitted",
            },
            catalog: {
              schema_version: 1,
              state: { status: "available", revision: "catalog-revision-issued-id" },
              models: [{ entry_id: "entry-issued-id", capabilities: [] }],
              native_controls: [],
            },
          },
        ],
      },
    });
    const provider = catalog.providers[0]!;
    expect(provider.health.selectable).toBe(false);
    expect(selectionFromCatalogEntry(provider, "entry-issued-id")).toBeNull();
  });

  it("rejects an inconsistent selectable flag when any health axis or catalog freshness is stale", () => {
    const stale = adaptProviderCatalog({
      envelope: {
        api_version: "v1",
        providers: [
          {
            provider_id: "provider-issued-id",
            execution_mode: "execution-lane-issued-id",
            health: {
              configured: "available",
              transport: "available",
              authentication: "authenticated",
              catalog: "stale",
              admission: "admitted",
              selectable: true,
            },
            catalog: {
              schema_version: 1,
              state: { status: "stale", revision: "catalog-revision-issued-id" },
              models: [{ entry_id: "entry-issued-id", capabilities: [] }],
              native_controls: [],
            },
          },
        ],
      },
    }).providers[0]!;
    expect(stale.health.selectable).toBe(false);
    expect(selectionFromCatalogEntry(stale, "entry-issued-id")).toBeNull();
  });

  it("preserves a conflicting catalog health axis and freshness state while failing selection closed", () => {
    const provider = adaptProviderCatalog({
      envelope: {
        api_version: "v1",
        providers: [
          {
            provider_id: "provider-issued-id",
            execution_mode: "execution-lane-issued-id",
            health: {
              configured: "available",
              transport: "available",
              authentication: "authenticated",
              catalog: "available",
              admission: "admitted",
              selectable: true,
            },
            catalog: {
              schema_version: 1,
              state: {
                status: "stale",
                revision: "catalog-revision-issued-id",
              },
              models: [{ entry_id: "entry-issued-id", capabilities: [] }],
              native_controls: [],
            },
          },
        ],
      },
    }).providers[0]!;

    expect(provider.health.catalog).toBe("available");
    expect(provider.catalog.state.status).toBe("stale");
    expect(provider.health.selectable).toBe(false);
    expect(selectionFromCatalogEntry(provider, "entry-issued-id")).toBeNull();
  });

  it("fails closed when otherwise selectable freshness omits checked_at", () => {
    const provider = adaptProviderCatalog(providerCatalogPass).providers[0]!;
    const now = Date.parse("2030-08-02T09:00:00Z");
    const candidate = {
      ...provider,
      catalog: {
        ...provider.catalog,
        state: { ...provider.catalog.state, checked_at: undefined },
      },
    };
    expect(isProviderCatalogSelectable(candidate, now)).toBe(false);
    expect(selectionFromCatalogEntry(candidate, "entry-issued-id", now)).toBeNull();
  });

  it("fails closed when otherwise selectable freshness omits expires_at", () => {
    const provider = adaptProviderCatalog(providerCatalogPass).providers[0]!;
    const now = Date.parse("2030-08-02T09:00:00Z");
    const candidate = {
      ...provider,
      catalog: {
        ...provider.catalog,
        state: { ...provider.catalog.state, expires_at: undefined },
      },
    };
    expect(isProviderCatalogSelectable(candidate, now)).toBe(false);
    expect(selectionFromCatalogEntry(candidate, "entry-issued-id", now)).toBeNull();
  });

  it("fails closed when otherwise selectable freshness has malformed checked_at", () => {
    const provider = adaptProviderCatalog(providerCatalogPass).providers[0]!;
    const now = Date.parse("2030-08-02T09:00:00Z");
    const candidate = {
      ...provider,
      catalog: {
        ...provider.catalog,
        state: { ...provider.catalog.state, checked_at: "not-an-instant" },
      },
    };
    expect(isProviderCatalogSelectable(candidate, now)).toBe(false);
    expect(selectionFromCatalogEntry(candidate, "entry-issued-id", now)).toBeNull();
  });

  it("fails closed for malformed, expired, or chronologically invalid freshness evidence", () => {
    const provider = adaptProviderCatalog(providerCatalogPass).providers[0]!;
    const now = Date.parse("2030-08-02T09:00:00Z");
    expect(isProviderCatalogSelectable(provider, now)).toBe(true);

    for (const state of [
      {
        ...provider.catalog.state,
        expires_at: "not-an-instant",
      },
      {
        ...provider.catalog.state,
        checked_at: "2029-08-02T09:00:00Z",
        expires_at: "2029-08-02T08:59:59Z",
      },
      {
        ...provider.catalog.state,
        checked_at: "2029-08-02T09:00:00Z",
        expires_at: "2029-08-02T10:00:00Z",
      },
    ]) {
      const candidate = {
        ...provider,
        catalog: { ...provider.catalog, state },
      };
      expect(isProviderCatalogSelectable(candidate, now)).toBe(false);
      expect(selectionFromCatalogEntry(candidate, "entry-issued-id", now)).toBeNull();
    }
  });

  it("mints and revises a selection only from the current served revision and options", () => {
    const provider = adaptProviderCatalog(providerCatalogPass).providers[0]!;
    const initial = selectionFromCatalogEntry(provider, "entry-issued-id");
    expect(initial).toEqual({
      schema_version: 1,
      provider_id: "provider-issued-id",
      execution_mode: "execution-lane-issued-id",
      catalog_revision: "catalog-revision-issued-id",
      entry_id: "entry-issued-id",
      controls: { "provider-native-control-id": "provider-native-default-option" },
    });
    expect(isCurrentCatalogSelection(provider, initial)).toBe(true);
    const changed = selectionWithCatalogControl(
      provider,
      initial!,
      "provider-native-control-id",
      "provider-native-other-option",
    );
    expect(changed?.controls["provider-native-control-id"]).toBe(
      "provider-native-other-option",
    );
    expect(
      selectionWithCatalogControl(
        provider,
        initial!,
        "provider-native-control-id",
        "provider-native-other-option",
        Date.parse("2100-08-02T09:00:00Z"),
      ),
    ).toBeNull();
    expect(
      selectionWithCatalogControl(
        provider,
        initial!,
        "provider-native-control-id",
        "not-issued-by-provider",
      ),
    ).toBeNull();
    expect(
      isCurrentCatalogSelection(
        {
          ...provider,
          catalog: {
            ...provider.catalog,
            state: { ...provider.catalog.state, revision: "a-new-revision" },
          },
        },
        initial,
      ),
    ).toBe(false);
  });

  it("requires literal selection schema version one before adapting or revalidating", () => {
    const provider = adaptProviderCatalog(providerCatalogPass).providers[0]!;
    const selection = selectionFromCatalogEntry(provider, "entry-issued-id")!;
    const { schema_version: _schemaVersion, ...missingSchema } = selection;
    const unknownSchema = { ...selection, schema_version: 2 };

    expect(adaptSelection(selection)).toEqual(selection);
    expect(adaptSelection(missingSchema)).toBeNull();
    expect(adaptSelection(unknownSchema)).toBeNull();
    expect(
      isCurrentCatalogSelection(provider, unknownSchema as unknown as typeof selection),
    ).toBe(false);
  });

  it("rejects a lane control outside the selected model and invalidates it after control-scope drift", () => {
    const provider = adaptProviderCatalog(providerCatalogPass).providers[0]!;
    const selection = selectionFromCatalogEntry(provider, "entry-issued-id");
    expect(selection).not.toBeNull();
    expect(
      selectionWithCatalogControl(
        provider,
        selection!,
        "lane-only-control-id",
        "lane-only-default-option",
      ),
    ).toBeNull();
    expect(
      isCurrentCatalogSelection(provider, {
        ...selection!,
        controls: { "lane-only-control-id": "lane-only-default-option" },
      }),
    ).toBe(false);
    expect(
      isCurrentCatalogSelection(
        {
          ...provider,
          catalog: {
            ...provider.catalog,
            models: provider.catalog.models.map((entry) => ({
              ...entry,
              native_control_ids: [],
            })),
          },
        },
        selection,
      ),
    ).toBe(false);
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
        frozen_assignment: {
          schema_version: 1,
          digest:
            "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          assignments: [
            {
              role_id: "role-issued-id",
              provider_id: "provider-issued-id",
              execution_mode: "execution-lane-issued-id",
              catalog_revision: "catalog-revision-issued-id",
              entry_id: "entry-issued-id",
              model_name: "provider-issued-model-value",
              controls: [],
              fallbacks: [],
              provenance: { selection_source: "team_selection" },
            },
          ],
        },
      },
    });
    expect(result.ok).toBe(true);
    expect(result.run_id).toBe("run-9");
    expect(result.status).toBe("active");
    expect(result.frozen_assignment?.assignments[0]?.entry_id).toBe("entry-issued-id");
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

  it("marks a present malformed frozen start acknowledgement as invalid", () => {
    const result = adaptRunStart({
      envelope: {
        run_id: "run-invalid-frozen-ack",
        status: "active",
        frozen_assignment: { schema_version: 2 },
      },
    });

    expect(result.frozen_assignment).toBeUndefined();
    expect(result.frozen_assignment_invalid).toBe(true);
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

  it("reads every refusal classification the closed vocabulary contains", () => {
    for (const condition of PROVIDER_CONDITIONS) {
      const status = adaptRunStatus({
        envelope: {
          run_id: "run-refused",
          status: "failed",
          provider_condition: condition,
          failure_reason: "Reconnecting… 1/5",
        },
      });
      expect(status.provider_condition).toBe(condition);
      // The prose is carried verbatim and never consulted to reach the line above:
      // this reason names a retry step on a run the classification says was refused.
      expect(status.failure_reason).toBe("Reconnecting… 1/5");
    }
  });

  it("degrades a served classification outside the closed list to the floor member", () => {
    const status = adaptRunStatus({
      envelope: {
        run_id: "run-refused",
        status: "failed",
        provider_condition: "quota_reset_pending",
      },
    });
    // Dropping it would leave a failed run looking unclassified, and forwarding it
    // would reach a reader that has no presentation for it.
    expect(status.provider_condition).toBe("unknown");
  });

  it("leaves a run that did not fail unclassified", () => {
    const status = adaptRunStatus({
      envelope: { run_id: "run-live", status: "running", provider_condition: null },
    });
    expect(status.provider_condition).toBeUndefined();
    expect(status.failure_reason).toBeUndefined();
  });

  it("retains a legacy profile-backed assignment as read-only run evidence", () => {
    const status = adaptRunStatus({
      envelope: {
        run_id: "legacy-run",
        status: "running",
        assignments: [
          {
            role_id: "writer",
            agent_id: "writer-agent",
            provider_id: "legacy-provider-id",
            model_name: "legacy-frozen-model",
          },
        ],
      },
    });
    expect(status.frozen_assignment).toBeUndefined();
    expect(status.assignments).toEqual([
      {
        role_id: "writer",
        agent_id: "writer-agent",
        provider_id: "legacy-provider-id",
        model_name: "legacy-frozen-model",
      },
    ]);
  });

  it("admits only complete frozen run evidence and drops extra provenance fields", () => {
    const status = adaptRunStatus({
      envelope: {
        run_id: "frozen-run",
        status: "running",
        frozen_assignment: {
          schema_version: 1,
          digest:
            "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          assignments: [
            {
              role_id: "writer",
              agent_id: "writer-agent",
              provider_id: "provider-issued-id",
              provider_display_name: "Provider-issued display",
              execution_mode: "execution-lane-issued-id",
              catalog_revision: "catalog-revision-issued-id",
              entry_id: "entry-issued-id",
              model_name: "provider-issued-model-value",
              model_display_name: "Provider-issued model display",
              controls: [
                {
                  control_id: "provider-native-control",
                  option_id: "provider-option",
                  provider_value: "provider-issued-native-value",
                  display_name: "Provider-native control",
                  option_display_name: "Provider-native option",
                },
              ],
              fallbacks: [
                {
                  provider_id: "fallback-provider-issued-id",
                  provider_display_name: "Fallback provider display",
                  execution_mode: "fallback-execution-lane-issued-id",
                  catalog_revision: "fallback-catalog-revision-issued-id",
                  entry_id: "fallback-entry-issued-id",
                  model_name: "fallback-provider-issued-model-value",
                  controls: [],
                },
              ],
              provenance: {
                selection_source: "role_override",
                api_key: "must-never-reach-the-header",
              },
            },
          ],
        },
      },
    });

    expect(status.frozen_assignment).toEqual({
      schema_version: 1,
      digest: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      assignments: [
        {
          role_id: "writer",
          agent_id: "writer-agent",
          provider_id: "provider-issued-id",
          provider_display_name: "Provider-issued display",
          execution_mode: "execution-lane-issued-id",
          catalog_revision: "catalog-revision-issued-id",
          entry_id: "entry-issued-id",
          model_name: "provider-issued-model-value",
          model_display_name: "Provider-issued model display",
          controls: [
            {
              control_id: "provider-native-control",
              option_id: "provider-option",
              provider_value: "provider-issued-native-value",
              display_name: "Provider-native control",
              option_display_name: "Provider-native option",
            },
          ],
          fallbacks: [
            {
              provider_id: "fallback-provider-issued-id",
              provider_display_name: "Fallback provider display",
              execution_mode: "fallback-execution-lane-issued-id",
              catalog_revision: "fallback-catalog-revision-issued-id",
              entry_id: "fallback-entry-issued-id",
              model_name: "fallback-provider-issued-model-value",
              controls: [],
            },
          ],
          provenance: { selection_source: "role_override" },
        },
      ],
    });
    expect(JSON.stringify(status)).not.toContain("must-never-reach-the-header");
  });

  it("drops an incomplete catalog-shaped frozen assignment rather than presenting a partial history", () => {
    const status = adaptRunStatus({
      envelope: {
        run_id: "partial-frozen-run",
        status: "running",
        frozen_assignment: {
          schema_version: 1,
          digest:
            "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          assignments: [
            {
              role_id: "writer",
              provider_id: "provider-issued-id",
              execution_mode: "execution-lane-issued-id",
              catalog_revision: "catalog-revision-issued-id",
              entry_id: "entry-issued-id",
              model_name: "provider-issued-model-value",
              controls: [],
              fallbacks: [],
              provenance: { selection_source: "not-a-served-source" },
            },
          ],
        },
        assignments: [
          {
            role_id: "legacy-writer",
            provider_id: "legacy-provider",
            model_name: "legacy-model",
          },
        ],
      },
    });

    expect(status.frozen_assignment).toBeUndefined();
    expect(status.frozen_assignment_invalid).toBe(true);
    expect(status.assignments).toEqual([]);
  });

  it("fails closed for an unknown schema or duplicate frozen identities", () => {
    const fallback = {
      provider_id: "fallback-provider-issued-id",
      execution_mode: "fallback-execution-lane-issued-id",
      catalog_revision: "fallback-catalog-revision-issued-id",
      entry_id: "fallback-entry-issued-id",
      model_name: "fallback-provider-issued-model-value",
      controls: [],
    };
    const assignment = {
      role_id: "writer",
      provider_id: "provider-issued-id",
      execution_mode: "execution-lane-issued-id",
      catalog_revision: "catalog-revision-issued-id",
      entry_id: "entry-issued-id",
      model_name: "provider-issued-model-value",
      controls: [
        {
          control_id: "provider-native-control-issued-id",
          option_id: "provider-native-option-issued-id",
          provider_value: "provider-native-value",
        },
      ],
      fallbacks: [],
      provenance: { selection_source: "team_selection" },
    };
    const frozen = {
      schema_version: 1,
      digest: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      assignments: [assignment],
    };

    for (const malformed of [
      { ...frozen, schema_version: 2 },
      { ...frozen, assignments: [assignment, { ...assignment }] },
      {
        ...frozen,
        assignments: [
          {
            ...assignment,
            controls: [...assignment.controls, { ...assignment.controls[0]! }],
          },
        ],
      },
      {
        ...frozen,
        assignments: [{ ...assignment, fallbacks: [fallback, { ...fallback }] }],
      },
    ]) {
      const status = adaptRunStatus({
        envelope: {
          run_id: "rejected-frozen-run",
          status: "running",
          frozen_assignment: malformed,
        },
      });
      expect(status.frozen_assignment).toBeUndefined();
    }
  });

  it("floors a sparse status body without throwing", () => {
    const status = adaptRunStatus({ envelope: {} });
    expect(status.status).toBe("unknown");
    expect(status.proposal_ids).toEqual([]);
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

describe("provider catalog query authority and refresh cadence", () => {
  const servedProvider = (
    providerId: string,
    expiresAt: string,
    status = "available",
  ) => ({
    provider_id: providerId,
    execution_mode: `${providerId}-execution-mode`,
    health: {
      configured: "available",
      transport: "available",
      authentication: "authenticated",
      catalog: status,
      admission: "admitted",
      selectable: true,
    },
    catalog: {
      schema_version: 1,
      state: {
        status,
        revision: `${providerId}-revision`,
        checked_at: "2031-01-01T00:00:00.000Z",
        expires_at: expiresAt,
      },
      models: [{ entry_id: `${providerId}-entry`, capabilities: [] }],
      native_controls: [],
    },
  });

  it("never retains a catalog across an authority-scope key change", () => {
    const first = providerCatalogQueryOptions("scope-a", true) as Record<
      string,
      unknown
    >;
    const second = providerCatalogQueryOptions("scope-b", true) as Record<
      string,
      unknown
    >;

    expect(first.queryKey).toEqual(["a2a", "provider-catalog", "scope-a"]);
    expect(second.queryKey).toEqual(["a2a", "provider-catalog", "scope-b"]);
    expect(first.placeholderData).toBeUndefined();
    expect(second.placeholderData).toBeUndefined();
  });

  it("schedules the next GET at the earliest served selectable expiry", () => {
    const catalog = adaptProviderCatalog({
      envelope: {
        api_version: "v1",
        providers: [
          servedProvider("later", "2031-01-01T00:00:09.000Z"),
          servedProvider("earlier", "2031-01-01T00:00:03.000Z"),
        ],
      },
    });
    const now = Date.parse("2031-01-01T00:00:00.000Z");

    expect(
      providerCatalogRefetchInterval(
        { state: { data: catalog, dataUpdateCount: 0 } },
        now,
      ),
    ).toBe(3_000);
  });

  it("bounds a distant expiry and backs off while A2A serves stale evidence", () => {
    const now = Date.parse("2031-01-01T00:00:00.000Z");
    const farFuture = adaptProviderCatalog({
      envelope: {
        api_version: "v1",
        providers: [servedProvider("future", "2031-01-01T02:00:00.000Z")],
      },
    });
    const stale = adaptProviderCatalog({
      envelope: {
        api_version: "v1",
        providers: [servedProvider("stale", "2031-01-01T00:00:01.000Z", "stale")],
      },
    });

    expect(
      providerCatalogRefetchInterval(
        { state: { data: farFuture, dataUpdateCount: 0 } },
        now,
      ),
    ).toBe(60 * 60_000);
    expect(
      providerCatalogRefetchInterval(
        { state: { data: stale, dataUpdateCount: 0 } },
        now,
      ),
    ).toBe(PROVIDER_CATALOG_STALE_REFETCH_BASE_MS);
    expect(
      providerCatalogRefetchInterval(
        { state: { data: stale, dataUpdateCount: 1 } },
        now,
      ),
    ).toBe(PROVIDER_CATALOG_STALE_REFETCH_BASE_MS * 2);
    expect(
      providerCatalogRefetchInterval(
        { state: { data: stale, dataUpdateCount: 99 } },
        now,
      ),
    ).toBe(PROVIDER_CATALOG_STALE_REFETCH_MAX_MS);
  });
});
