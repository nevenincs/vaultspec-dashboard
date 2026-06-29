// The mock-versus-live PARITY proof for the session/settings surface
// (user-state-persistence W04.P10.S34): a sample CAPTURED from the live
// `vaultspec serve` session/settings routes (the exact `{data, tiers}` shapes
// `conformance.rs` asserts engine-side) is fed through the SAME tolerant adapter
// the app uses, and must reconcile onto the internal shape. Tolerance is proven
// too: a sparse or already-internal (mock) body passes through without throwing.
// This is the mock-mirrors-live-wire-shape deliverable in executable form.

import { describe, expect, it } from "vitest";

import {
  SESSION_STRING_LIST_MAX_ITEMS,
  adaptSession,
  adaptSettings,
  adaptWorkspaces,
  unwrapEnvelope,
} from "./liveAdapters";
import { SCOPE_ID_MAX_CHARS } from "./scopeIdentity";
import { WORKSPACE_LAYOUT_BLOB_MAX_CHARS } from "../workspaceLayout";

const TIERS = {
  declared: { available: true },
  structural: { available: true },
  temporal: { available: true },
  semantic: { available: false, reason: "rag service down" },
};

// --- session parity --------------------------------------------------------------

describe("adaptSession (live session sample)", () => {
  // Captured verbatim from `vaultspec serve` GET /session after a PUT that set a
  // folder + feature_tags and pushed a recent — the exact `{data, tiers}`
  // envelope, snake_case throughout, that conformance.rs asserts.
  const liveSessionEnvelope = {
    data: {
      workspace: "Y:/repo/.git",
      active_scope: "Y:/repo",
      scope_context: {
        folder: "plan",
        feature_tags: ["conf-feature"],
        workspace_layout:
          '{"v":1,"tabs":[{"nodeId":"doc:plan","surface":"markdown"}],"active":"doc:plan"}',
      },
      recents: ["Y:/repo"],
    },
    tiers: TIERS,
  };

  it("unwraps the envelope and reconciles onto the internal session shape", () => {
    // The client's get/put path unwraps the envelope before the adapter runs.
    const session = adaptSession(unwrapEnvelope(liveSessionEnvelope));
    expect(session.workspace).toBe("Y:/repo/.git");
    expect(session.active_scope).toBe("Y:/repo");
    expect(session.scope_context.folder).toBe("plan");
    expect(session.scope_context.feature_tags).toEqual(["conf-feature"]);
    expect(session.scope_context.workspace_layout).toBe(
      liveSessionEnvelope.data.scope_context.workspace_layout,
    );
    expect(session.recents).toEqual(["Y:/repo"]);
    // Degradation truth rides through on tiers — the chrome never reads it raw.
    expect(session.tiers.semantic.available).toBe(false);
  });

  it("preserves the optional durable dock workspace layout from scope_context", () => {
    const layout = `{"v":1,"note":"${"x".repeat(SCOPE_ID_MAX_CHARS + 1)}"}`;
    const session = adaptSession({
      workspace: "Y:/repo/.git",
      active_scope: "Y:/repo",
      scope_context: {
        folder: null,
        feature_tags: [],
        workspace_layout: layout,
      },
      recents: [],
      tiers: TIERS,
    });

    expect(session.scope_context).toEqual({
      folder: null,
      feature_tags: [],
      workspace_layout: layout,
    });
  });

  it("normalizes session identities and scope context at the adapter boundary", () => {
    const session = adaptSession({
      workspace: " Y:/repo/.git ",
      active_scope: " Y:/repo ",
      active_workspace: " project-a ",
      scope_context: {
        folder: " plan ",
        feature_tags: [" feature-a ", "feature-a", "", 7, "feature-b"],
        workspace_layout: "   ",
      },
      recents: [" Y:/repo ", "Y:/repo", "", 42, "Y:/other"],
      tiers: TIERS,
    });

    expect(session).toMatchObject({
      workspace: "Y:/repo/.git",
      active_scope: "Y:/repo",
      active_workspace: "project-a",
      scope_context: {
        folder: "plan",
        feature_tags: ["feature-a", "feature-b"],
      },
      recents: ["Y:/repo", "Y:/other"],
    });
    expect(session.scope_context.workspace_layout).toBeUndefined();
  });

  it("bounds session identities, string lists, and workspace layout blobs separately", () => {
    const overlongIdentity = "x".repeat(SCOPE_ID_MAX_CHARS + 1);
    const oversizedLayout = "x".repeat(WORKSPACE_LAYOUT_BLOB_MAX_CHARS + 1);
    const session = adaptSession({
      workspace: overlongIdentity,
      active_scope: overlongIdentity,
      active_workspace: overlongIdentity,
      scope_context: {
        folder: overlongIdentity,
        feature_tags: Array.from(
          { length: SESSION_STRING_LIST_MAX_ITEMS + 1 },
          (_, index) => `feature-${index}`,
        ),
        workspace_layout: oversizedLayout,
      },
      recents: Array.from(
        { length: SESSION_STRING_LIST_MAX_ITEMS + 1 },
        (_, index) => `recent-${index}`,
      ),
      tiers: TIERS,
    });

    expect(session.workspace).toBe("");
    expect(session.active_scope).toBe("");
    expect(session.active_workspace).toBeNull();
    expect(session.scope_context.folder).toBeNull();
    expect(session.scope_context.feature_tags).toHaveLength(
      SESSION_STRING_LIST_MAX_ITEMS,
    );
    expect(session.scope_context.workspace_layout).toBeUndefined();
    expect(session.recents).toHaveLength(SESSION_STRING_LIST_MAX_ITEMS);
  });

  it("tolerates a fresh-store session: null folder, empty tags + recents", () => {
    // The live GET /session before any PUT (conformance asserts folder is null,
    // feature_tags and recents are empty arrays).
    const fresh = adaptSession(
      unwrapEnvelope({
        data: {
          workspace: "Y:/repo/.git",
          active_scope: "Y:/repo",
          scope_context: { folder: null, feature_tags: [] },
          recents: [],
        },
        tiers: TIERS,
      }),
    );
    expect(fresh.scope_context.folder).toBeNull();
    expect(fresh.scope_context.feature_tags).toEqual([]);
    expect(fresh.recents).toEqual([]);
  });

  it("tolerates a SPARSE body (older/best-effort recreate) without throwing", () => {
    // A corrupt→recreate-empty store, or an older engine, might omit
    // scope_context/recents entirely. The adapter must default to safe empties,
    // never throw — the prototype's corrupt-store-restores-as-empty path.
    const sparse = adaptSession({ active_scope: "Y:/repo", tiers: TIERS });
    expect(sparse.active_scope).toBe("Y:/repo");
    expect(sparse.scope_context).toEqual({ folder: null, feature_tags: [] });
    expect(sparse.recents).toEqual([]);
  });

  it("tolerates a non-object body, returning a fully-defaulted empty session", () => {
    const empty = adaptSession(undefined);
    expect(empty).toEqual({
      workspace: "",
      active_scope: "",
      // The active-workspace field defaults to null (dashboard-workspace-registry
      // ADR) so a sparse or older session restores as "no project selected yet".
      active_workspace: null,
      scope_context: { folder: null, feature_tags: [] },
      recents: [],
      recent_scopes: [],
      tiers: {},
    });
  });

  it("adapts the cross-project recent_scopes list, dropping malformed entries", () => {
    const session = adaptSession({
      workspace: "Y:/repo",
      active_scope: "Y:/repo",
      recent_scopes: [
        { workspace: "ws-a", scope: "Y:/dash/main" },
        { workspace: "ws-a", scope: "Y:/dash/main" }, // duplicate pair → deduped
        { workspace: "ws-b", scope: "Y:/engine/main" },
        { workspace: "", scope: "Y:/x" }, // empty workspace → dropped
        { scope: "Y:/y" }, // missing workspace → dropped
        "nope", // non-object → dropped
      ],
    });
    expect(session.recent_scopes).toEqual([
      { workspace: "ws-a", scope: "Y:/dash/main" },
      { workspace: "ws-b", scope: "Y:/engine/main" },
    ]);
  });

  it("defaults recent_scopes to an empty list when the wire omits it", () => {
    expect(adaptSession({ workspace: "Y:/repo" }).recent_scopes).toEqual([]);
  });
});

// --- workspace registry parity --------------------------------------------------

describe("adaptWorkspaces (workspace registry sample)", () => {
  it("normalizes workspace roots and drops malformed registry rows", () => {
    const workspaces = adaptWorkspaces({
      workspaces: [
        {
          id: " workspace-a ",
          label: " Main Project ",
          path: " Y:/repo ",
          is_launch: true,
          reachable: false,
          unreachable_reason: " missing path ",
        },
        {
          id: " workspace-b ",
          path: " Y:/other ",
          label: "   ",
        },
        {
          id: "   ",
          label: "missing id",
          path: "Y:/bad",
        },
        {
          id: "missing-path",
          label: "Missing path",
          path: "   ",
        },
        "not a root",
      ],
      active_workspace: " workspace-a ",
      tiers: TIERS,
    });

    expect(workspaces.workspaces).toEqual([
      {
        id: "workspace-a",
        label: "Main Project",
        path: "Y:/repo",
        is_launch: true,
        reachable: false,
        unreachable_reason: "missing path",
      },
      {
        id: "workspace-b",
        label: "workspace-b",
        path: "Y:/other",
        is_launch: false,
        reachable: true,
        unreachable_reason: null,
      },
    ]);
    expect(workspaces.active_workspace).toBe("workspace-a");
    expect(workspaces.tiers).toBe(TIERS);
  });

  it("normalizes a blank active workspace to null", () => {
    expect(
      adaptWorkspaces({ workspaces: [], active_workspace: "   ", tiers: TIERS }),
    ).toMatchObject({
      workspaces: [],
      active_workspace: null,
    });
  });
});

// --- settings parity -------------------------------------------------------------

describe("adaptSettings (live settings sample)", () => {
  // Captured verbatim from `vaultspec serve` GET /settings after a global write
  // and a scoped write — the exact `{data: {global, scoped}, tiers}` shape, with
  // `scoped` keyed by the scope token and sparse-omitting empty scopes.
  const liveSettingsEnvelope = {
    data: {
      global: { theme: "dark" },
      scoped: {
        "Y:/repo": { density: "compact" },
      },
    },
    tiers: TIERS,
  };

  it("unwraps the envelope and reconciles onto the internal settings shape", () => {
    const settings = adaptSettings(unwrapEnvelope(liveSettingsEnvelope));
    expect(settings.global).toEqual({ theme: "dark" });
    expect(settings.scoped["Y:/repo"]).toEqual({ density: "compact" });
    expect(settings.tiers.semantic.available).toBe(false);
  });

  it("tolerates empty global + scoped (before any write)", () => {
    const empty = adaptSettings(
      unwrapEnvelope({ data: { global: {}, scoped: {} }, tiers: TIERS }),
    );
    expect(empty.global).toEqual({});
    expect(empty.scoped).toEqual({});
  });

  it("tolerates a SPARSE body (missing global/scoped) without throwing", () => {
    const sparse = adaptSettings({ tiers: TIERS });
    expect(sparse.global).toEqual({});
    expect(sparse.scoped).toEqual({});
  });

  it("drops non-string values defensively, keeping the map a string→string", () => {
    // An older engine that serialized a non-string value must not corrupt the
    // typed map — the adapter keeps only string values.
    const settings = adaptSettings({
      global: { theme: "dark", broken: 42 },
      scoped: {},
      tiers: TIERS,
    });
    expect(settings.global).toEqual({ theme: "dark" });
  });
});
