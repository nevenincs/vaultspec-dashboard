// @vitest-environment happy-dom
//
// The bounded open-document tab slice (editor-dock-workspace P03). PURE store
// logic exercised directly — no engine surface, no double. Covers the VS Code
// provisional/permanent semantics, the cap + LRU eviction, neighbour activation
// on close, reorder reconciliation, and the scope-swap reset.

import { beforeEach, describe, expect, it } from "vitest";

import type { ContentView } from "../server/queries";
import {
  applyRenamedMarkdownDocWorkspace,
  activateDocTab,
  closeDocTab,
  deriveDockDocPanelView,
  deriveDockTabHeaderView,
  deriveDockWorkspaceSyncPlan,
  dockTabTitle,
  normalizeDockWorkspaceTabsView,
  normalizeWorkspaceLayoutBlob,
  openDocTab,
  parseWorkspaceTabs,
  previewDocTab,
  reorderDocTabs,
  restoreDocTabsIfEmpty,
  serializeWorkspaceTabs,
  WORKSPACE_LAYOUT_BLOB_MAX_CHARS,
} from "./tabs";
import {
  MAX_OPEN_DOCS,
  normalizeOpenDocs,
  normalizeViewerSurface,
  useViewStore,
  type OpenDoc,
} from "./viewStore";

function reset(): void {
  useViewStore.setState({
    openDocs: [],
    activeDocId: null,
    editorTarget: null,
    draftText: "",
    baseBlobHash: "",
    editorStatus: "idle",
  });
}

function ids(): string[] {
  return useViewStore.getState().openDocs.map((d) => d.nodeId);
}

describe("deriveDockTabHeaderView (Figma tab parity)", () => {
  it("renders the tab in the app type ramp, not dockview's default font", () => {
    const view = deriveDockTabHeaderView(true, "my-plan");
    // The parity-critical tokens: dock tabs must read in the centralized label
    // ramp + weight, identical to the kit Tab — never dockview's hardcoded 13px.
    expect(view.rootClassName).toContain("text-label");
    expect(view.rootClassName).toContain("font-medium");
  });

  it("encodes selection as ink weight (active=ink, inactive=ink-faint)", () => {
    expect(deriveDockTabHeaderView(true, "x").rootClassName).toContain("text-ink");
    expect(deriveDockTabHeaderView(false, "x").rootClassName).toContain(
      "text-ink-faint",
    );
  });

  it("names the close control by the tab title", () => {
    expect(deriveDockTabHeaderView(false, "my-plan").closeAriaLabel).toBe(
      "Close my-plan",
    );
  });
});

function content(patch: Partial<ContentView> = {}): ContentView {
  return {
    loading: false,
    errored: false,
    degraded: false,
    degradedTiers: [],
    reasons: {},
    path: ".vault/plan/2026-06-18-central-state-plan.md",
    blobHash: "hash-1",
    languageHint: "markdown",
    text: "---\ndate: 2026-06-18\n---\n# Central state\n",
    truncated: null,
    available: true,
    ...patch,
  };
}

beforeEach(reset);

describe("provisional (preview) tabs", () => {
  it("opens a single provisional tab and activates it", () => {
    useViewStore.getState().openDoc("doc:a", "markdown", false);
    const state = useViewStore.getState();
    expect(state.openDocs).toEqual([
      { nodeId: "doc:a", surface: "markdown", provisional: true },
    ]);
    expect(state.activeDocId).toBe("doc:a");
  });

  it("normalizes tab and editor node ids through the shared graph-id seam", () => {
    useViewStore.getState().openDoc(" doc:a ", "markdown", false);
    expect(ids()).toEqual(["doc:a"]);
    expect(useViewStore.getState().activeDocId).toBe("doc:a");

    useViewStore.getState().openDoc("   ", "markdown", true);
    expect(ids()).toEqual(["doc:a"]);

    useViewStore.getState().promoteDoc(" doc:a ");
    expect(useViewStore.getState().openDocs[0]?.provisional).toBe(false);

    useViewStore.getState().openDoc("doc:b", "markdown", true);
    useViewStore.getState().reorderDocs([" doc:b ", "doc:a"]);
    expect(ids()).toEqual(["doc:b", "doc:a"]);

    useViewStore.getState().activateDoc(" doc:a ");
    expect(useViewStore.getState().activeDocId).toBe("doc:a");

    useViewStore.getState().openEditor(" doc:a ", "body", "hash-a");
    expect(useViewStore.getState().editorTarget).toEqual({ nodeId: "doc:a" });

    useViewStore.getState().closeDoc(" doc:a ");
    expect(ids()).toEqual(["doc:b"]);
  });

  it("normalizes public tab intent inputs at the seam", async () => {
    await expect(previewDocTab(" doc:preview ", "unknown")).resolves.toBe(false);
    expect(useViewStore.getState()).toMatchObject({
      openDocs: [{ nodeId: "doc:preview", surface: "markdown", provisional: true }],
      activeDocId: "doc:preview",
    });

    await expect(openDocTab(" code:src/app.ts ", "code")).resolves.toBe(false);
    expect(useViewStore.getState()).toMatchObject({
      activeDocId: "code:src/app.ts",
    });
    expect(useViewStore.getState().openDocs.at(-1)).toMatchObject({
      nodeId: "code:src/app.ts",
      surface: "code",
      provisional: false,
    });

    activateDocTab(" doc:preview ");
    expect(useViewStore.getState().activeDocId).toBe("doc:preview");

    reorderDocTabs([" code:src/app.ts ", "doc:preview", "missing"]);
    expect(ids()).toEqual(["code:src/app.ts", "doc:preview"]);
    reorderDocTabs(null);
    expect(ids()).toEqual(["code:src/app.ts", "doc:preview"]);

    closeDocTab(" code:src/app.ts ");
    expect(ids()).toEqual(["doc:preview"]);
    expect(await openDocTab("   ", "markdown")).toBe(false);
    expect(ids()).toEqual(["doc:preview"]);
  });

  it("normalizes runtime tab state projections before consumption", () => {
    expect(normalizeViewerSurface("code")).toBe("code");
    expect(normalizeViewerSurface("unknown")).toBe("markdown");
    expect(normalizeOpenDocs(null)).toEqual([]);
    expect(normalizeDockWorkspaceTabsView(null, "doc:a")).toEqual({
      openDocs: [],
      activeDocId: null,
    });
  });

  it("replaces the provisional tab in place rather than spawning a new one", () => {
    useViewStore.getState().openDoc("doc:a", "markdown", false);
    useViewStore.getState().openDoc("doc:b", "markdown", false);
    expect(ids()).toEqual(["doc:b"]);
    expect(useViewStore.getState().activeDocId).toBe("doc:b");
    expect(useViewStore.getState().openDocs[0]?.provisional).toBe(true);
  });

  it("keeps a permanent tab when a new provisional opens beside it", () => {
    useViewStore.getState().openDoc("doc:a", "markdown", true);
    useViewStore.getState().openDoc("doc:b", "markdown", false);
    expect(ids()).toEqual(["doc:a", "doc:b"]);
    expect(useViewStore.getState().openDocs[1]?.provisional).toBe(true);
  });
});

describe("promotion to permanent", () => {
  it("promotes the provisional tab on a permanent (double-click) open", () => {
    useViewStore.getState().openDoc("doc:a", "markdown", false);
    useViewStore.getState().openDoc("doc:a", "markdown", true);
    expect(ids()).toEqual(["doc:a"]);
    expect(useViewStore.getState().openDocs[0]?.provisional).toBe(false);
  });

  it("promoteDoc clears the provisional flag", () => {
    useViewStore.getState().openDoc("doc:a", "markdown", false);
    useViewStore.getState().promoteDoc("doc:a");
    expect(useViewStore.getState().openDocs[0]?.provisional).toBe(false);
  });
});

describe("cap and LRU eviction", () => {
  it("never exceeds MAX_OPEN_DOCS and evicts the oldest non-active permanent tab", () => {
    for (let i = 0; i < MAX_OPEN_DOCS + 3; i += 1) {
      useViewStore.getState().openDoc(`doc:${i}`, "markdown", true);
    }
    const open = ids();
    expect(open.length).toBe(MAX_OPEN_DOCS);
    // The most-recent (active) tab survives; the oldest were evicted.
    expect(open).toContain(`doc:${MAX_OPEN_DOCS + 2}`);
    expect(open).not.toContain("doc:0");
    expect(useViewStore.getState().activeDocId).toBe(`doc:${MAX_OPEN_DOCS + 2}`);
  });
});

describe("close and neighbour activation", () => {
  it("activates the next tab when the active one closes", () => {
    useViewStore.getState().openDoc("doc:a", "markdown", true);
    useViewStore.getState().openDoc("doc:b", "markdown", true);
    useViewStore.getState().openDoc("doc:c", "markdown", true);
    useViewStore.getState().activateDoc("doc:b");
    useViewStore.getState().closeDoc("doc:b");
    expect(ids()).toEqual(["doc:a", "doc:c"]);
    expect(useViewStore.getState().activeDocId).toBe("doc:c");
  });

  it("activates the previous tab when the last active one closes", () => {
    useViewStore.getState().openDoc("doc:a", "markdown", true);
    useViewStore.getState().openDoc("doc:b", "markdown", true);
    useViewStore.getState().closeDoc("doc:b");
    expect(useViewStore.getState().activeDocId).toBe("doc:a");
  });

  it("clears the active id when the only tab closes", () => {
    useViewStore.getState().openDoc("doc:a", "markdown", true);
    useViewStore.getState().closeDoc("doc:a");
    expect(ids()).toEqual([]);
    expect(useViewStore.getState().activeDocId).toBeNull();
  });
});

describe("rename re-key", () => {
  it("re-keys the tab and editor through one dock workspace operation", async () => {
    useViewStore.getState().openDoc("doc:old", "markdown", true);
    useViewStore.getState().openEditor("doc:old", "edited body", "hash-old");

    await expect(
      applyRenamedMarkdownDocWorkspace(
        {
          oldNodeId: "doc:old",
          newNodeId: "doc:new",
          newBlobHash: "hash-new",
        },
        "edited body",
        null,
      ),
    ).resolves.toBe(false);

    expect(useViewStore.getState()).toMatchObject({
      openDocs: [{ nodeId: "doc:new", surface: "markdown", provisional: false }],
      activeDocId: "doc:new",
      editorTarget: { nodeId: "doc:new" },
      draftText: "edited body",
      baseBlobHash: "hash-new",
    });
  });
});

describe("reorder reconciliation", () => {
  it("reorders open docs to match a dockview order and drops unknown ids", () => {
    useViewStore.getState().openDoc("doc:a", "markdown", true);
    useViewStore.getState().openDoc("doc:b", "markdown", true);
    useViewStore.getState().openDoc("doc:c", "markdown", true);
    useViewStore.getState().reorderDocs(["doc:c", "doc:a", "doc:gone", "doc:b"]);
    expect(ids()).toEqual(["doc:c", "doc:a", "doc:b"]);
  });
});

describe("dock workspace projection", () => {
  it("derives stable dock tab titles from node ids", () => {
    expect(dockTabTitle("doc:2026-06-18-central-state-plan")).toBe(
      "2026-06-18-central-state-plan",
    );
    expect(dockTabTitle("code:frontend/src/app/stage/DockWorkspace.tsx")).toBe(
      "DockWorkspace.tsx",
    );
    expect(dockTabTitle("feature:state")).toBe("feature:state");
  });

  it("plans dockview panel removal, additions, and active tab from tab state", () => {
    const plan = deriveDockWorkspaceSyncPlan(
      [
        { nodeId: "doc:a", surface: "markdown", provisional: false },
        { nodeId: "code:src/app.ts", surface: "code", provisional: false },
      ],
      "code:src/app.ts",
      ["__graph__", "doc:stale"],
      "__graph__",
    );

    expect(plan.removeIds).toEqual(["doc:stale"]);
    expect(plan.addPanels).toEqual([
      {
        id: "doc:a",
        component: "doc",
        title: "a",
        params: { nodeId: "doc:a", surface: "markdown" },
        position: { referencePanel: "__graph__", direction: "left" },
      },
      {
        id: "code:src/app.ts",
        component: "doc",
        title: "app.ts",
        params: { nodeId: "code:src/app.ts", surface: "code" },
        position: { referencePanel: "doc:a", direction: "within" },
      },
    ]);
    expect(plan.activeDocId).toBe("code:src/app.ts");
  });

  it("normalizes malformed dock tab reads before layout projection", () => {
    const openDocs = [
      null,
      { nodeId: " doc:a ", surface: "markdown", provisional: "yes" },
      { nodeId: "doc:a", surface: "code", provisional: false },
      { nodeId: "code:src/app.ts", surface: "code", provisional: true },
      { nodeId: "   ", surface: "markdown", provisional: false },
      { nodeId: "doc:b", surface: "unknown", provisional: false },
    ] as unknown as OpenDoc[];

    const normalized = normalizeDockWorkspaceTabsView(openDocs, " code:src/app.ts ");

    expect(normalized).toEqual({
      openDocs: [
        { nodeId: "doc:a", surface: "markdown", provisional: false },
        { nodeId: "code:src/app.ts", surface: "code", provisional: true },
        { nodeId: "doc:b", surface: "markdown", provisional: false },
      ],
      activeDocId: "code:src/app.ts",
    });

    const plan = deriveDockWorkspaceSyncPlan(
      openDocs,
      " code:src/app.ts ",
      ["__graph__", "doc:stale"],
      "__graph__",
    );

    expect(plan.removeIds).toEqual(["doc:stale"]);
    expect(plan.addPanels.map((panel) => panel.id)).toEqual([
      "doc:a",
      "code:src/app.ts",
      "doc:b",
    ]);
    expect(plan.activeDocId).toBe("code:src/app.ts");
  });

  it("tabs new panels into an existing document group", () => {
    const plan = deriveDockWorkspaceSyncPlan(
      [
        { nodeId: "doc:a", surface: "markdown", provisional: false },
        { nodeId: "doc:b", surface: "markdown", provisional: false },
      ],
      "doc:b",
      ["__graph__", "doc:a"],
      "__graph__",
    );

    expect(plan.removeIds).toEqual([]);
    expect(plan.addPanels).toEqual([
      {
        id: "doc:b",
        component: "doc",
        title: "b",
        params: { nodeId: "doc:b", surface: "markdown" },
        position: { referencePanel: "doc:a", direction: "within" },
      },
    ]);
  });
});

describe("dock document panel projection", () => {
  it("projects code panels without a markdown header", () => {
    const view = deriveDockDocPanelView(
      "code:frontend/src/main.ts",
      "code",
      "scope-a",
      content({ path: "frontend/src/main.ts", languageHint: "ts" }),
    );

    expect(view).toMatchObject({
      state: "code",
      nodeId: "code:frontend/src/main.ts",
      scope: "scope-a",
      header: null,
    });
  });

  it("projects markdown panels with the stores markdown header view", () => {
    const view = deriveDockDocPanelView(
      "doc:2026-06-18-central-state-plan",
      "markdown",
      "scope-a",
      content(),
    );

    expect(view).toMatchObject({
      state: "markdown",
      nodeId: "doc:2026-06-18-central-state-plan",
      scope: "scope-a",
      header: {
        title: "central state plan",
        category: "plan",
        categoryLabel: "plan",
      },
    });
  });

  it("normalizes runtime dock panel projection inputs", () => {
    const view = deriveDockDocPanelView(
      " doc:2026-06-18-central-state-plan ",
      "unknown",
      " scope-a ",
      content(),
    );

    expect(view).toMatchObject({
      state: "markdown",
      nodeId: "doc:2026-06-18-central-state-plan",
      scope: "scope-a",
      header: {
        title: "central state plan",
      },
    });

    const malformed = deriveDockDocPanelView(
      { id: "doc:bad" },
      "code",
      { scope: "scope-a" },
      content({ path: "frontend/src/main.ts", languageHint: "ts" }),
    );

    expect(malformed).toMatchObject({
      state: "code",
      nodeId: "",
      scope: null,
      header: null,
    });
  });
});

describe("scope-swap reset", () => {
  it("clears the tab collection on a wholesale scope swap", () => {
    useViewStore.getState().openDoc("doc:a", "markdown", true);
    useViewStore.getState().openDoc("doc:b", "markdown", false);
    useViewStore.getState().setScope("other-scope");
    expect(useViewStore.getState().openDocs).toEqual([]);
    expect(useViewStore.getState().activeDocId).toBeNull();
  });
});

describe("workspace persistence restore", () => {
  it("restores persisted tabs only when the tab slice is empty", () => {
    expect(
      restoreDocTabsIfEmpty(
        [{ nodeId: "doc:restored", surface: "markdown", provisional: false }],
        "doc:restored",
      ),
    ).toBe(true);
    expect(useViewStore.getState()).toMatchObject({
      openDocs: [{ nodeId: "doc:restored", surface: "markdown", provisional: false }],
      activeDocId: "doc:restored",
    });

    expect(
      restoreDocTabsIfEmpty(
        [{ nodeId: "doc:ignored", surface: "markdown", provisional: false }],
        "doc:ignored",
      ),
    ).toBe(false);
    expect(ids()).toEqual(["doc:restored"]);
  });

  it("normalizes restored tabs and their active id before seeding the store", () => {
    expect(
      restoreDocTabsIfEmpty(
        [
          { nodeId: " doc:restored ", surface: "markdown", provisional: false },
          { nodeId: "doc:restored", surface: "markdown", provisional: false },
          { nodeId: "   ", surface: "markdown", provisional: false },
          { nodeId: "code:src/app.ts", surface: "code", provisional: false },
        ],
        " code:src/app.ts ",
      ),
    ).toBe(true);

    expect(useViewStore.getState()).toMatchObject({
      openDocs: [
        { nodeId: "doc:restored", surface: "markdown", provisional: false },
        { nodeId: "code:src/app.ts", surface: "code", provisional: false },
      ],
      activeDocId: "code:src/app.ts",
    });
  });

  it("treats malformed current tab state as empty before restore", () => {
    useViewStore.setState({
      openDocs: [{ nodeId: "   ", surface: "markdown", provisional: false }],
      activeDocId: "   ",
    });

    expect(
      restoreDocTabsIfEmpty(
        [{ nodeId: " doc:restored ", surface: "markdown", provisional: false }],
        " doc:restored ",
      ),
    ).toBe(true);

    expect(useViewStore.getState()).toMatchObject({
      openDocs: [{ nodeId: "doc:restored", surface: "markdown", provisional: false }],
      activeDocId: "doc:restored",
    });
  });

  it("normalizes workspace layout serialization and parsing", () => {
    const blob = serializeWorkspaceTabs(
      [
        { nodeId: " doc:restored ", surface: "markdown", provisional: false },
        { nodeId: "doc:restored", surface: "markdown", provisional: false },
        { nodeId: "   ", surface: "markdown", provisional: false },
        { nodeId: "doc:preview", surface: "markdown", provisional: true },
        { nodeId: "code:src/app.ts", surface: "code", provisional: false },
      ],
      " code:src/app.ts ",
    );

    expect(JSON.parse(blob)).toEqual({
      v: 1,
      tabs: [
        { nodeId: "doc:restored", surface: "markdown" },
        { nodeId: "code:src/app.ts", surface: "code" },
      ],
      active: "code:src/app.ts",
    });
    expect(
      parseWorkspaceTabs(
        JSON.stringify({
          v: 1,
          tabs: [
            { nodeId: " doc:restored ", surface: "markdown" },
            { nodeId: "doc:restored", surface: "markdown" },
            { nodeId: 42, surface: "markdown" },
            { nodeId: "code:src/app.ts", surface: "code" },
          ],
          active: " code:src/app.ts ",
        }),
      ),
    ).toEqual({
      openDocs: [
        { nodeId: "doc:restored", surface: "markdown", provisional: false },
        { nodeId: "code:src/app.ts", surface: "code", provisional: false },
      ],
      activeDocId: "code:src/app.ts",
    });
  });

  it("bounds workspace layout blobs before parsing", () => {
    const oversized = "x".repeat(WORKSPACE_LAYOUT_BLOB_MAX_CHARS + 1);

    expect(normalizeWorkspaceLayoutBlob("  {\"v\":1}  ")).toBe("{\"v\":1}");
    expect(normalizeWorkspaceLayoutBlob(oversized)).toBeNull();
    expect(parseWorkspaceTabs(oversized)).toBeNull();
  });
});
