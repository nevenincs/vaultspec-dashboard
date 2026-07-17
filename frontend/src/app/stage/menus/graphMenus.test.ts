// Graph stage context-menu resolvers (W04.P11.S52): each resolver is a pure
// function of its entity descriptor, tested directly. Covers the canonical node
// resolver (shared with the inspector), meta-edge, island, and empty-canvas.

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createLiveClient, liveScope } from "../../../testing/liveClient";
import { usePinStore } from "../../../stores/view/pins";
import { useViewStore } from "../../../stores/view/viewStore";
import { islandMenu } from "../../islands/menus/islandMenu";
import { canvasMenu } from "./canvasMenu";
import { graphNodeMenu } from "./graphNodeMenu";
import { metaEdgeMenu } from "./metaEdgeMenu";

let scope: string;
let documentNodeId: string;

beforeAll(async () => {
  scope = await liveScope();
  const slice = await createLiveClient().graphQuery({ scope, granularity: "document" });
  const node = slice.nodes.find((entry) => entry.id.startsWith("doc:"));
  if (!node) {
    throw new Error("live graph-menu test fixture has no document node");
  }
  documentNodeId = node.id;
});

afterEach(async () => {
  useViewStore.setState({ openedIds: [], openDocs: [], activeDocId: null });
  usePinStore.setState({ pinnedIds: [] });
  await createLiveClient()
    .patchDashboardState({ scope, selected_ids: [] })
    .catch(() => undefined);
});

const byId = (actions: { id: string }[]) => actions.map((a) => a.id);
const find = <T extends { id: string }>(actions: T[], id: string): T => {
  const found = actions.find((a) => a.id === id);
  if (!found) throw new Error(`no action ${id} in [${byId(actions).join(", ")}]`);
  return found;
};

async function eventuallySelected(id: string): Promise<void> {
  let last: unknown;
  for (let i = 0; i < 20; i += 1) {
    const state = await createLiveClient().dashboardState(scope);
    last = state.selected_ids;
    if (state.selected_ids[0] === id) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`dashboard selection did not become ${id}; last=${String(last)}`);
}

describe("graphNodeMenu (canonical node resolver)", () => {
  const base = { kind: "node", id: " doc:alpha ", title: " Alpha " };

  it("offers focus / open-island / pin / expand-ego / copies by default", () => {
    const actions = graphNodeMenu(base);
    expect(byId(actions)).toEqual([
      "node:focus",
      "node:open",
      "node:pin",
      "node:expand-ego",
      "node:copy-title",
      "node:copy-document-name",
      "node:relate",
      "node:autofix-feature",
      "node:archive-feature",
    ]);
    expect(find(actions, "node:focus")).toMatchObject({
      label: { key: "common:actions.showOnCanvas" },
      section: "navigate",
    });
    expect(find(actions, "node:open").label).toEqual({ key: "common:actions.open" });
    expect(find(actions, "node:pin").label).toEqual({ key: "graph:actions.pinItem" });
    expect(find(actions, "node:expand-ego").label).toEqual({
      key: "graph:actions.addItemToWorkingSet",
    });
  });

  it("relate enables for a doc node with a different doc focused; archive only for feature nodes", () => {
    const relate = find(
      graphNodeMenu(base, { timeTravel: false, selectedNodeId: "doc:beta" }),
      "node:relate",
    );
    expect(relate.disabled).toBeUndefined();
    expect(relate.dispatch).toMatchObject({
      type: "relate:link",
      payload: { src: "alpha", dst: "beta" },
    });
    // A non-feature node cannot archive.
    expect(find(graphNodeMenu(base), "node:archive-feature").disabled).toBe(true);
    // A feature node archives its feature.
    const featArchive = find(
      graphNodeMenu({ kind: "node", id: "feature:dashboard" }),
      "node:archive-feature",
    );
    expect(featArchive.disabled).toBeUndefined();
    expect(featArchive.dispatch).toMatchObject({
      type: "ops:run",
      payload: {
        verb: "feature-archive",
        mode: "archive",
        body: { feature: "dashboard" },
      },
    });
  });

  it("toggles to close-island / unpin / collapse-ego from membership flags", () => {
    const open = byId(
      graphNodeMenu({ ...base, isOpen: true, isPinned: true, inWorkingSet: true }),
    );
    expect(open).toContain("node:close-island");
    expect(open).not.toContain("node:open");
    expect(open).toContain("node:unpin");
    expect(open).toContain("node:collapse-ego");
    const actions = graphNodeMenu({
      ...base,
      isOpen: true,
      isPinned: true,
      inWorkingSet: true,
    });
    expect(find(actions, "node:close-island").label).toEqual({
      key: "common:actions.close",
    });
    expect(find(actions, "node:unpin").label).toEqual({
      key: "graph:actions.unpinItem",
    });
    expect(find(actions, "node:collapse-ego").label).toEqual({
      key: "graph:actions.removeItemFromWorkingSet",
    });
  });

  it("gates every view-mutating action in time-travel; leaves focus/copy free", () => {
    const a = graphNodeMenu(base);
    expect(find(a, "node:open").disabledInTimeTravel).toBe(true);
    expect(find(a, "node:pin").disabledInTimeTravel).toBe(true);
    expect(find(a, "node:expand-ego").disabledInTimeTravel).toBe(true);
    expect(find(a, "node:focus").disabledInTimeTravel).toBeUndefined();
    expect(find(a, "node:copy-document-name").disabledInTimeTravel).toBeUndefined();
  });

  it("copies a document node's name as its public reference, never a raw id", () => {
    const copy = find(graphNodeMenu(base), "node:copy-document-name");
    expect(copy.label).toEqual({ key: "common:actions.copyDocumentName" });
    expect(copy.dispatch).toMatchObject({
      type: "action:copy",
      payload: { text: "alpha", what: "stem" },
    });
    // A non-document node has no approved public reference, so it omits the
    // action entirely rather than expose a raw internal id.
    expect(
      byId(graphNodeMenu({ kind: "node", id: "feature:dashboard" })),
    ).not.toContain("node:copy-document-name");
  });

  it("disables copy-title with a reason when there is no title", () => {
    const copyTitle = find(
      graphNodeMenu({ kind: "node", id: "n1" }),
      "node:copy-title",
    );
    expect(copyTitle.disabled).toBe(true);
    expect(copyTitle.disabledReason).toEqual({
      key: "graph:disabledReasons.chooseItemWithTitle",
    });
  });

  it("rejects non-node entities at resolver ingress", () => {
    expect(graphNodeMenu({ kind: "island", id: "doc:alpha" })).toEqual([]);
    expect(graphNodeMenu(null)).toEqual([]);
  });

  it("open opens the document as a PERMANENT dock tab and writes canonical selection", async () => {
    const action = find(
      graphNodeMenu({
        kind: "node",
        id: documentNodeId,
        title: "Document",
        scope,
      }),
      "node:open",
    );

    action.run?.();

    // Routes through the canonical activateEntity seam: a permanent #15 dock tab (not
    // the retired island LRU) plus the canonical dashboard selection.
    await eventuallySelected(documentNodeId);
    const openDocs = useViewStore.getState().openDocs;
    expect(openDocs.map((doc) => doc.nodeId)).toContain(documentNodeId);
    expect(openDocs.find((doc) => doc.nodeId === documentNodeId)?.provisional).toBe(
      false,
    );
  });

  it("close-island closes local chrome through the island seam", () => {
    useViewStore.setState({ openedIds: [documentNodeId] });
    const action = find(
      graphNodeMenu({
        kind: "node",
        id: documentNodeId,
        isOpen: true,
      }),
      "node:close-island",
    );

    action.run?.();

    expect(useViewStore.getState().openedIds).not.toContain(documentNodeId);
  });

  it("pin and unpin toggle through the pin seam", () => {
    const pin = find(
      graphNodeMenu({
        kind: "node",
        id: documentNodeId,
        isPinned: false,
      }),
      "node:pin",
    );
    pin.run?.();
    expect(usePinStore.getState().pinnedIds).toContain(documentNodeId);

    const unpin = find(
      graphNodeMenu({
        kind: "node",
        id: documentNodeId,
        isPinned: true,
      }),
      "node:unpin",
    );
    unpin.run?.();
    expect(usePinStore.getState().pinnedIds).not.toContain(documentNodeId);
  });
});

describe("metaEdgeMenu", () => {
  it("copies the summary when present, never a raw connection id", () => {
    const e = {
      kind: "meta-edge",
      id: " m1 ",
      summary: " 3 structural ",
    };
    expect(byId(metaEdgeMenu(e))).toEqual([
      "meta-edge:goto-src",
      "meta-edge:goto-dst",
      "meta-edge:copy-summary",
    ]);
    expect(find(metaEdgeMenu(e), "meta-edge:copy-summary").disabled).toBeUndefined();
  });

  it("disables copy-summary with a reason when absent", () => {
    const e = { kind: "meta-edge", id: "m1" };
    const summary = find(metaEdgeMenu(e), "meta-edge:copy-summary");
    expect(summary.disabled).toBe(true);
    expect(summary.disabledReason).toEqual({
      key: "graph:disabledReasons.chooseConnectionWithSummary",
    });
  });

  it("uses distinct actionable reasons when a connected item is unavailable", () => {
    const actions = metaEdgeMenu({ kind: "meta-edge", id: "m1" });
    expect(find(actions, "meta-edge:goto-src")).toMatchObject({
      label: { key: "graph:actions.showStartingItem" },
      disabled: true,
      disabledReason: { key: "graph:disabledReasons.startingItemUnavailable" },
    });
    expect(find(actions, "meta-edge:goto-dst")).toMatchObject({
      label: { key: "graph:actions.showRelatedItem" },
      disabled: true,
      disabledReason: { key: "graph:disabledReasons.relatedItemUnavailable" },
    });
  });

  it("rejects non-meta-edge entities at resolver ingress", () => {
    expect(metaEdgeMenu({ kind: "edge", id: "e1" })).toEqual([]);
    expect(metaEdgeMenu(null)).toEqual([]);
  });
});

describe("islandMenu", () => {
  it("offers focus / close / copy-id; close is gated in time-travel", () => {
    const e = { kind: "island", id: " doc:alpha " };
    expect(byId(islandMenu(e))).toEqual([
      "island:focus",
      "island:close",
      "island:copy-id",
    ]);
    expect(find(islandMenu(e), "island:close").disabledInTimeTravel).toBe(true);
    expect(find(islandMenu(e), "island:focus").disabledInTimeTravel).toBeUndefined();
  });

  it("closes local chrome through the island seam", () => {
    useViewStore.setState({ openedIds: ["doc:alpha"] });

    find(islandMenu({ kind: "island", id: "doc:alpha" }), "island:close").run?.();

    expect(useViewStore.getState().openedIds).not.toContain("doc:alpha");
  });

  it("rejects non-island entities at resolver ingress", () => {
    expect(islandMenu({ kind: "node", id: "doc:alpha" })).toEqual([]);
    expect(islandMenu(null)).toEqual([]);
  });
});

describe("canvasMenu", () => {
  it("offers camera verbs and clear-working-set without a second layout owner", () => {
    expect(byId(canvasMenu())).toEqual([
      "canvas:fit",
      "canvas:reset",
      "canvas:clear-selection",
      "canvas:clear-working-set",
      // The graph<->rail follow-mode tether, composed from the one shared builder
      // under its shared id (unified-action-plane), is natural on the canvas menu too.
      "view:follow-mode",
    ]);
  });

  it("gates only clear-working-set in time-travel; camera verbs are free", () => {
    const a = canvasMenu();
    expect(find(a, "canvas:clear-working-set").disabledInTimeTravel).toBe(true);
    expect(find(a, "canvas:fit").disabledInTimeTravel).toBeUndefined();
    expect(find(a, "canvas:reset").disabledInTimeTravel).toBeUndefined();
  });

  it("reuses the canonical graph command and working-set descriptors", () => {
    const actions = canvasMenu();
    expect(actions.slice(0, 4).map(({ label }) => label)).toEqual([
      { key: "graph:actions.fitToView" },
      { key: "graph:actions.resetView" },
      { key: "graph:actions.clearSelection" },
      { key: "graph:actions.clearWorkingSet" },
    ]);
  });
});
