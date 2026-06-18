// @vitest-environment happy-dom
//
// The bounded open-document tab slice (editor-dock-workspace P03). PURE store
// logic exercised directly — no engine surface, no double. Covers the VS Code
// provisional/permanent semantics, the cap + LRU eviction, neighbour activation
// on close, reorder reconciliation, and the scope-swap reset.

import { beforeEach, describe, expect, it } from "vitest";

import { MAX_OPEN_DOCS, useViewStore } from "./viewStore";

function reset(): void {
  useViewStore.setState({ openDocs: [], activeDocId: null });
}

function ids(): string[] {
  return useViewStore.getState().openDocs.map((d) => d.nodeId);
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

describe("scope-swap reset", () => {
  it("clears the tab collection on a wholesale scope swap", () => {
    useViewStore.getState().openDoc("doc:a", "markdown", true);
    useViewStore.getState().openDoc("doc:b", "markdown", false);
    useViewStore.getState().setScope("other-scope");
    expect(useViewStore.getState().openDocs).toEqual([]);
    expect(useViewStore.getState().activeDocId).toBeNull();
  });
});
