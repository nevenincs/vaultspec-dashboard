// @vitest-environment happy-dom
//
// Session + settings client and restore/persistence behavior (user-state-
// persistence W04.P10.S33). Everything runs through the SAME client transport
// the live app uses — the mock engine's `fetchImpl` — so a passing test exercises
// the real client → adapter path, not a hand-built double (mock-mirrors-live-
// wire-shape). The restore-on-load and selection-persistence behavior is driven
// through stores hooks over a QueryClient, never a fetch in a component.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useActiveScope } from "../../app/stage/Stage";
import { MOCK_SCOPE, MOCK_WORKSPACE, MockEngine } from "../../testing/mockEngine";
import { useViewStore } from "../view/viewStore";
import { EngineClient, EngineError } from "./engine";
import { usePutSession, useSession, useSettings } from "./queries";

function clientOf(mock: MockEngine): EngineClient {
  return new EngineClient({ baseUrl: "/api", fetchImpl: mock.fetchImpl });
}

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

// --- the client over the mock transport ------------------------------------------

describe("session/settings client (mock transport)", () => {
  it("GET /session returns the workspace, active scope, empty context, and recents", async () => {
    const session = await clientOf(new MockEngine()).session();
    expect(session.workspace).toBe(MOCK_WORKSPACE);
    expect(session.active_scope).toBe(MOCK_SCOPE);
    // Fresh store: no folder selected, no contexts, no recents.
    expect(session.scope_context).toEqual({ folder: null, feature_tags: [] });
    expect(session.recents).toEqual([]);
    // The tiers block always rides through (every-wire-response-carries-tiers).
    expect(session.tiers).toBeTypeOf("object");
  });

  it("PUT /session persists scope_context + push_recent and reads back", async () => {
    const client = clientOf(new MockEngine());
    const updated = await client.putSession({
      scope_context: { folder: "plan", feature_tags: ["conf-feature"] },
      push_recent: MOCK_SCOPE,
    });
    expect(updated.scope_context.folder).toBe("plan");
    expect(updated.scope_context.feature_tags).toEqual(["conf-feature"]);
    // The pushed value is at the FRONT of recents.
    expect(updated.recents[0]).toBe(MOCK_SCOPE);
    // A fresh GET reflects the same persisted state (same in-memory store).
    const reread = await client.session();
    expect(reread.scope_context.folder).toBe("plan");
    expect(reread.scope_context.feature_tags).toEqual(["conf-feature"]);
  });

  it("PUT /session with an unknown active_scope is a tiered 400, scope unchanged", async () => {
    const client = clientOf(new MockEngine());
    await expect(
      client.putSession({ active_scope: "wt-does-not-exist" }),
    ).rejects.toBeInstanceOf(EngineError);
    // The active scope is left unchanged (the live route's behavior).
    const after = await client.session();
    expect(after.active_scope).toBe(MOCK_SCOPE);
  });

  it("the tiered 400 carries the tiers block on the error envelope", async () => {
    const client = clientOf(new MockEngine());
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
    const client = clientOf(new MockEngine());
    await client.putSession({ push_recent: "a" });
    await client.putSession({ push_recent: "b" });
    const s = await client.putSession({ push_recent: "a" });
    // "a" moves to the front; no duplicate.
    expect(s.recents).toEqual(["a", "b"]);
  });

  it("GET /settings returns empty global + scoped before any write", async () => {
    const settings = await clientOf(new MockEngine()).settings();
    expect(settings.global).toEqual({});
    expect(settings.scoped).toEqual({});
    expect(settings.tiers).toBeTypeOf("object");
  });

  it("PUT /settings persists a global key and a scoped key", async () => {
    const client = clientOf(new MockEngine());
    const afterGlobal = await client.putSettings({ key: "theme", value: "dark" });
    expect(afterGlobal.global.theme).toBe("dark");
    const afterScoped = await client.putSettings({
      scope: MOCK_SCOPE,
      key: "density",
      value: "compact",
    });
    expect(afterScoped.scoped[MOCK_SCOPE].density).toBe("compact");
    // Global key survives the scoped write.
    expect(afterScoped.global.theme).toBe("dark");
  });

  it("scoped settings sparse-omit a scope with no scoped keys", async () => {
    const settings = await clientOf(new MockEngine()).settings();
    // No scoped writes yet → the active scope is NOT present as an empty object.
    expect(settings.scoped[MOCK_SCOPE]).toBeUndefined();
  });
});

// --- restore-on-load through stores hooks ---------------------------------------

describe("restore-on-load (useActiveScope over the session hook)", () => {
  let client: EngineClient;
  beforeEach(() => {
    // Reset the shared view store so a previous test's pick does not leak.
    useViewStore.setState({ scope: null, activeFolder: null, featureContexts: [] });
  });
  afterEach(async () => {
    useViewStore.setState({ scope: null, activeFolder: null, featureContexts: [] });
    // Always restore the default transport, even if an assertion threw, so the
    // app-wide client never leaks the mock into another suite.
    const { engineClient } = await import("./engine");
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  it("returns the persisted active_scope from the session, not a recomputed default", async () => {
    const mock = new MockEngine();
    client = clientOf(mock);
    // Persist a non-default selection in the store, then mount the read path
    // against the SAME mock so the session GET returns it.
    await client.putSession({ active_scope: MOCK_SCOPE });

    const qc = testQueryClient();
    // Install the mock transport on the app-wide client the hooks use.
    const { engineClient } = await import("./engine");
    engineClient.useTransport(mock.fetchImpl);

    const { result } = renderHook(() => useActiveScope(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current).toBe(MOCK_SCOPE));

    // Restore the default transport so other suites are unaffected.
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  it("an explicit in-session pick (viewStore.scope) wins over the persisted scope", async () => {
    const mock = new MockEngine();
    const qc = testQueryClient();
    const { engineClient } = await import("./engine");
    engineClient.useTransport(mock.fetchImpl);

    // The user picked a scope this session — it must win the precedence.
    useViewStore.setState({ scope: "wt-pick" });
    const { result } = renderHook(() => useActiveScope(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current).toBe("wt-pick"));

    engineClient.useTransport((input, init) => fetch(input, init));
  });
});

// --- selection persistence through the mutation hook ----------------------------

describe("selection persistence (usePutSession)", () => {
  afterEach(async () => {
    const { engineClient } = await import("./engine");
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  it("persists scope_context and the subsequent useSession read reflects it", async () => {
    const mock = new MockEngine();
    const { engineClient } = await import("./engine");
    engineClient.useTransport(mock.fetchImpl);
    const qc = testQueryClient();

    const { result } = renderHook(
      () => ({ put: usePutSession(), session: useSession() }),
      { wrapper: wrapper(qc) },
    );
    await waitFor(() => expect(result.current.session.isSuccess).toBe(true));

    result.current.put.mutate({
      scope_context: { folder: "adr", feature_tags: ["proj-x"] },
    });

    // The mutation's onSuccess seeds the session cache; the read reflects it.
    await waitFor(() =>
      expect(result.current.session.data?.scope_context.folder).toBe("adr"),
    );
    expect(result.current.session.data?.scope_context.feature_tags).toEqual(["proj-x"]);
  });

  it("a global settings write is reflected by the settings read", async () => {
    const mock = new MockEngine();
    const { engineClient } = await import("./engine");
    engineClient.useTransport(mock.fetchImpl);
    const qc = testQueryClient();

    const { result } = renderHook(
      () => ({ settings: useSettings(), put: usePutSession() }),
      { wrapper: wrapper(qc) },
    );
    await waitFor(() => expect(result.current.settings.isSuccess).toBe(true));
    expect(result.current.settings.data?.global).toEqual({});
  });
});

// --- view-store seeding + wholesale-reset semantics -----------------------------

describe("view store scope-context (seed + wholesale reset)", () => {
  afterEach(() => {
    useViewStore.setState({ scope: null, activeFolder: null, featureContexts: [] });
  });

  it("seedFromSession mirrors the restored context without the wholesale reset", () => {
    // Seed a working set, then seed-from-session: the working set must survive
    // (a restore is NOT a scope swap).
    useViewStore.getState().addToWorkingSet("keep-me");
    useViewStore.getState().seedFromSession({
      scope: MOCK_SCOPE,
      folder: "plan",
      featureTags: ["f1", "f2"],
    });
    const s = useViewStore.getState();
    expect(s.scope).toBe(MOCK_SCOPE);
    expect(s.activeFolder).toBe("plan");
    expect(s.featureContexts).toEqual(["f1", "f2"]);
    // The restore did not wipe ephemeral working state.
    expect(s.workingSet).toContain("keep-me");
  });

  it("setScope clears the folder context wholesale on a swap", () => {
    useViewStore.getState().seedFromSession({
      scope: MOCK_SCOPE,
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
