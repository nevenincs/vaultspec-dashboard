// @vitest-environment happy-dom
//
// The bounded open-document tab slice (editor-dock-workspace P03). PURE store
// logic exercised directly — no engine surface, no double. Covers the VS Code
// provisional/permanent semantics, the cap + LRU eviction, neighbour activation
// on close, reorder reconciliation, and the scope-swap reset.

import { beforeEach, describe, expect, it } from "vitest";

import type { ContentView } from "../server/queries";
import {
  deriveDockDocPanelView,
  deriveDockTabHeaderView,
  deriveDockWorkspaceSyncPlan,
  dockTabTitle,
  restoreDocTabsIfEmpty,
} from "./tabs";
import { MAX_OPEN_DOCS, useViewStore } from "./viewStore";

function reset(): void {
  useViewStore.setState({ openDocs: [], activeDocId: null });
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
});
