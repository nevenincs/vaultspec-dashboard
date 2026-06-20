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
  useViewStore.setState({ openedIds: [] });
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
    expect(byId(graphNodeMenu(base))).toEqual([
      "node:focus",
      "node:open-island",
      "node:pin",
      "node:expand-ego",
      "node:copy-id",
      "node:copy-title",
    ]);
  });

  it("toggles to close-island / unpin / collapse-ego from membership flags", () => {
    const open = byId(
      graphNodeMenu({ ...base, isOpen: true, isPinned: true, inWorkingSet: true }),
    );
    expect(open).toContain("node:close-island");
    expect(open).not.toContain("node:open-island");
    expect(open).toContain("node:unpin");
    expect(open).toContain("node:collapse-ego");
  });

  it("gates every view-mutating action in time-travel; leaves focus/copy free", () => {
    const a = graphNodeMenu(base);
    expect(find(a, "node:open-island").disabledInTimeTravel).toBe(true);
    expect(find(a, "node:pin").disabledInTimeTravel).toBe(true);
    expect(find(a, "node:expand-ego").disabledInTimeTravel).toBe(true);
    expect(find(a, "node:focus").disabledInTimeTravel).toBeUndefined();
    expect(find(a, "node:copy-id").disabledInTimeTravel).toBeUndefined();
  });

  it("disables copy-title with a reason when there is no title", () => {
    const copyTitle = find(
      graphNodeMenu({ kind: "node", id: "n1" }),
      "node:copy-title",
    );
    expect(copyTitle.disabled).toBe(true);
    expect(copyTitle.disabledReason).toBe("no title");
  });

  it("rejects non-node entities at resolver ingress", () => {
    expect(graphNodeMenu({ kind: "island", id: "doc:alpha" })).toEqual([]);
    expect(graphNodeMenu(null)).toEqual([]);
  });

  it("open-island opens local chrome and writes canonical dashboard selection", async () => {
    const action = find(
      graphNodeMenu({
        kind: "node",
        id: documentNodeId,
        title: "Document",
        scope,
      }),
      "node:open-island",
    );

    action.run?.();

    await eventuallySelected(documentNodeId);
    expect(useViewStore.getState().openedIds).toContain(documentNodeId);
    expect(useViewStore.getState().selection).toBeNull();
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
  it("copies the summary when present, plus the id", () => {
    const e = {
      kind: "meta-edge",
      id: " m1 ",
      summary: " 3 structural ",
    };
    expect(byId(metaEdgeMenu(e))).toEqual([
      "meta-edge:copy-summary",
      "meta-edge:copy-id",
    ]);
    expect(find(metaEdgeMenu(e), "meta-edge:copy-summary").disabled).toBeUndefined();
  });

  it("disables copy-summary with a reason when absent", () => {
    const e = { kind: "meta-edge", id: "m1" };
    const summary = find(metaEdgeMenu(e), "meta-edge:copy-summary");
    expect(summary.disabled).toBe(true);
    expect(summary.disabledReason).toBe("no summary");
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
      "canvas:clear-working-set",
    ]);
  });

  it("gates only clear-working-set in time-travel; camera verbs are free", () => {
    const a = canvasMenu();
    expect(find(a, "canvas:clear-working-set").disabledInTimeTravel).toBe(true);
    expect(find(a, "canvas:fit").disabledInTimeTravel).toBeUndefined();
    expect(find(a, "canvas:reset").disabledInTimeTravel).toBeUndefined();
  });
});
