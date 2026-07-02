// @vitest-environment happy-dom
//
// Session + settings client and restore/persistence behavior (user-state-
// persistence W04.P10.S33). Everything runs through the SAME client the live
// app uses, over the REAL `vaultspec serve` engine spawned for the test run —
// no in-memory double. A passing test exercised the genuine client → wire →
// engine path. The engine's session store is shared and persistent across the
// run, so these assert ROUND-TRIP behavior and invariants (write X → read X
// back; a pushed recent is at the front; a write survives a later write), never
// "starts empty" preconditions that a shared live surface cannot guarantee.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLiveClient, liveScope } from "../../testing/liveClient";
import { DEFAULT_CHOICES } from "../view/filters";
import { useLensStore } from "../view/lenses";
import { usePinStore } from "../view/pins";
import { useViewStore } from "../view/viewStore";
import { EngineError } from "./engine";
import {
  deriveAcceptedScopeContextMirror,
  deriveDurableWorkspaceLayoutView,
  deriveSessionScopeRestoreIntent,
  normalizeDurableWorkspaceLayoutWrite,
  normalizeScopeContextWrite,
  restoredSessionContextSeed,
} from "./sessionContext";
import {
  deriveActiveScope,
  engineKeys,
  isSupersededScopeSwitch,
  isSupersededWorkspaceSwitch,
  normalizeAcceptedWorkspaceSwitchState,
  normalizeActiveScopeSwitchScope,
  normalizeWorkspaceSwitchIntent,
  switchActiveScope,
  useActiveScope,
  usePutSession,
  useSession,
  useSettings,
  useSwapWorkspace,
} from "./queries";
import { ENGINE_WAIT } from "../../testing/timing";

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

/** A QueryClient with retries off so a deliberate 400 rejects immediately. */
function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/** Unique per-test marker so round-trip assertions never collide on shared state. */
let seq = 0;
const mark = () => `m${Date.now().toString(36)}-${seq++}`;

// --- the typed client over the live wire ----------------------------------------

describe("session/settings client (live engine)", () => {
  it("GET /session returns the workspace, active scope, context shape, and recents", async () => {
    const scope = await liveScope();
    const session = await createLiveClient().session();
    expect(session.workspace).toBeTypeOf("string");
    expect(session.workspace.length).toBeGreaterThan(0);
    expect(session.active_scope).toBe(scope);
    // The context envelope shape always rides (folder + feature_tags keys).
    expect(session.scope_context).toHaveProperty("folder");
    expect(Array.isArray(session.scope_context.feature_tags)).toBe(true);
    expect(Array.isArray(session.recents)).toBe(true);
    // The tiers block always rides through (every-wire-response-carries-tiers).
    expect(session.tiers).toBeTypeOf("object");
  });

  it("PUT /session persists scope_context + push_recent and reads back", async () => {
    const client = createLiveClient();
    const tag = mark();
    const recent = `recent-${mark()}`;
    const updated = await client.putSession({
      scope_context: { folder: "plan", feature_tags: [tag] },
      push_recent: recent,
    });
    expect(updated.scope_context.folder).toBe("plan");
    expect(updated.scope_context.feature_tags).toEqual([tag]);
    // The pushed value is at the FRONT of recents.
    expect(updated.recents[0]).toBe(recent);
    // A fresh GET reflects the same persisted state.
    const reread = await client.session();
    expect(reread.scope_context.folder).toBe("plan");
    expect(reread.scope_context.feature_tags).toEqual([tag]);
  });

  it("PUT /session merges folder context and durable workspace layout", async () => {
    const client = createLiveClient();
    const scope = await liveScope();
    const tag = mark();
    const layoutA = JSON.stringify({
      v: 1,
      tabs: [{ nodeId: `doc:${tag}-a`, surface: "markdown" }],
      active: `doc:${tag}-a`,
    });
    const layoutB = JSON.stringify({
      v: 1,
      tabs: [{ nodeId: `doc:${tag}-b`, surface: "markdown" }],
      active: `doc:${tag}-b`,
    });

    await client.putSession({ active_scope: scope });
    await client.putSession({
      set_workspace_layout: { scope, layout: layoutA },
    });
    const withContext = await client.putSession({
      scope_context: {
        scope,
        folder: "plan",
        feature_tags: [tag],
      },
    });

    expect(withContext.scope_context).toMatchObject({
      folder: "plan",
      feature_tags: [tag],
      workspace_layout: layoutA,
    });

    const withLayout = await client.putSession({
      set_workspace_layout: { scope, layout: layoutB },
    });

    expect(withLayout.scope_context).toMatchObject({
      folder: "plan",
      feature_tags: [tag],
      workspace_layout: layoutB,
    });
  });

  it("PUT /session with an unknown active_scope is a tiered 400, scope unchanged", async () => {
    const client = createLiveClient();
    const scope = await liveScope();
    await expect(
      client.putSession({ active_scope: "wt-does-not-exist" }),
    ).rejects.toBeInstanceOf(EngineError);
    // The active scope is left unchanged (the live route's behavior).
    const after = await client.session();
    expect(after.active_scope).toBe(scope);
  });

  it("the tiered 400 carries the tiers block on the error envelope", async () => {
    const client = createLiveClient();
    const err = await client
      .putSession({ active_scope: "nope" })
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EngineError);
    expect((err as EngineError).status).toBe(400);
    // Degradation truth flows through the error path, not a bare failure.
    expect((err as EngineError).tiers).toBeTypeOf("object");
  });

  it("push_recent dedup-moves an existing value to the front", async () => {
    const client = createLiveClient();
    const a = `a-${mark()}`;
    const b = `b-${mark()}`;
    await client.putSession({ push_recent: a });
    await client.putSession({ push_recent: b });
    const s = await client.putSession({ push_recent: a });
    // "a" moves to the front with no duplicate; "b" trails it.
    expect(s.recents[0]).toBe(a);
    expect(s.recents.filter((r) => r === a)).toHaveLength(1);
    expect(s.recents.indexOf(b)).toBeGreaterThan(0);
  });

  it("GET /settings returns object-shaped global + scoped maps with tiers", async () => {
    const settings = await createLiveClient().settings();
    expect(settings.global).toBeTypeOf("object");
    expect(settings.scoped).toBeTypeOf("object");
    expect(settings.tiers).toBeTypeOf("object");
  });

  it("PUT /settings persists a global key and a scoped key, each surviving the other", async () => {
    const client = createLiveClient();
    const scope = await liveScope();
    const afterGlobal = await client.putSettings({ key: "theme", value: "dark" });
    expect(afterGlobal.global.theme).toBe("dark");
    // A registry-declared, scope-eligible setting (dashboard-settings validates writes).
    const afterScoped = await client.putSettings({
      scope,
      key: "default_granularity",
      value: "document",
    });
    expect(afterScoped.scoped[scope].default_granularity).toBe("document");
    // Global key survives the scoped write.
    expect(afterScoped.global.theme).toBe("dark");
  });

  it("scoped settings omit a scope that has never been written", async () => {
    const settings = await createLiveClient().settings();
    expect(settings.scoped["wt-never-written-xyz"]).toBeUndefined();
  });
});

// --- restore-on-load through stores hooks ---------------------------------------

describe("deriveActiveScope", () => {
  it("uses one precedence order for global data subscriptions", () => {
    expect(deriveActiveScope("picked", "persisted", "fallback")).toBe("picked");
    expect(deriveActiveScope(null, "persisted", "fallback")).toBe("persisted");
    expect(deriveActiveScope(null, null, "fallback")).toBe("fallback");
    expect(deriveActiveScope(null, undefined, null)).toBeNull();
  });
});

describe("deriveSessionScopeRestoreIntent", () => {
  const base = {
    attempted: false,
    pickedScope: null,
    sessionReady: true,
    persistedScope: null,
    fallbackScope: "fallback",
    mutationIdle: true,
  };

  it("persists only the cold-start fallback scope", () => {
    expect(deriveSessionScopeRestoreIntent(base)).toBe("fallback");
    expect(deriveSessionScopeRestoreIntent({ ...base, attempted: true })).toBeNull();
    expect(
      deriveSessionScopeRestoreIntent({ ...base, pickedScope: "picked" }),
    ).toBeNull();
    expect(
      deriveSessionScopeRestoreIntent({ ...base, sessionReady: false }),
    ).toBeNull();
    expect(
      deriveSessionScopeRestoreIntent({ ...base, persistedScope: "persisted" }),
    ).toBeNull();
    expect(
      deriveSessionScopeRestoreIntent({ ...base, fallbackScope: null }),
    ).toBeNull();
    expect(
      deriveSessionScopeRestoreIntent({ ...base, mutationIdle: false }),
    ).toBeNull();
  });
});

describe("deriveAcceptedScopeContextMirror", () => {
  const session = {
    active_scope: "scope-a",
    scope_context: { folder: "adr", feature_tags: ["ctx"] },
  };

  it("mirrors only the latest accepted scope-context response", () => {
    expect(
      deriveAcceptedScopeContextMirror({
        writeSeq: 2,
        currentSeq: 2,
        writeScope: "scope-a",
        activeScope: "scope-a",
        session,
      }),
    ).toEqual({ folder: "adr", featureTags: ["ctx"] });
    expect(
      deriveAcceptedScopeContextMirror({
        writeSeq: 1,
        currentSeq: 2,
        writeScope: "scope-a",
        activeScope: "scope-a",
        session,
      }),
    ).toBeNull();
    expect(
      deriveAcceptedScopeContextMirror({
        writeSeq: 2,
        currentSeq: 2,
        writeScope: "scope-a",
        activeScope: "scope-b",
        session,
      }),
    ).toBeNull();
    expect(
      deriveAcceptedScopeContextMirror({
        writeSeq: 2,
        currentSeq: 2,
        writeScope: "scope-b",
        activeScope: "scope-b",
        session,
      }),
    ).toBeNull();
  });

  it("normalizes accepted scope-context mirror payloads before store ingestion", () => {
    expect(
      deriveAcceptedScopeContextMirror({
        writeSeq: 2,
        currentSeq: 2,
        writeScope: " scope-a ",
        activeScope: "scope-a",
        session: {
          active_scope: " scope-a ",
          scope_context: {
            folder: " .vault/adr ",
            feature_tags: [" ctx ", "ctx", "", 7],
          },
        },
      }),
    ).toEqual({ folder: ".vault/adr", featureTags: ["ctx"] });

    expect(
      deriveAcceptedScopeContextMirror({
        writeSeq: 2,
        currentSeq: 2,
        writeScope: "   ",
        activeScope: "scope-a",
        session: {
          active_scope: "scope-b",
          scope_context: {
            folder: { raw: ".vault/adr" },
            feature_tags: [" kept "],
          },
        },
      }),
    ).toEqual({ folder: null, featureTags: ["kept"] });
  });
});

describe("restoredSessionContextSeed", () => {
  it("normalizes restored session context before seeding the view store", () => {
    expect(
      restoredSessionContextSeed(null, {
        workspace: " workspace-a ",
        active_scope: " scope-a ",
        active_workspace: " project-a ",
        scope_context: {
          folder: " .vault/plan ",
          feature_tags: [" feature-a ", "feature-a", "", 7],
          workspace_layout: JSON.stringify({
            v: 1,
            tabs: [{ nodeId: " doc:a ", surface: "markdown" }],
            active: " doc:a ",
          }),
        },
        recents: [],
        tiers: {},
      }),
    ).toMatchObject({
      workspace: "project-a",
      scope: "scope-a",
      folder: ".vault/plan",
      featureTags: ["feature-a"],
      openDocs: [{ nodeId: "doc:a", surface: "markdown", provisional: false }],
      activeDocId: "doc:a",
    });
  });

  it("treats malformed picked scope as no picked scope", () => {
    expect(
      restoredSessionContextSeed(
        { scope: "scope-a" },
        {
          workspace: "workspace-a",
          active_scope: "scope-a",
          active_workspace: null,
          scope_context: { folder: null, feature_tags: [] },
          recents: [],
          tiers: {},
        },
      ),
    ).toMatchObject({
      workspace: "workspace-a",
      scope: "scope-a",
    });
  });
});

describe("deriveDurableWorkspaceLayoutView", () => {
  const session = {
    active_scope: "scope-a",
    scope_context: {
      folder: null,
      feature_tags: [],
      workspace_layout: JSON.stringify({
        v: 1,
        tabs: [{ nodeId: "doc:a", surface: "markdown" }],
        active: "doc:a",
      }),
    },
  };

  it("serves the durable dock layout only for the accepted active scope", () => {
    expect(deriveDurableWorkspaceLayoutView("scope-a", true, session)).toEqual({
      blob: session.scope_context.workspace_layout,
      settled: true,
    });
    expect(deriveDurableWorkspaceLayoutView("scope-b", true, session)).toEqual({
      blob: null,
      settled: false,
    });
    expect(deriveDurableWorkspaceLayoutView(null, true, session)).toEqual({
      blob: null,
      settled: false,
    });
    expect(deriveDurableWorkspaceLayoutView("scope-a", false, session)).toEqual({
      blob: session.scope_context.workspace_layout,
      settled: false,
    });
  });

  it("normalizes accepted scope and suppresses blank durable layout blobs", () => {
    expect(
      deriveDurableWorkspaceLayoutView(" scope-a ", true, {
        active_scope: "scope-a",
        scope_context: {
          folder: null,
          feature_tags: [],
          workspace_layout: "   ",
        },
      }),
    ).toEqual({ blob: null, settled: true });
  });
});

describe("normalizeDurableWorkspaceLayoutWrite", () => {
  it("normalizes scope-context write identity", () => {
    expect(
      normalizeScopeContextWrite(" scope-a ", " .vault/adr ", [
        " feature-a ",
        "feature-a",
        "",
        7,
      ]),
    ).toEqual({
      scope: "scope-a",
      folder: ".vault/adr",
      featureTags: ["feature-a"],
    });
    expect(normalizeScopeContextWrite({ scope: "scope-a" }, 42, "tag")).toEqual({
      scope: null,
      folder: null,
      featureTags: [],
    });
  });

  it("normalizes durable workspace layout write identity", () => {
    expect(normalizeDurableWorkspaceLayoutWrite(" scope-a ", ' {"v":1} ')).toEqual({
      scope: "scope-a",
      blob: '{"v":1}',
    });
    expect(normalizeDurableWorkspaceLayoutWrite("", "blob")).toEqual({
      scope: null,
      blob: "blob",
    });
    expect(normalizeDurableWorkspaceLayoutWrite("scope-a", { blob: "bad" })).toEqual({
      scope: "scope-a",
      blob: null,
    });
    expect(
      normalizeDurableWorkspaceLayoutWrite("scope-a", "x".repeat(65 * 1024)),
    ).toEqual({
      scope: "scope-a",
      blob: null,
    });
  });
});

describe("restore-on-load (useActiveScope over the session hook)", () => {
  beforeEach(() => {
    // Reset the shared view store so a previous test's pick does not leak.
    useViewStore.setState({ scope: null, activeFolder: null, featureContexts: [] });
  });
  afterEach(() => {
    useViewStore.setState({ scope: null, activeFolder: null, featureContexts: [] });
  });

  it("returns the persisted active_scope from the session, not a recomputed default", async () => {
    const scope = await liveScope();
    // Persist the fixture scope as the active selection, then mount the read path.
    await createLiveClient().putSession({ active_scope: scope });

    const qc = testQueryClient();
    const { result } = renderHook(() => useActiveScope(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current).toBe(scope), ENGINE_WAIT);
  });

  it("an explicit in-session pick (viewStore.scope) wins over the persisted scope", async () => {
    const qc = testQueryClient();
    // The user picked a scope this session — it must win the precedence.
    useViewStore.setState({ scope: "wt-pick" });
    const { result } = renderHook(() => useActiveScope(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current).toBe("wt-pick"), ENGINE_WAIT);
  });
});

// --- selection persistence through the mutation hook ----------------------------

describe("selection persistence (usePutSession)", () => {
  it("persists scope_context and the subsequent useSession read reflects it", async () => {
    const qc = testQueryClient();
    const tag = mark();

    const { result } = renderHook(
      () => ({ put: usePutSession(), session: useSession() }),
      { wrapper: wrapper(qc) },
    );
    await waitFor(
      () => expect(result.current.session.isSuccess).toBe(true),
      ENGINE_WAIT,
    );

    result.current.put.mutate({
      scope_context: { folder: "adr", feature_tags: [tag] },
    });

    // The mutation's onSuccess seeds the session cache; the read reflects it.
    await waitFor(
      () => expect(result.current.session.data?.scope_context.folder).toBe("adr"),
      ENGINE_WAIT,
    );
    expect(result.current.session.data?.scope_context.feature_tags).toEqual([tag]);
  });

  it("the settings read resolves to an object-shaped global map", async () => {
    const qc = testQueryClient();
    const { result } = renderHook(
      () => ({ settings: useSettings(), put: usePutSession() }),
      { wrapper: wrapper(qc) },
    );
    await waitFor(
      () => expect(result.current.settings.isSuccess).toBe(true),
      ENGINE_WAIT,
    );
    expect(result.current.settings.data?.global).toBeTypeOf("object");
  });
});

// --- active scope switch orchestration ------------------------------------------

describe("active scope switching", () => {
  afterEach(() => {
    useViewStore.setState({
      scope: null,
      activeFolder: null,
      featureContexts: [],
      selection: null,
      workingSet: [],
      openedIds: [],
    });
    usePinStore.setState({ pinnedIds: [], workspace: "default", scope: "default" });
    useLensStore.setState({ saved: [], workspace: "default", scope: "default" });
  });

  it("resets scoped view state and persists active_scope through one stores action", async () => {
    const qc = testQueryClient();
    const scope = await liveScope();
    const tag = mark();
    await createLiveClient().putSession({
      scope_context: { scope, folder: "plan", feature_tags: [tag] },
    });

    useViewStore.getState().setScope("old-scope");
    useViewStore.getState().setScopeContext({
      folder: ".vault/adr",
      featureTags: ["old-feature"],
    });
    useViewStore.getState().addToWorkingSet("doc:old");
    useViewStore.getState().openNode("doc:old");
    useViewStore
      .getState()
      .selectEntity({ kind: "event", id: "evt-old", nodeIds: ["doc:old"] });

    const session = await switchActiveScope(scope, qc);

    expect(session.active_scope).toBe(scope);
    expect(qc.getQueryData(engineKeys.session())).toMatchObject({
      active_scope: scope,
    });
    expect(useViewStore.getState()).toMatchObject({
      scope,
      activeFolder: "plan",
      featureContexts: [tag],
      selection: null,
      workingSet: [],
      openedIds: [],
    });
    await expect(createLiveClient().session()).resolves.toMatchObject({
      active_scope: scope,
      scope_context: {
        folder: "plan",
        feature_tags: [tag],
      },
    });
  });

  it("does not advance local scope when the session rejects the switch", async () => {
    const qc = testQueryClient();
    const scope = await liveScope();
    await createLiveClient().putSession({ active_scope: scope });
    useViewStore.getState().setScope(scope);

    await expect(switchActiveScope("wt-does-not-exist", qc)).rejects.toBeInstanceOf(
      EngineError,
    );

    expect(useViewStore.getState().scope).toBe(scope);
    await expect(createLiveClient().session()).resolves.toMatchObject({
      active_scope: scope,
    });
  });

  it("rejects blank scope switches before local scope can move", async () => {
    const qc = testQueryClient();
    const scope = await liveScope();
    useViewStore.getState().setScope(scope);

    expect(normalizeActiveScopeSwitchScope(` ${scope} `)).toBe(scope);

    await expect(switchActiveScope("   ", qc)).rejects.toThrow(
      "scope switch requires a non-empty scope",
    );
    await expect(switchActiveScope({ scope }, qc)).rejects.toThrow(
      "scope switch requires a non-empty scope",
    );

    expect(useViewStore.getState().scope).toBe(scope);
  });

  it("normalizes padded scope switches before session persistence", async () => {
    const qc = testQueryClient();
    const scope = await liveScope();
    useViewStore.getState().setScope("old-scope");

    const session = await switchActiveScope(` ${scope} `, qc);

    expect(session.active_scope).toBe(scope);
    expect(useViewStore.getState().scope).toBe(scope);
    await expect(createLiveClient().session()).resolves.toMatchObject({
      active_scope: scope,
    });
  });

  it("normalizes workspace switch intent and accepted session view state", () => {
    expect(normalizeWorkspaceSwitchIntent(" workspace-a ", " scope-a ")).toEqual({
      workspace: "workspace-a",
      scope: "scope-a",
    });
    expect(normalizeWorkspaceSwitchIntent("workspace-a", { scope: "scope-a" })).toEqual(
      {
        workspace: "workspace-a",
        scope: null,
      },
    );
    expect(() => normalizeWorkspaceSwitchIntent("   ", "scope-a")).toThrow(
      "workspace switch requires a non-empty workspace",
    );
    expect(
      normalizeAcceptedWorkspaceSwitchState(
        { active_workspace: " accepted-workspace ", active_scope: " accepted-scope " },
        { workspace: "fallback-workspace", scope: "fallback-scope" },
      ),
    ).toEqual({ workspace: "accepted-workspace", scope: "accepted-scope" });
    expect(
      normalizeAcceptedWorkspaceSwitchState(
        { active_workspace: null, active_scope: "   " },
        { workspace: "fallback-workspace", scope: "fallback-scope" },
      ),
    ).toEqual({ workspace: "fallback-workspace", scope: "fallback-scope" });
  });

  it("treats an older in-flight scope switch as superseded by newer intent", async () => {
    const qc = testQueryClient();
    const scope = await liveScope();
    await createLiveClient().putSession({ active_scope: scope });
    useViewStore.getState().setScope(scope);

    const stale = switchActiveScope("wt-does-not-exist", qc).catch((error) => error);
    const latest = switchActiveScope(scope, qc);

    const staleError = await stale;
    expect(isSupersededScopeSwitch(staleError)).toBe(true);

    await expect(latest).resolves.toMatchObject({ active_scope: scope });
    expect(useViewStore.getState().scope).toBe(scope);
    await expect(createLiveClient().session()).resolves.toMatchObject({
      active_scope: scope,
    });
  });

  it("does not advance local workspace state when the session rejects the workspace", async () => {
    const qc = testQueryClient();
    const scope = await liveScope();
    const session = await createLiveClient().session();
    const workspace = session.active_workspace ?? session.workspace;
    useViewStore.getState().setScope(scope);
    usePinStore.setState({ pinnedIds: [], workspace, scope });
    useLensStore.setState({ saved: [], workspace, scope });

    const { result } = renderHook(() => useSwapWorkspace(), { wrapper: wrapper(qc) });

    await expect(
      result.current.swap("workspace-does-not-exist", "wt-does-not-exist"),
    ).rejects.toBeInstanceOf(EngineError);

    expect(useViewStore.getState().scope).toBe(scope);
    expect(usePinStore.getState()).toMatchObject({ workspace, scope });
    expect(useLensStore.getState()).toMatchObject({ workspace, scope });
    await expect(createLiveClient().session()).resolves.toMatchObject({
      active_scope: scope,
      active_workspace: session.active_workspace,
    });
  });

  it("treats an older in-flight workspace switch as superseded by newer intent", async () => {
    const qc = testQueryClient();
    const scope = await liveScope();
    const client = createLiveClient();
    const registry = await client.workspaces();
    const workspace = registry.active_workspace ?? registry.workspaces[0]?.id;
    if (!workspace) throw new Error("live fixture has no registered workspace");
    await client.putSession({ active_workspace: workspace, active_scope: scope });
    useViewStore.getState().setScope(scope);
    usePinStore.setState({ pinnedIds: [], workspace, scope });
    useLensStore.setState({ saved: [], workspace, scope });

    const { result } = renderHook(() => useSwapWorkspace(), { wrapper: wrapper(qc) });

    const stale = result.current
      .swap("workspace-does-not-exist", "wt-does-not-exist")
      .catch((error) => error);
    const latest = result.current.swap(workspace, scope);

    const staleError = await stale;
    expect(isSupersededWorkspaceSwitch(staleError)).toBe(true);

    await expect(latest).resolves.toMatchObject({
      active_scope: scope,
      active_workspace: workspace,
    });
    expect(useViewStore.getState().scope).toBe(scope);
    expect(usePinStore.getState()).toMatchObject({ workspace, scope });
    expect(useLensStore.getState()).toMatchObject({ workspace, scope });
    await expect(client.session()).resolves.toMatchObject({
      active_scope: scope,
      active_workspace: workspace,
    });
  });

  it("mirrors the accepted workspace switch scope context after the reset", async () => {
    const qc = testQueryClient();
    const scope = await liveScope();
    const client = createLiveClient();
    const session = await client.session();
    const workspace = session.active_workspace ?? session.workspace;
    const tag = mark();
    await client.putSession({
      scope_context: { scope, folder: "adr", feature_tags: [tag] },
    });
    useViewStore.getState().setScope("old-scope");
    useViewStore.getState().setScopeContext({
      folder: "plan",
      featureTags: ["old-feature"],
    });

    const { result } = renderHook(() => useSwapWorkspace(), { wrapper: wrapper(qc) });

    await expect(
      result.current.swap(` ${workspace} `, ` ${scope} `),
    ).resolves.toMatchObject({
      active_scope: scope,
      active_workspace: workspace,
      scope_context: {
        folder: "adr",
        feature_tags: [tag],
      },
    });
    expect(useViewStore.getState()).toMatchObject({
      scope,
      activeFolder: "adr",
      featureContexts: [tag],
    });
  });
});

// --- view-store seeding + wholesale-reset semantics -----------------------------
// Pure store logic — no engine surface; unchanged by the live migration.

describe("view store scope-context (seed + wholesale reset)", () => {
  afterEach(() => {
    useViewStore.setState({ scope: null, activeFolder: null, featureContexts: [] });
    usePinStore.setState({ pinnedIds: [], workspace: "default", scope: "default" });
    useLensStore.setState({ saved: [], workspace: "default", scope: "default" });
  });

  it("seedFromSession mirrors the restored context without the wholesale reset", () => {
    useViewStore.getState().addToWorkingSet("keep-me");
    useViewStore.getState().seedFromSession({
      workspace: "workspace-a",
      scope: "scope-a",
      folder: "plan",
      featureTags: ["f1", "f2"],
    });
    const s = useViewStore.getState();
    expect(s.scope).toBe("scope-a");
    expect(s.activeFolder).toBe("plan");
    expect(s.featureContexts).toEqual(["f1", "f2"]);
    // The restore did not wipe ephemeral working state.
    expect(s.workingSet).toContain("keep-me");
  });

  it("seedFromSession rekeys scoped client stores without the wholesale reset", () => {
    useViewStore.getState().addToWorkingSet("keep-me");
    usePinStore.setState({
      pinnedIds: ["source:pinned"],
      workspace: "source-workspace",
      scope: "restore-source",
    });
    useLensStore.setState({
      saved: [{ name: "source lens", choices: structuredClone(DEFAULT_CHOICES) }],
      workspace: "source-workspace",
      scope: "restore-source",
    });

    useViewStore.getState().seedFromSession({
      workspace: "restore-workspace",
      scope: "restore-target",
      folder: "plan",
      featureTags: ["f1"],
    });

    expect(useViewStore.getState().workingSet).toContain("keep-me");
    expect(usePinStore.getState()).toMatchObject({
      workspace: "restore-workspace",
      scope: "restore-target",
      pinnedIds: [],
    });
    expect(useLensStore.getState().workspace).toBe("restore-workspace");
    expect(useLensStore.getState().scope).toBe("restore-target");
    expect(useLensStore.getState().choicesFor("source lens")).toBeNull();
  });

  it("setScope clears the folder context wholesale on a swap", () => {
    useViewStore.getState().seedFromSession({
      workspace: "workspace-a",
      scope: "scope-a",
      folder: "adr",
      featureTags: ["x"],
    });
    useViewStore.getState().setScope("wt-other");
    const s = useViewStore.getState();
    // The previous corpus's folder context must not bleed into the new scope.
    expect(s.activeFolder).toBeNull();
    expect(s.featureContexts).toEqual([]);
    expect(s.scope).toBe("wt-other");
  });
});
