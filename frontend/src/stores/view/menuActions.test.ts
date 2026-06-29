import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createLiveClient, liveScope } from "../../testing/liveClient";
import { usePinStore } from "./pins";
import {
  clearMenuWorkingSet,
  closeMenuNodeIsland,
  collapseMenuWorkingSet,
  expandMenuWorkingSet,
  menuEntityScope,
  openMenuNodeIsland,
  toggleMenuPinnedNode,
} from "./menuActions";
import { useViewStore } from "./viewStore";

let scope: string;
let documentNodeId: string;

beforeAll(async () => {
  scope = await liveScope();
  const slice = await createLiveClient().graphQuery({ scope, granularity: "document" });
  const node = slice.nodes.find((entry) => entry.id.startsWith("doc:"));
  if (!node) {
    throw new Error("live menu-action test fixture has no document node");
  }
  documentNodeId = node.id;
});

async function eventuallyOpenedAndSelected(id: string): Promise<void> {
  let lastSelection: unknown;
  let lastOpened: unknown;
  for (let i = 0; i < 20; i += 1) {
    const state = await createLiveClient().dashboardState(scope);
    lastSelection = state.selected_ids;
    // The shared menu "Open" now opens a #15 dock tab (not the retired island), so the
    // open lands in openDocs (unified-selection D1).
    const openIds = useViewStore.getState().openDocs.map((d) => d.nodeId);
    lastOpened = openIds;
    if (state.selected_ids[0] === id && openIds.includes(id)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(
    `menu open did not select/open ${id}; selected=${String(lastSelection)} opened=${String(lastOpened)}`,
  );
}

describe("menu action seams", () => {
  beforeEach(() => {
    useViewStore.setState({
      openedIds: [],
      openDocs: [],
      activeDocId: null,
      workingSet: [],
      selection: null,
    });
    usePinStore.setState({ pinnedIds: [] });
  });

  it("reads optional entity scope without each resolver reimplementing it", () => {
    expect(menuEntityScope({ scope: " scope-a " })).toBe("scope-a");
    expect(menuEntityScope({ scope: null })).toBeNull();
    expect(menuEntityScope({ scope: { id: "scope-a" } })).toBeNull();
    expect(menuEntityScope({})).toBeUndefined();
  });

  it("routes node island close through the menu action seam", () => {
    useViewStore.setState({ openedIds: ["doc:a", "doc:b"] });

    closeMenuNodeIsland("doc:a");

    expect(useViewStore.getState().openedIds).toEqual(["doc:b"]);
  });

  it("opens a node island through the active scope when the entity has no scope field", async () => {
    useViewStore.getState().setScope(scope);
    await createLiveClient().patchDashboardState({ scope, selected_ids: [] });

    openMenuNodeIsland(documentNodeId);

    await eventuallyOpenedAndSelected(documentNodeId);
    expect(useViewStore.getState().selection).toBeNull();
  });

  it("routes pin toggles through the menu action seam", () => {
    toggleMenuPinnedNode("doc:a");
    expect(usePinStore.getState().pinnedIds).toEqual(["doc:a"]);

    toggleMenuPinnedNode("doc:a");
    expect(usePinStore.getState().pinnedIds).toEqual([]);
  });

  it("routes working-set expand, collapse, and clear through the menu action seam", () => {
    expandMenuWorkingSet("doc:a");
    expandMenuWorkingSet("doc:b");
    expect(useViewStore.getState().workingSet).toEqual(["doc:a", "doc:b"]);

    collapseMenuWorkingSet("doc:a");
    expect(useViewStore.getState().workingSet).toEqual(["doc:b"]);

    clearMenuWorkingSet();
    expect(useViewStore.getState().workingSet).toEqual([]);
  });
});
