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

import { useActiveScope } from "../../app/stage/Stage";
import { createLiveClient, liveScope } from "../../testing/liveClient";
import { useViewStore } from "../view/viewStore";
import { EngineError } from "./engine";
import { usePutSession, useSession, useSettings } from "./queries";

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
    await waitFor(() => expect(result.current).toBe(scope));
  });

  it("an explicit in-session pick (viewStore.scope) wins over the persisted scope", async () => {
    const qc = testQueryClient();
    // The user picked a scope this session — it must win the precedence.
    useViewStore.setState({ scope: "wt-pick" });
    const { result } = renderHook(() => useActiveScope(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current).toBe("wt-pick"));
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
    await waitFor(() => expect(result.current.session.isSuccess).toBe(true));

    result.current.put.mutate({
      scope_context: { folder: "adr", feature_tags: [tag] },
    });

    // The mutation's onSuccess seeds the session cache; the read reflects it.
    await waitFor(() =>
      expect(result.current.session.data?.scope_context.folder).toBe("adr"),
    );
    expect(result.current.session.data?.scope_context.feature_tags).toEqual([tag]);
  });

  it("the settings read resolves to an object-shaped global map", async () => {
    const qc = testQueryClient();
    const { result } = renderHook(
      () => ({ settings: useSettings(), put: usePutSession() }),
      { wrapper: wrapper(qc) },
    );
    await waitFor(() => expect(result.current.settings.isSuccess).toBe(true));
    expect(result.current.settings.data?.global).toBeTypeOf("object");
  });
});

// --- view-store seeding + wholesale-reset semantics -----------------------------
// Pure store logic — no engine surface; unchanged by the live migration.

describe("view store scope-context (seed + wholesale reset)", () => {
  afterEach(() => {
    useViewStore.setState({ scope: null, activeFolder: null, featureContexts: [] });
  });

  it("seedFromSession mirrors the restored context without the wholesale reset", () => {
    useViewStore.getState().addToWorkingSet("keep-me");
    useViewStore.getState().seedFromSession({
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

  it("setScope clears the folder context wholesale on a swap", () => {
    useViewStore.getState().seedFromSession({
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
