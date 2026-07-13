// @vitest-environment happy-dom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { liveScope, liveTransport } from "../../../testing/liveClient";
import { engineClient } from "../engine";
import type {
  FiltersVocabulary,
  MapWorktree,
  TiersBlock,
  VaultTreeEntry,
} from "../engine";
import {
  deriveFileTreeLevelView,
  deriveFileTreeRootSurfaceState,
  deriveFiltersVocabularyView,
  deriveVaultTreeAvailability,
  deriveVaultTreeBrowserView,
  deriveVaultTreeSurfaceState,
  deriveWorkspaceMapAvailability,
  deriveWorkspaceMapPickerPresentationView,
  deriveWorkspaceMapSurfaceState,
  deriveWorktreePickerProjectRows,
  deriveWorktreePickerRecentRows,
  engineKeys,
  fileTreeChildStatusStyle,
  normalizeCodeFilesRequestIdentity,
  normalizeFileTreeRequestIdentity,
  normalizeFiltersVocabularyRequestIdentity,
  normalizeVaultTreeRequestIdentity,
  orderWorkspaceMapWorktrees,
  tierAvailabilityReason,
  useCodeFiles,
  useFileTree,
  useFiltersVocabulary,
  useFiltersVocabularyView,
  useVaultTree,
  useVaultTreeSurface,
  workspaceRootName,
} from "./index";
import { ENGINE_WAIT } from "../../../testing/timing";
import { testQueryClient, wrapper } from "./testFixtures";

afterEach(() => {
  engineClient.useTransport(liveTransport);
});

describe("deriveFiltersVocabularyView (filter UI vocabulary)", () => {
  const vocabulary: FiltersVocabulary = {
    relations: ["links"],
    tiers: ["declared"],
    doc_types: ["adr", "plan"],
    feature_tags: ["state", "search"],
    kinds: ["document"],
    date_bounds: { from: "2026-06-01", to: "2026-06-30" },
  };

  it("prepares facet lists and corpus bounds from the loaded vocabulary", () => {
    expect(deriveFiltersVocabularyView(vocabulary, false, false)).toEqual({
      vocabulary,
      loading: false,
      facetsLoading: false,
      docTypes: ["adr", "plan"],
      featureTags: ["state", "search"],
      statuses: [],
      planStates: [],
      health: [],
      dateBounds: { from: "2026-06-01", to: "2026-06-30" },
    });
  });

  it("keeps empty lists while the enabled query is loading", () => {
    expect(deriveFiltersVocabularyView(undefined, true, false)).toEqual({
      vocabulary: undefined,
      loading: true,
      facetsLoading: true,
      docTypes: [],
      featureTags: [],
      statuses: [],
      planStates: [],
      health: [],
      dateBounds: undefined,
    });
  });

  it("lets facet controls treat missing scope as loading rather than empty corpus", () => {
    expect(deriveFiltersVocabularyView(undefined, false, true)).toMatchObject({
      loading: false,
      facetsLoading: true,
      docTypes: [],
      featureTags: [],
    });
  });
});

describe("deriveVaultTreeAvailability (sidebar degradation, contract §2)", () => {
  const allUp: TiersBlock = {
    declared: { available: true },
    structural: { available: true },
    temporal: { available: true },
    semantic: { available: true },
  };

  it("reports no degradation when every canonical tier is available", () => {
    const a = deriveVaultTreeAvailability(allUp);
    expect(a.degraded).toBe(false);
    expect(a.degradedTiers).toEqual([]);
    expect(a.reasons).toEqual({});
  });

  it("degrades only on the structural tier; a down semantic/declared/temporal tier does NOT make documents unavailable", () => {
    // The vault tree LISTS DOCUMENTS — only the STRUCTURAL tier governs whether
    // they are listable. A down semantic (rag search) or declared ("building") tier
    // must not make the rail cry "documents unavailable" when every document is
    // present (structural up). This was the bug: reading all tiers fired the banner
    // whenever semantic search was off, inconsistent with the global/search surface.
    const searchDown = deriveVaultTreeAvailability({
      ...allUp,
      semantic: { available: false, reason: "rag service down" },
      declared: { available: false, reason: "declared tier building" },
    });
    expect(searchDown.degraded).toBe(false);
    expect(searchDown.degradedTiers).toEqual([]);

    // A down STRUCTURAL tier IS a real document-availability degradation.
    const structuralDown = deriveVaultTreeAvailability({
      ...allUp,
      structural: { available: false, reason: "graph rebuilding" },
    });
    expect(structuralDown.degraded).toBe(true);
    expect(structuralDown.degradedTiers).toEqual(["structural"]);
    expect(structuralDown.reasons.structural).toBe("graph rebuilding");
  });

  it("treats an ABSENT structural tier as degraded, but ignores absent semantic/temporal", () => {
    // Contract §2: absence of the document-content tier ≠ availability — documents
    // unknown ⇒ degraded. Absent semantic/temporal do not affect the document list.
    const structuralAbsent: TiersBlock = {
      declared: { available: true },
      temporal: { available: true },
      semantic: { available: true },
    };
    const a = deriveVaultTreeAvailability(structuralAbsent);
    expect(a.degraded).toBe(true);
    expect(a.degradedTiers).toEqual(["structural"]);

    // structural present + up, semantic/temporal absent ⇒ NOT degraded.
    const onlyStructural: TiersBlock = { structural: { available: true } };
    expect(deriveVaultTreeAvailability(onlyStructural).degraded).toBe(false);
  });

  it("returns the no-degradation default for a wholly absent block (transport fault)", () => {
    // A missing block is the query's ERROR state (rendered distinctly by the
    // sidebar), not every-tier-degraded — so the degraded banner does not also
    // fire on a bare transport failure.
    const a = deriveVaultTreeAvailability(undefined);
    expect(a.degraded).toBe(false);
    expect(a.degradedTiers).toEqual([]);
  });

  it("selects the first available degraded-tier reason in stores", () => {
    expect(
      tierAvailabilityReason({
        degradedTiers: ["temporal", "semantic"],
        reasons: { semantic: "rag offline" },
      }),
    ).toBe("rag offline");
    expect(
      tierAvailabilityReason({
        degradedTiers: ["structural"],
        reasons: {},
      }),
    ).toBe("");
  });
});

describe("left-rail root surface states", () => {
  const noDegradation = { degraded: false, degradedTiers: [], reasons: {} };
  const structuralDown = deriveWorkspaceMapAvailability({
    structural: { available: false, reason: "worktree missing" },
  });
  const wt = (id: string, extra?: Partial<MapWorktree>): MapWorktree => ({
    id,
    path: `/repo/${id}`,
    branch: id,
    has_vault: false,
    ...extra,
  });

  it("keeps workspace-map loading/error classification in stores", () => {
    expect(
      deriveWorkspaceMapSurfaceState(
        { isPending: true, isError: false },
        noDegradation,
      ),
    ).toBe("loading");
    expect(
      deriveWorkspaceMapSurfaceState(
        { isPending: false, isError: true },
        noDegradation,
      ),
    ).toBe("error");
    expect(
      deriveWorkspaceMapSurfaceState(
        { isPending: false, isError: true },
        structuralDown,
      ),
    ).toBe("ready");
  });

  it("projects worktree picker ordering, labels, and pending state in stores", () => {
    const ordered = orderWorkspaceMapWorktrees([
      wt("bare-z"),
      wt("vault-b", { has_vault: true }),
      wt("vault-a", { has_vault: true, is_default: true }),
      wt("bare-a", { degraded: ["structural"] }),
    ]);
    expect(ordered.map((worktree) => worktree.id)).toEqual([
      "vault-a",
      "vault-b",
      "bare-a",
      "bare-z",
    ]);

    const view = deriveWorkspaceMapPickerPresentationView({
      map: {
        repositories: [
          {
            path: "/repo",
            branches: [],
            worktrees: ordered,
          },
        ],
        tiers: {},
      },
      activeScope: "vault-a",
      pendingId: "vault-b",
      availability: structuralDown,
    });

    expect(view.triggerLabel).toBe("vault-b");
    expect(view.triggerAriaLabel).toBe("current location: vault-b, switching");
    // The pending-aware headline is the switch TARGET while switching, so the
    // trigger's git/path lines never mix the target's name with the outgoing
    // worktree's state.
    expect(view.headline?.id).toBe("vault-b");
    expect(view.triggerClassName).toBe(
      "flex w-full items-center rounded-fg-xs py-fg-1 text-left transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
    );
    expect(view.triggerLabelClassName).toBe(
      "min-w-0 flex-1 truncate text-left text-body-strong text-ink-muted",
    );
    expect(view.triggerIconClassName).toBe("shrink-0 text-ink-faint");
    expect(view.loadingClassName).toBe("px-fg-1 py-fg-0-5 text-label text-ink-faint");
    expect(view.errorRootClassName).toBe("space-y-fg-1 px-fg-1 py-fg-0-5");
    expect(view.errorLabelClassName).toBe("text-label text-state-broken");
    expect(view.retryButtonClassName).toBe(
      "rounded-fg-xs text-label text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    );
    expect(view.degradedLabel).toBe(
      "The worktree list is partly unavailable right now — worktree missing. Showing what loaded.",
    );
    expect(view.degradedClassName).toBe(
      "mt-fg-1 rounded-fg-xs bg-accent-subtle/40 px-fg-1 py-fg-0-5 text-caption text-ink-muted",
    );
    expect(view.rows.map((row) => row.worktree.id)).toEqual([
      "vault-a",
      "vault-b",
      "bare-a",
      "bare-z",
    ]);
    expect(view.rows[0]).toMatchObject({
      selectable: true,
      isActive: true,
      rowClassName:
        "flex w-full select-text items-center gap-fg-1 rounded-fg-xs px-fg-2 py-fg-0-5 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus bg-accent-subtle font-medium text-ink",
      activeCueClassName: "-ml-fg-1 h-3 w-0.5 shrink-0 rounded-full bg-accent",
      branchClassName: "min-w-0 truncate",
      badgeClassName: "shrink-0 text-ink-faint",
      degradedIconClassName: "flex shrink-0 items-center text-state-stale",
      pendingLabelClassName: "ml-auto shrink-0 text-caption text-ink-faint",
      defaultLabel: "·default",
      ariaLabel: "switch to vault-a, the default worktree, the current worktree",
    });
    expect(view.rows[1]).toMatchObject({
      isPending: true,
      rowClassName:
        "flex w-full select-text items-center gap-fg-1 rounded-fg-xs px-fg-2 py-fg-0-5 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus text-ink-muted hover:bg-paper-sunken hover:text-ink",
      activeCueClassName: "-ml-fg-1 h-3 w-0.5 shrink-0 rounded-full bg-transparent",
      pendingLabel: "switching…",
    });
    expect(view.rows[2]).toMatchObject({
      selectable: false,
      isDegraded: true,
      rowClassName:
        "flex w-full select-text items-center gap-fg-1 rounded-fg-xs px-fg-2 py-fg-0-5 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus cursor-not-allowed text-ink-faint/60",
      activeCueClassName: "-ml-fg-1 h-3 w-0.5 shrink-0 rounded-full bg-transparent",
      noVaultLabel: "·no vault",
      degradedTitle: "structural",
      ariaLabel: "bare-a — no vault here, shown for context only",
    });
  });

  it("projects worktree picker empty and single-scope states in stores", () => {
    expect(
      deriveWorkspaceMapPickerPresentationView({
        map: { repositories: [], tiers: {} },
        activeScope: null,
        pendingId: null,
        availability: noDegradation,
      }),
    ).toMatchObject({
      triggerLabel: "Pick a worktree…",
      triggerAriaLabel: "choose a project or worktree",
      emptyLabel: "No worktrees here yet — point the engine at a repository to begin.",
      singleScopeLabel: null,
    });

    expect(
      deriveWorkspaceMapPickerPresentationView({
        map: {
          repositories: [
            {
              path: "/repo",
              branches: [],
              worktrees: [wt("main", { has_vault: true })],
            },
          ],
          tiers: {},
        },
        activeScope: "main",
        pendingId: null,
        availability: noDegradation,
      }),
    ).toMatchObject({
      triggerLabel: "main",
      triggerLabelClassName:
        "min-w-0 flex-1 truncate text-left text-body-strong text-ink",
      emptyLabel: null,
      emptyClassName: "px-fg-2 py-fg-1 text-label text-ink-faint",
      singleScopeLabel: "This is the only worktree with a vault.",
      singleScopeClassName: "px-fg-2 py-fg-0-5 text-caption text-ink-faint",
    });
  });

  const projectRoot = (id: string, label: string, path: string, reachable = true) => ({
    id,
    label,
    path,
    is_launch: id === "ws-a",
    reachable,
    unreachable_reason: reachable ? null : "path is not a readable directory",
  });

  it("builds one cross-project Recent list, current first, attributed per project", () => {
    const rows = deriveWorktreePickerRecentRows({
      recentScopes: [
        { workspace: "ws-b", scope: "/code/engine/main" },
        { workspace: "ws-a", scope: "/code/dash/feature-x" },
        { workspace: "ws-a", scope: "/code/dash/main" },
      ],
      roots: [
        projectRoot("ws-a", "dashboard", "/code/dash"),
        projectRoot("ws-b", "engine", "/code/engine"),
      ],
      activeWorkspace: "ws-a",
      activeScope: "/code/dash/main",
    });
    // The current (ws-a, /code/dash/main) is prepended and marked current; the rest
    // follow in MRU order, deduped by the (workspace, scope) pair.
    expect(rows.map((r) => `${r.projectLabel}/${r.worktreeName}`)).toEqual([
      "dashboard/main",
      "engine/main",
      "dashboard/feature-x",
    ]);
    expect(rows[0]).toMatchObject({ isActive: true, sameProject: true });
    // A cross-project entry knows it is NOT the active project (so the row shows
    // the project name) and is reached by a workspace swap, not a worktree switch.
    expect(rows[1]).toMatchObject({
      workspace: "ws-b",
      worktreeName: "main",
      projectLabel: "engine",
      sameProject: false,
      isActive: false,
    });
    // The row's primary ink LEADS with the project on a cross-project entry, so
    // colliding basenames ("main" everywhere) stay distinguishable at a glance.
    expect(rows.map((r) => r.label)).toEqual(["main", "engine / main", "feature-x"]);
  });

  it("marks a recent in an unreachable project non-selectable", () => {
    const rows = deriveWorktreePickerRecentRows({
      recentScopes: [{ workspace: "ws-b", scope: "/gone/main" }],
      roots: [
        projectRoot("ws-a", "dashboard", "/code/dash"),
        projectRoot("ws-b", "engine", "/gone", false),
      ],
      activeWorkspace: "ws-a",
      activeScope: "/code/dash/main",
    });
    const crossProject = rows.find((r) => r.workspace === "ws-b");
    expect(crossProject?.selectable).toBe(false);
  });

  it("projects registered project rows with identity and active marker", () => {
    const rows = deriveWorktreePickerProjectRows(
      [
        {
          id: "ws-a",
          label: "dashboard",
          path: "/code/dashboard",
          is_launch: true,
          reachable: true,
          unreachable_reason: null,
        },
        {
          id: "ws-b",
          label: "",
          path: "/code/engine-worktrees/main",
          is_launch: false,
          reachable: false,
          unreachable_reason: "path is not a readable directory",
        },
      ],
      "ws-a",
    );
    expect(rows[0]).toMatchObject({
      id: "ws-a",
      label: "dashboard",
      isActive: true,
      selectable: true,
      title: "/code/dashboard",
    });
    // A `<repo>-worktrees/main` root derives the REPO identity ("engine"), so four
    // projects that are each `.../<repo>-worktrees/main` don't all read "main".
    // An unreachable root is non-selectable with an honest title.
    expect(rows[1]).toMatchObject({
      id: "ws-b",
      label: "engine",
      isActive: false,
      selectable: false,
      title: "/code/engine-worktrees/main — path is not a readable directory",
    });
  });

  it("derives unique project names from <repo>-worktrees/<branch> layouts", () => {
    // The engine auto-labels a root with its path basename; pass an explicit label
    // only to exercise the custom-label-wins branch.
    const name = (path: string, label?: string) =>
      workspaceRootName({ path, label: label ?? path.split("/").pop() ?? "" });
    // Four `.../<repo>-worktrees/main` roots that the engine all auto-labelled
    // "main" must read as their distinct repo identities, never four "main"s.
    expect(name("Y:/code/vaultspec-dashboard-worktrees/main")).toBe(
      "vaultspec-dashboard",
    );
    expect(name("Y:/code/aeat-worktrees/main")).toBe("aeat");
    expect(name("Y:/code/vaultspec-core-worktrees/main")).toBe("vaultspec-core");
    // A non-main branch keeps the branch suffix; a custom label still wins.
    expect(name("Y:/code/app-worktrees/feature-x")).toBe("app · feature-x");
    expect(name("Y:/code/app-worktrees/main", "My App")).toBe("My App");
  });

  it("keeps vault-tree transport failure distinct from tiered degradation", () => {
    expect(
      deriveVaultTreeSurfaceState({ isPending: true, isError: false }, noDegradation),
    ).toBe("loading");
    expect(
      deriveVaultTreeSurfaceState({ isPending: false, isError: true }, noDegradation),
    ).toBe("error");
    expect(
      deriveVaultTreeSurfaceState({ isPending: false, isError: true }, structuralDown),
    ).toBe("ready");
  });

  it("projects vault-tree browser groups and filter-empty state in the stores layer", () => {
    const entry = (
      path: string,
      docType: string,
      featureTags: string[],
    ): VaultTreeEntry => ({
      path,
      doc_type: docType,
      feature_tags: featureTags,
      dates: {},
    });
    const entries = [
      entry(".vault/plan/2026-01-08-grid-plan.md", "plan", ["grid"]),
      entry(".vault/research/2026-01-08-grid-research.md", "research", ["grid"]),
      entry(".vault/adr/2026-01-08-grid-adr.md", "adr", ["grid"]),
      entry(".vault/reference/2026-01-08-grid-reference.md", "reference", ["grid"]),
      entry(".vault/index/grid.index.md", "index", ["grid"]),
      entry(".vault/research/2026-01-08-loose-research.md", "research", []),
    ];

    const view = deriveVaultTreeBrowserView(entries, "GRID");
    expect(view.entries.map((item) => item.path)).toEqual([
      ".vault/plan/2026-01-08-grid-plan.md",
      ".vault/research/2026-01-08-grid-research.md",
      ".vault/adr/2026-01-08-grid-adr.md",
      ".vault/reference/2026-01-08-grid-reference.md",
      ".vault/index/grid.index.md",
    ]);
    expect(view.groups).toHaveLength(1);
    // index is excluded from the feature groups (terminology-standardization ADR
    // D5), so the grid feature counts its 4 displayable docs, not the index.
    expect(view.groups[0]).toMatchObject({ feature: "grid", count: 4 });
    // Doc-type sub-groups render in the canonical pipeline order (ADR D2) and never
    // include an `index` sub-group.
    expect(view.groups[0]!.docTypes.map((group) => group.docType)).toEqual([
      "research",
      "adr",
      "plan",
      "reference",
    ]);
    expect(deriveVaultTreeBrowserView(entries, "missing")).toMatchObject({
      activeFilter: "missing",
      entries: [],
      groups: [],
      filteredToNothing: true,
    });
    expect(deriveVaultTreeBrowserView(entries, "")).toMatchObject({
      activeFilter: "",
      filteredToNothing: false,
    });
    // The untagged research doc forms the trailing (untagged) group; the untagged-
    // looking index entry never creates a group of its own.
    const allGroups = deriveVaultTreeBrowserView(entries, "").groups;
    expect(allGroups.at(-1)?.feature).toBe("(untagged)");
    expect(
      allGroups.flatMap((group) => group.docTypes).map((sub) => sub.docType),
    ).not.toContain("index");
  });

  it("does not expose cached vault-tree data when no scope is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.vaultTree(""), { entries: [], tiers: {} });

    const { result } = renderHook(() => useVaultTree(null), {
      wrapper: wrapper(client),
    });

    expect(result.current.data).toBeUndefined();
  });

  it("does not expose cached code-files data when no scope is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.codeFiles(""), {
      entries: [],
      tiers: {},
      truncated: null,
    });

    const { result } = renderHook(() => useCodeFiles(null), {
      wrapper: wrapper(client),
    });

    expect(result.current.data).toBeUndefined();
  });

  it("normalizes code-files request identity like the vault tree", () => {
    expect(normalizeCodeFilesRequestIdentity(" scope-a ")).toEqual({
      scope: "scope-a",
    });
    expect(normalizeCodeFilesRequestIdentity(["scope-a"] as unknown).scope).toBeNull();
  });

  it("useCodeFiles walks the code-files listing to completion over the live wire", async () => {
    // The reader holds the COMPLETE listing (walked to completion), so the
    // files(code) provider narrows the whole set. On the vault-only fixture the
    // code corpus is empty (no source files), but the assertions are shape-safe
    // whether empty or populated: an entries array the client drained, honest
    // null truncation well below the walk ceiling, and every entry a navigable
    // `code:{path}` node.
    const scope = await liveScope();
    const client = testQueryClient();
    const { result } = renderHook(() => useCodeFiles(scope), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true), ENGINE_WAIT);
    const data = result.current.data!;
    expect(Array.isArray(data.entries)).toBe(true);
    expect(data.truncated).toBeNull();
    for (const entry of data.entries) {
      expect(entry.node_id).toBe(`code:${entry.path}`);
    }
  });

  it("normalizes vault-tree and filters vocabulary request identity", () => {
    expect(normalizeVaultTreeRequestIdentity(" scope-a ")).toEqual({
      scope: "scope-a",
    });
    expect(normalizeVaultTreeRequestIdentity(["scope-a"] as unknown).scope).toBeNull();
    expect(normalizeFiltersVocabularyRequestIdentity(" scope-a ")).toEqual({
      scope: "scope-a",
      corpus: "vault",
    });
    expect(normalizeFiltersVocabularyRequestIdentity(" scope-a ", "code")).toEqual({
      scope: "scope-a",
      corpus: "code",
    });
    expect(
      normalizeFiltersVocabularyRequestIdentity({ scope: "scope-a" } as unknown).scope,
    ).toBeNull();
  });

  it("does not expose cached vault-tree data for malformed runtime scope", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.vaultTree(""), {
      entries: [
        {
          path: ".vault/plan/cached.md",
          kind: "file",
          doc_type: "plan",
          feature_tags: ["cached"],
        },
      ],
      tiers: {},
    });

    const tree = renderHook(() => useVaultTree({ scope: "scope-a" }), {
      wrapper: wrapper(client),
    });
    const surface = renderHook(() => useVaultTreeSurface({ scope: "scope-a" }), {
      wrapper: wrapper(client),
    });

    expect(tree.result.current.data).toBeUndefined();
    expect(surface.result.current.tree.data).toBeUndefined();
    expect(surface.result.current.state).toBe("ready");
  });

  it("does not expose cached file-tree data when no scope or level is disabled", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.fileTree(""), {
      path: "",
      entries: [],
      truncated: null,
      tiers: {},
    });
    client.setQueryData(engineKeys.fileTree("scope-a", "src"), {
      path: "src",
      entries: [],
      truncated: null,
      tiers: {},
    });

    const noScope = renderHook(() => useFileTree(null), {
      wrapper: wrapper(client),
    });
    const disabledLevel = renderHook(() => useFileTree("scope-a", "src", false), {
      wrapper: wrapper(client),
    });

    expect(noScope.result.current.data).toBeUndefined();
    expect(disabledLevel.result.current.data).toBeUndefined();
  });

  it("normalizes file-tree request identity", () => {
    expect(normalizeFileTreeRequestIdentity(" scope-a ", "src", true)).toEqual({
      scope: "scope-a",
      path: "src",
      enabled: true,
    });
    expect(normalizeFileTreeRequestIdentity(" scope-a ", " src ", true)).toEqual({
      scope: "scope-a",
      path: "src",
      enabled: true,
    });
    expect(normalizeFileTreeRequestIdentity("scope-a", "   ", true)).toEqual({
      scope: "scope-a",
      path: undefined,
      enabled: true,
    });
    expect(normalizeFileTreeRequestIdentity("scope-a", undefined, true)).toEqual({
      scope: "scope-a",
      path: undefined,
      enabled: true,
    });
    expect(
      normalizeFileTreeRequestIdentity("scope-a", { path: "src" } as unknown, true),
    ).toEqual({
      scope: "scope-a",
      path: undefined,
      enabled: false,
    });
    expect(normalizeFileTreeRequestIdentity("scope-a", "src", 1 as unknown)).toEqual({
      scope: "scope-a",
      path: "src",
      enabled: false,
    });
  });

  it("does not expose cached file-tree data for malformed runtime path", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.fileTree("scope-a"), {
      path: "",
      entries: [],
      truncated: null,
      tiers: {},
    });
    client.setQueryData(engineKeys.fileTree("scope-a", "src"), {
      path: "src",
      entries: [
        {
          path: "src/app.ts",
          node_id: "code:src/app.ts",
          kind: "file",
        },
      ],
      truncated: null,
      tiers: {},
    });

    const { result } = renderHook(
      () => useFileTree("scope-a", { path: "src" } as unknown as string),
      {
        wrapper: wrapper(client),
      },
    );
    const trimmed = renderHook(() => useFileTree(" scope-a ", " src "), {
      wrapper: wrapper(client),
    });

    expect(result.current.data).toBeUndefined();
    expect(trimmed.result.current.data?.path).toBe("src");
    expect(trimmed.result.current.data?.entries[0]?.path).toBe("src/app.ts");
  });

  it("does not expose cached filters vocabulary when no valid scope is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.filters(""), {
      relations: [],
      tiers: [],
      doc_types: ["cached"],
      feature_tags: [],
      kinds: [],
      date_bounds: undefined,
    } satisfies FiltersVocabulary);

    const noScope = renderHook(() => useFiltersVocabulary(null), {
      wrapper: wrapper(client),
    });
    const malformedScope = renderHook(
      () => useFiltersVocabulary({ scope: "scope-a" }),
      {
        wrapper: wrapper(client),
      },
    );
    const malformedView = renderHook(
      () => useFiltersVocabularyView({ scope: "scope-a" }),
      {
        wrapper: wrapper(client),
      },
    );

    expect(noScope.result.current.data).toBeUndefined();
    expect(malformedScope.result.current.data).toBeUndefined();
    expect(malformedView.result.current).toMatchObject({
      vocabulary: undefined,
      facetsLoading: true,
      docTypes: [],
      featureTags: [],
    });
  });

  it("treats file-tree structural degradation as the terminal code-mode state", () => {
    expect(
      deriveFileTreeRootSurfaceState(
        { isPending: true, isError: false },
        noDegradation,
      ),
    ).toBe("loading");
    expect(
      deriveFileTreeRootSurfaceState(
        { isPending: false, isError: true },
        noDegradation,
      ),
    ).toBe("error");
    expect(
      deriveFileTreeRootSurfaceState(
        { isPending: false, isError: true },
        structuralDown,
      ),
    ).toBe("degraded");
    expect(
      deriveFileTreeRootSurfaceState(
        { isPending: false, isError: false },
        structuralDown,
      ),
    ).toBe("degraded");
  });

  it("projects one file-tree directory level into stable chrome inputs", () => {
    const retry = () => undefined;
    expect(deriveFileTreeLevelView(undefined, true, false, retry)).toEqual({
      state: "loading",
      entries: [],
      rows: [],
      truncated: null,
      loadingMessage: "reading the worktree…",
      errorTitle: "code tree unavailable",
      retryLabel: "try again",
      emptyMessage: "No source files in this worktree yet.",
      childLoadingMessage: "…",
      childErrorMessage: "could not list this directory.",
      truncationMessage: null,
      childLoadingClassName:
        "animate-pulse-live px-fg-1 py-fg-0-5 text-caption text-ink-faint",
      childErrorClassName: "px-fg-1 py-fg-0-5 text-caption text-state-broken",
      truncationClassName: "px-fg-1 py-fg-0-5 text-caption text-ink-faint",
      retry,
    });
    expect(deriveFileTreeLevelView(undefined, false, true, retry)).toEqual({
      state: "error",
      entries: [],
      rows: [],
      truncated: null,
      loadingMessage: "reading the worktree…",
      errorTitle: "code tree unavailable",
      retryLabel: "try again",
      emptyMessage: "No source files in this worktree yet.",
      childLoadingMessage: "…",
      childErrorMessage: "could not list this directory.",
      truncationMessage: null,
      childLoadingClassName:
        "animate-pulse-live px-fg-1 py-fg-0-5 text-caption text-ink-faint",
      childErrorClassName: "px-fg-1 py-fg-0-5 text-caption text-state-broken",
      truncationClassName: "px-fg-1 py-fg-0-5 text-caption text-ink-faint",
      retry,
    });
    expect(
      deriveFileTreeLevelView(
        { path: "", entries: [], truncated: null, tiers: {} },
        false,
        false,
        retry,
      ),
    ).toEqual({
      state: "empty",
      entries: [],
      rows: [],
      truncated: null,
      loadingMessage: "reading the worktree…",
      errorTitle: "code tree unavailable",
      retryLabel: "try again",
      emptyMessage: "No source files in this worktree yet.",
      childLoadingMessage: "…",
      childErrorMessage: "could not list this directory.",
      truncationMessage: null,
      childLoadingClassName:
        "animate-pulse-live px-fg-1 py-fg-0-5 text-caption text-ink-faint",
      childErrorClassName: "px-fg-1 py-fg-0-5 text-caption text-state-broken",
      truncationClassName: "px-fg-1 py-fg-0-5 text-caption text-ink-faint",
      retry,
    });
    const entry = {
      path: "src/main.ts",
      kind: "file" as const,
      has_children: false,
      node_id: "code:src/main.ts",
    };
    const truncated = {
      total_children: 20,
      returned_children: 10,
      reason: "child ceiling",
    };
    expect(
      deriveFileTreeLevelView(
        { path: "src", entries: [entry], truncated, tiers: {} },
        false,
        false,
        retry,
      ),
    ).toEqual({
      state: "ready",
      entries: [entry],
      rows: [{ entry, displayName: "main.ts" }],
      truncated,
      loadingMessage: "reading the worktree…",
      errorTitle: "code tree unavailable",
      retryLabel: "try again",
      emptyMessage: "No source files in this worktree yet.",
      childLoadingMessage: "…",
      childErrorMessage: "could not list this directory.",
      truncationMessage: "more here (20) — expand a subdirectory to narrow.",
      childLoadingClassName:
        "animate-pulse-live px-fg-1 py-fg-0-5 text-caption text-ink-faint",
      childErrorClassName: "px-fg-1 py-fg-0-5 text-caption text-state-broken",
      truncationClassName: "px-fg-1 py-fg-0-5 text-caption text-ink-faint",
      retry,
    });
    expect(fileTreeChildStatusStyle(2)).toEqual({ paddingLeft: "1.75rem" });
  });

  it("derives file-tree row display names in the stores level view", () => {
    const entries = [
      {
        path: "src/components/",
        kind: "dir" as const,
        has_children: true,
        node_id: "code:src/components",
      },
      {
        path: "src/components/Button.tsx",
        kind: "file" as const,
        has_children: false,
        node_id: "code:src/components/Button.tsx",
      },
    ];

    expect(
      deriveFileTreeLevelView(
        { path: "src", entries, truncated: null, tiers: {} },
        false,
        false,
      ).rows.map((row) => row.displayName),
    ).toEqual(["components", "Button.tsx"]);
  });
});
